//! SSH agent serving the SSH keys of every unlocked vault (OpenSSH agent protocol, draft-miller-ssh-agent).
//! Linux/macOS: Unix socket ~/.lightwarden-ssh-agent.sock (owner-only).
//! Windows: the pipe OpenSSH looks for, \\.\pipe\openssh-ssh-agent (the Windows "OpenSSH Authentication Agent" service must be off).
use crate::{show_main, updater::french, App};
use serde::Serialize;
use signature::{SignatureEncoding, Signer};
use ssh_encoding::Encode;
use ssh_key::{private::KeypairData, Algorithm, HashAlg, PrivateKey, Signature};
use std::{collections::HashSet, sync::Mutex, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

const FAILURE: u8 = 5;
const REQUEST_IDENTITIES: u8 = 11;
const IDENTITIES_ANSWER: u8 = 12;
const SIGN_REQUEST: u8 = 13;
const SIGN_RESPONSE: u8 = 14;
const RSA_SHA2_256: u32 = 2;
const RSA_SHA2_512: u32 = 4;
const MAX_MSG: usize = 256 * 1024;
const UNLOCK_WAIT: Duration = Duration::from_secs(60);

#[cfg(windows)]
pub const PIPE: &str = r"\\.\pipe\openssh-ssh-agent";

#[derive(Clone, Serialize, Default)]
pub struct Status {
    running: bool,
    address: String,
    error: String,
}

#[derive(Default)]
pub struct Agent {
    task: Option<tauri::async_runtime::JoinHandle<()>>,
    status: Status,
    approved: HashSet<Vec<u8>>, // key blobs allowed until the next lock ("remember until lock")
}
type A = Mutex<Agent>;

#[cfg(unix)]
pub fn socket_path() -> Option<std::path::PathBuf> {
    directories::UserDirs::new().map(|d| d.home_dir().join(".lightwarden-ssh-agent.sock"))
}

pub fn status(app: &AppHandle) -> Status {
    app.state::<A>().lock().unwrap().status.clone()
}

/// Forgets "remember until lock" approvals.
pub fn forget(app: &AppHandle) {
    app.state::<A>().lock().unwrap().approved.clear();
}

/// Starts or stops the agent to match the `ssh_agent` setting.
pub fn sync(app: &AppHandle) {
    let on = app.state::<Mutex<App>>().lock().unwrap().store.global.ssh_agent;
    let state = app.state::<A>();
    let mut g = state.lock().unwrap();
    if let Some(t) = g.task.take() {
        t.abort();
        #[cfg(unix)]
        if let Some(p) = socket_path() { let _ = std::fs::remove_file(p); }
    }
    g.status = match on.then(|| start(app)) {
        Some(Ok((task, address))) => { g.task = Some(task); Status { running: true, address, error: String::new() } }
        Some(Err(error)) => Status { error, ..Default::default() },
        None => Status::default(),
    };
    if !g.status.error.is_empty() { eprintln!("[ssh-agent] {}", g.status.error); }
    drop(g);
    let _ = app.emit("ssh-agent", status(app));
}

#[cfg(unix)]
fn start(app: &AppHandle) -> Result<(tauri::async_runtime::JoinHandle<()>, String), String> {
    use std::os::unix::fs::PermissionsExt;
    let path = socket_path().ok_or("Dossier personnel introuvable.")?;
    let _ = std::fs::remove_file(&path); // stale socket of a previous run (single instance is enforced)
    let _rt = tauri::async_runtime::handle().inner().enter();
    let listener = tokio::net::UnixListener::bind(&path).map_err(|e| format!("Impossible de créer {} ({e}).", path.display()))?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    let app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => { tauri::async_runtime::spawn(serve(app.clone(), stream)); }
                Err(e) => { eprintln!("[ssh-agent] accept: {e}"); tokio::time::sleep(Duration::from_millis(200)).await; }
            }
        }
    });
    Ok((task, path.display().to_string()))
}

#[cfg(windows)]
fn start(app: &AppHandle) -> Result<(tauri::async_runtime::JoinHandle<()>, String), String> {
    use tokio::net::windows::named_pipe::ServerOptions;
    let _rt = tauri::async_runtime::handle().inner().enter();
    let busy = |e: std::io::Error| format!(
        "Le canal {PIPE} est déjà utilisé, sans doute par le service Windows « OpenSSH Authentication Agent ». Désactivez-le (voir les instructions) puis réactivez l'agent. ({e})");
    let mut server = ServerOptions::new().first_pipe_instance(true).create(PIPE).map_err(busy)?;
    let app = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = server.connect().await { eprintln!("[ssh-agent] connect: {e}"); continue; }
            let next = match ServerOptions::new().create(PIPE) {
                Ok(s) => s,
                Err(e) => { eprintln!("[ssh-agent] pipe: {e}"); return; }
            };
            tauri::async_runtime::spawn(serve(app.clone(), std::mem::replace(&mut server, next)));
        }
    });
    Ok((task, PIPE.to_string()))
}

/// One client connection: length-prefixed requests, answered in order.
async fn serve<S: AsyncRead + AsyncWrite + Unpin>(app: AppHandle, mut s: S) {
    loop {
        let mut len = [0u8; 4];
        if s.read_exact(&mut len).await.is_err() { return; }
        let n = u32::from_be_bytes(len) as usize;
        if n == 0 || n > MAX_MSG { return; }
        let mut msg = vec![0u8; n];
        if s.read_exact(&mut msg).await.is_err() { return; }
        let a = app.clone();
        // blocking: may wait for an unlock or a user approval
        let reply = tauri::async_runtime::spawn_blocking(move || handle(&a, &msg)).await.unwrap_or_else(|_| vec![FAILURE]);
        let mut out = (reply.len() as u32).to_be_bytes().to_vec();
        out.extend(reply);
        if s.write_all(&out).await.is_err() { return; }
    }
}

pub fn handle(app: &AppHandle, msg: &[u8]) -> Vec<u8> {
    if !app.state::<Mutex<App>>().lock().unwrap().store.global.ssh_agent { return vec![FAILURE]; }
    let mut r = Reader(msg);
    let res = match r.u8() {
        Some(REQUEST_IDENTITIES) => Some(identities(app)),
        Some(SIGN_REQUEST) => (|| {
            let (blob, data) = (r.string()?, r.string()?);
            sign(app, blob, data, r.u32().unwrap_or(0))
        })(),
        _ => None, // other requests (add/remove keys, extensions…) are not supported: the vault is the source of keys
    };
    res.unwrap_or_else(|| vec![FAILURE])
}

struct VaultKey {
    name: String,
    key: PrivateKey,
    blob: Vec<u8>,
}

/// SSH keys of every unlocked account.
fn keys(app: &AppHandle) -> Vec<VaultKey> {
    let sessions: Vec<_> = app.state::<Mutex<App>>().lock().unwrap().sessions.values().cloned().collect();
    let mut out = vec![];
    for s in sessions {
        for it in s.lock().unwrap().vault.items.iter().filter(|i| i.kind == 5) {
            let Some(Ok(key)) = it.data.get("privateKey").map(|p| PrivateKey::from_openssh(p.trim())) else { continue };
            if key.is_encrypted() { continue; }
            let Ok(blob) = key.public_key().to_bytes() else { continue };
            if out.iter().any(|k: &VaultKey| k.blob == blob) { continue; }
            out.push(VaultKey { name: it.name.clone(), key, blob });
        }
    }
    out
}

/// No vault unlocked: bring the window up and give the user a minute to unlock.
fn wait_unlocked(app: &AppHandle) {
    let ready = |app: &AppHandle| {
        let a = app.state::<Mutex<App>>();
        let a = a.lock().unwrap();
        !a.sessions.is_empty() || a.store.accounts.is_empty()
    };
    if ready(app) { return; }
    show_main(app);
    let _ = app.emit("ssh-unlock-request", ());
    let t = Instant::now();
    while !ready(app) && t.elapsed() < UNLOCK_WAIT {
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn identities(app: &AppHandle) -> Vec<u8> {
    wait_unlocked(app);
    identities_answer(&keys(app))
}

fn identities_answer(ks: &[VaultKey]) -> Vec<u8> {
    let mut out = vec![IDENTITIES_ANSWER];
    out.extend((ks.len() as u32).to_be_bytes());
    for k in ks.iter() {
        put_string(&mut out, &k.blob);
        put_string(&mut out, k.name.as_bytes());
    }
    out
}

fn sign(app: &AppHandle, blob: &[u8], data: &[u8], flags: u32) -> Option<Vec<u8>> {
    let k = keys(app).into_iter().find(|k| k.blob == blob)?;
    if !approve(app, &k) { return None; }
    sign_answer(&k.key, data, flags)
}

fn sign_answer(key: &PrivateKey, data: &[u8], flags: u32) -> Option<Vec<u8>> {
    let sig = match key.key_data() {
        KeypairData::Rsa(k) => {
            // shortcut: legacy SHA-1 "ssh-rsa" (flags 0) gets rsa-sha2-512; servers refuse SHA-1 since OpenSSH 8.8 anyway.
            let sha256 = flags & RSA_SHA2_256 != 0 && flags & RSA_SHA2_512 == 0;
            let pk = rsa_private(k)?;
            let (hash, bytes) = if sha256 {
                (HashAlg::Sha256, rsa::pkcs1v15::SigningKey::<sha2::Sha256>::new(pk).try_sign(data).ok()?.to_vec())
            } else {
                (HashAlg::Sha512, rsa::pkcs1v15::SigningKey::<sha2::Sha512>::new(pk).try_sign(data).ok()?.to_vec())
            };
            Signature::new(Algorithm::Rsa { hash: Some(hash) }, bytes).ok()?
        }
        _ => key.try_sign(data).ok()?,
    };
    let mut enc = vec![];
    sig.encode(&mut enc).ok()?;
    let mut out = vec![SIGN_RESPONSE];
    put_string(&mut out, &enc);
    Some(out)
}

/// ssh-key 0.6.7 builds the RSA key with primes [p, p] (rejected by rsa 0.9.10): build it from the components ourselves.
fn rsa_private(k: &ssh_key::private::RsaKeypair) -> Option<rsa::RsaPrivateKey> {
    let b = |m: &ssh_key::Mpint| m.as_positive_bytes().map(rsa::BigUint::from_bytes_be);
    rsa::RsaPrivateKey::from_components(b(&k.public.n)?, b(&k.public.e)?, b(&k.private.d)?, vec![b(&k.private.p)?, b(&k.private.q)?]).ok()
}

fn approve(app: &AppHandle, k: &VaultKey) -> bool {
    let mode = app.state::<Mutex<App>>().lock().unwrap().store.global.ssh_approval; // 0 always ask, 1 until lock, 2 never
    if mode == 2 || (mode == 1 && app.state::<A>().lock().unwrap().approved.contains(&k.blob)) { return true; }
    let fr = french();
    let ok = app.dialog()
        .message(if fr {
            format!("Une application demande à utiliser la clé SSH « {} ».\n\nAutoriser cette connexion ?", k.name)
        } else {
            format!("An application wants to use the SSH key \"{}\".\n\nAllow this connection?", k.name)
        })
        .title(if fr { "Lightwarden — Agent SSH" } else { "Lightwarden — SSH agent" })
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            (if fr { "Autoriser" } else { "Allow" }).into(),
            (if fr { "Refuser" } else { "Deny" }).into(),
        ))
        .blocking_show();
    if ok && mode == 1 { app.state::<A>().lock().unwrap().approved.insert(k.blob.clone()); }
    ok
}

fn put_string(out: &mut Vec<u8>, s: &[u8]) {
    out.extend((s.len() as u32).to_be_bytes());
    out.extend(s);
}

struct Reader<'a>(&'a [u8]);
impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        if self.0.len() < n { return None; }
        let (a, b) = self.0.split_at(n);
        self.0 = b;
        Some(a)
    }
    fn u8(&mut self) -> Option<u8> { self.take(1).map(|b| b[0]) }
    fn u32(&mut self) -> Option<u32> { self.take(4).map(|b| u32::from_be_bytes(b.try_into().unwrap())) }
    fn string(&mut self) -> Option<&'a [u8]> { let n = self.u32()? as usize; self.take(n) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reader_rejects_truncated() {
        let mut r = Reader(&[0, 0, 0, 5, 1, 2]);
        assert!(r.string().is_none());
        let mut r = Reader(&[13, 0, 0, 0, 2, 7, 8, 0, 0, 1]);
        assert_eq!(r.u8(), Some(13));
        assert_eq!(r.string(), Some(&[7u8, 8][..]));
        assert!(r.u32().is_none());
    }

    /// Serves fixed keys on a socket and drives it with the real OpenSSH tools.
    #[cfg(unix)]
    #[test]
    fn works_with_openssh() {
        use std::{io::{Read, Write}, os::unix::net::UnixListener, process::Command};
        if Command::new("ssh-keygen").arg("-?").output().is_err() { eprintln!("skipped: no OpenSSH"); return; }
        let dir = std::env::temp_dir().join(format!("lw-agent-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let sock = dir.join("s");
        let mut rng = ssh_key::rand_core::OsRng;
        let ks: Vec<VaultKey> = [PrivateKey::random(&mut rng, Algorithm::Ed25519).unwrap(),
            { // ssh-key cannot generate ECDSA: use a key made by ssh-keygen, as users import them
                let f = dir.join("ec");
                assert!(Command::new("ssh-keygen").args(["-q", "-t", "ecdsa", "-N", "", "-f"]).arg(&f).status().unwrap().success());
                PrivateKey::read_openssh_file(&f).unwrap()
            },
            PrivateKey::new(KeypairData::Rsa(ssh_key::private::RsaKeypair::random(&mut rng, 2048).unwrap()), "").unwrap()]
            .into_iter().enumerate()
            .map(|(i, key)| VaultKey { name: format!("key{i}"), blob: key.public_key().to_bytes().unwrap(), key }).collect();
        let pubs: Vec<String> = ks.iter().map(|k| k.key.public_key().to_openssh().unwrap()).collect();
        let l = UnixListener::bind(&sock).unwrap();
        std::thread::spawn(move || for c in l.incoming() {
            let mut c = c.unwrap();
            loop {
                let mut len = [0u8; 4];
                if c.read_exact(&mut len).is_err() { break; }
                let mut msg = vec![0u8; u32::from_be_bytes(len) as usize];
                c.read_exact(&mut msg).unwrap();
                let mut r = Reader(&msg);
                let reply = match r.u8() {
                    Some(REQUEST_IDENTITIES) => Some(identities_answer(&ks)),
                    Some(SIGN_REQUEST) => {
                        let (b, d, f) = (r.string().unwrap(), r.string().unwrap(), r.u32().unwrap_or(0));
                        ks.iter().find(|k| k.blob == b).and_then(|k| sign_answer(&k.key, d, f))
                    }
                    _ => None,
                }.unwrap_or(vec![FAILURE]);
                c.write_all(&(reply.len() as u32).to_be_bytes()).unwrap();
                c.write_all(&reply).unwrap();
            }
        });
        let out = Command::new("ssh-add").arg("-L").env("SSH_AUTH_SOCK", &sock).output().unwrap();
        let listed = String::from_utf8_lossy(&out.stdout);
        for p in &pubs { assert!(listed.contains(p.split(' ').nth(1).unwrap()), "ssh-add -L: {listed}"); }
        std::fs::write(dir.join("msg"), b"hello").unwrap();
        for (i, p) in pubs.iter().enumerate() {
            let pk = dir.join(format!("k{i}.pub"));
            std::fs::write(&pk, p).unwrap();
            let st = Command::new("ssh-keygen").args(["-Y", "sign", "-U", "-n", "file", "-f"]).arg(&pk).arg(dir.join("msg"))
                .env("SSH_AUTH_SOCK", &sock).status().unwrap();
            assert!(st.success(), "sign with key {i}");
            std::fs::write(dir.join("allowed"), format!("me {p}\n")).unwrap();
            let st = Command::new("ssh-keygen").args(["-Y", "verify", "-I", "me", "-n", "file", "-f"]).arg(dir.join("allowed"))
                .arg("-s").arg(dir.join("msg.sig")).stdin(std::fs::File::open(dir.join("msg")).unwrap()).status().unwrap();
            assert!(st.success(), "verify key {i}");
            std::fs::remove_file(dir.join("msg.sig")).unwrap();
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn rsa_sha256_on_request() {
        let mut rng = ssh_key::rand_core::OsRng;
        let key = PrivateKey::new(KeypairData::Rsa(ssh_key::private::RsaKeypair::random(&mut rng, 2048).unwrap()), "").unwrap();
        let alg = |f| { let o = sign_answer(&key, b"x", f).unwrap(); let mut r = Reader(&o[1..]); let mut s = Reader(r.string().unwrap()); s.string().unwrap().to_vec() };
        assert_eq!(alg(RSA_SHA2_256), b"rsa-sha2-256");
        assert_eq!(alg(RSA_SHA2_512), b"rsa-sha2-512");
    }
}
