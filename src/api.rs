//! Bitwarden-compatible server API: login (2FA, new-device OTP), sync + decrypt, and vault writes.
use crate::crypto::{master_key, master_password_hash, Kdf, Key};
use crate::vault::{Hist, Item, ItemInput, Vault};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Map, Value};
use std::{collections::{BTreeMap, HashMap}, time::Duration};

#[derive(Clone)]
pub struct Server {
    identity: String,
    api: String,
}

#[derive(Clone)]
pub enum Pending {
    TwoFactor(i64),
    DeviceOtp,
}

pub enum LoginErr {
    Need(Pending),
    Msg(String),
}
impl From<String> for LoginErr {
    fn from(s: String) -> Self { LoginErr::Msg(s) }
}

pub fn server(kind: i32, url: &str) -> Result<Server, String> {
    let s = |i: &str, a: &str| Server { identity: i.into(), api: a.into() };
    match kind {
        0 => Ok(s("https://identity.bitwarden.com", "https://api.bitwarden.com")),
        1 => Ok(s("https://identity.bitwarden.eu", "https://api.bitwarden.eu")),
        _ => {
            let u = url.trim().trim_end_matches('/');
            if u.is_empty() {
                return Err("Saisissez l'URL du serveur.".into());
            }
            // The password hash is sent to this server: refuse cleartext HTTP except on loopback.
            let local = u.starts_with("http://localhost") || u.starts_with("http://127.0.0.1");
            if !u.starts_with("https://") && !local {
                return Err("L'URL du serveur doit commencer par https://".into());
            }
            Ok(s(&format!("{u}/identity"), &format!("{u}/api")))
        }
    }
}

/// Server JSON casing varies between versions (camelCase vs PascalCase).
fn g<'a>(v: &'a Value, k: &str) -> &'a Value {
    let pascal = format!("{}{}", k[..1].to_uppercase(), &k[1..]);
    v.get(k).filter(|x| !x.is_null()).unwrap_or(&v[pascal.as_str()])
}
fn gs(v: &Value, k: &str) -> String { g(v, k).as_str().unwrap_or("").to_string() }

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder().http_status_as_error(false).timeout_global(Some(Duration::from_secs(30))).build().into()
}
/// Cheap reachability probe (the identity server's discovery document).
pub fn reachable(srv: &Server) -> bool {
    let a: ureq::Agent = ureq::Agent::config_builder().http_status_as_error(false).timeout_global(Some(Duration::from_secs(6))).build().into();
    a.get(&format!("{}/.well-known/openid-configuration", srv.identity)).call().is_ok_and(|r| !matches!(r.status().as_u16(), 502..=504))
}
fn net(e: ureq::Error) -> String { format!("Impossible de joindre le serveur ({e}).") }

fn device_type() -> &'static str {
    if cfg!(target_os = "windows") { "6" } else if cfg!(target_os = "macos") { "7" } else { "8" }
}
// Servers hide newer item types (SSH keys) from clients that announce an older version.
const CLIENT_VERSION: &str = "2025.10.0";

// Per item type: JSON section and its encrypted string fields (login URIs are handled apart).
const LOGIN: &[&str] = &["username", "password", "totp"];
const CARD: &[&str] = &["cardholderName", "brand", "number", "expMonth", "expYear", "code"];
const IDENTITY: &[&str] = &["title", "firstName", "middleName", "lastName", "address1", "address2", "address3", "city", "state",
    "postalCode", "country", "company", "email", "phone", "ssn", "username", "passportNumber", "licenseNumber"];
const SSH: &[&str] = &["privateKey", "publicKey", "keyFingerprint"];
fn section(kind: i64) -> Option<(&'static str, &'static [&'static str])> {
    match kind {
        1 => Some(("login", LOGIN)),
        3 => Some(("card", CARD)),
        4 => Some(("identity", IDENTITY)),
        5 => Some(("sshKey", SSH)),
        _ => None,
    }
}

pub struct Session {
    srv: Server,
    access: String,
    refresh: String,
    key: Key,
    ciphers: HashMap<String, Value>, // raw encrypted ciphers by id: edits only re-encrypt the fields we change
    folder_ids: HashMap<String, String>, // decrypted path -> folder id
    raw: Value, // last /sync response (encrypted): lets a PIN unlock work offline
    pub vault: Vault,
    pub offline: bool, // the server was unreachable on the last call or probe
}

pub fn login(srv: &Server, email: &str, password: &str, device_id: &str, pending: Option<(Pending, &str)>) -> Result<Session, LoginErr> {
    let email = email.trim().to_lowercase();
    let a = agent();

    let mut r = a.post(&format!("{}/accounts/prelogin", srv.identity)).send_json(json!({ "email": email })).map_err(net)?;
    if !r.status().is_success() {
        return Err("Prélogin refusé par le serveur (URL incorrecte ?).".to_string().into());
    }
    let pre: Value = r.body_mut().read_json().map_err(|e| e.to_string())?;
    let n = |k: &str, d: u64| g(&pre, k).as_u64().unwrap_or(d) as u32;
    let kdf = if g(&pre, "kdf").as_u64() == Some(1) {
        Kdf::Argon2id { iterations: n("kdfIterations", 3), memory_mib: n("kdfMemory", 64), parallelism: n("kdfParallelism", 4) }
    } else {
        Kdf::Pbkdf2 { iterations: n("kdfIterations", 600_000) }
    };
    let mk = master_key(password, &email, &kdf)?;
    let hash = master_password_hash(&mk, password);

    let mut form: Vec<(&str, String)> = vec![
        ("grant_type", "password".into()), ("username", email.clone()), ("password", hash.clone()),
        ("scope", "api offline_access".into()), ("client_id", "desktop".into()),
        ("deviceType", device_type().into()), ("deviceName", "lightwarden".into()), ("deviceIdentifier", device_id.into()),
    ];
    match &pending {
        Some((Pending::TwoFactor(p), code)) => {
            form.push(("twoFactorToken", code.trim().into()));
            form.push(("twoFactorProvider", p.to_string()));
            form.push(("twoFactorRemember", "0".into()));
        }
        Some((Pending::DeviceOtp, code)) => form.push(("newDeviceOtp", code.trim().into())),
        None => {}
    }
    let mut r = a.post(&format!("{}/connect/token", srv.identity))
        .header("Auth-Email", URL_SAFE_NO_PAD.encode(&email))
        .header("Bitwarden-Client-Name", "desktop")
        .header("Bitwarden-Client-Version", CLIENT_VERSION)
        .header("Device-Type", device_type())
        .send_form(form.iter().map(|(k, v)| (*k, v.as_str()))).map_err(net)?;
    let status = r.status().as_u16();
    let tok: Value = r.body_mut().read_json().unwrap_or(Value::Null);
    if status != 200 {
        let msg = gs(g(&tok, "errorModel"), "message");
        let desc = gs(&tok, "error_description");
        if msg.to_lowercase().contains("new device verification") {
            return Err(LoginErr::Need(Pending::DeviceOtp));
        }
        if let Some(list) = g(&tok, "twoFactorProviders").as_array() {
            let ids: Vec<i64> = list.iter().filter_map(|x| x.as_i64().or_else(|| x.as_str()?.parse().ok())).collect();
            return match ids.iter().find(|p| **p == 0).or_else(|| ids.iter().find(|p| **p == 1)) {
                Some(0) => Err(LoginErr::Need(Pending::TwoFactor(0))),
                Some(_) => {
                    // best effort: ask the server to email the code
                    let _ = a.post(&format!("{}/two-factor/send-email-login", srv.api)).send_json(json!({ "email": email, "masterPasswordHash": hash }));
                    Err(LoginErr::Need(Pending::TwoFactor(1)))
                }
                None => Err("Cette méthode de double authentification n'est pas encore prise en charge (application d'authentification ou e-mail uniquement).".to_string().into()),
            };
        }
        let shown = if !msg.is_empty() { msg } else { desc };
        return Err(if shown.contains("invalid_username_or_password") || shown.is_empty() {
            "E-mail ou mot de passe maître incorrect.".to_string().into()
        } else { shown.into() });
    }

    let mut s = Session {
        srv: srv.clone(), access: gs(&tok, "access_token"), refresh: gs(&tok, "refresh_token"),
        key: Key::stretch(&mk), // replaced by the user key in sync()
        ciphers: HashMap::new(), folder_ids: HashMap::new(), raw: Value::Null, vault: Vault::default(), offline: false,
    };
    let v = s.call("GET", "/sync?excludeDomains=true", None)?;
    s.key = s.key.unwrap_user_key(&gs(g(&v, "profile"), "key"))?;
    s.load(&v);
    Ok(s)
}

impl Session {
    fn send(&self, m: &str, path: &str, body: Option<&Value>) -> Result<ureq::http::Response<ureq::Body>, ureq::Error> {
        let a = agent();
        let url = format!("{}{}", self.srv.api, path);
        let auth = format!("Bearer {}", self.access);
        macro_rules! h { ($r:expr) => { $r.header("Authorization", &auth).header("Bitwarden-Client-Name", "desktop")
            .header("Bitwarden-Client-Version", CLIENT_VERSION).header("Device-Type", device_type()) } }
        match (m, body) {
            ("GET", _) => h!(a.get(&url)).call(),
            ("DELETE", _) => h!(a.delete(&url)).call(),
            ("POST", Some(b)) => h!(a.post(&url)).send_json(b),
            ("PUT", Some(b)) => h!(a.put(&url)).send_json(b),
            ("POST", None) => h!(a.post(&url)).send_empty(),
            _ => h!(a.put(&url)).send_empty(),
        }
    }

    /// API call; refreshes the access token once on 401.
    fn call(&mut self, m: &str, path: &str, body: Option<&Value>) -> Result<Value, String> {
        let mut r = self.send(m, path, body).map_err(|e| self.down(e))?;
        if r.status().as_u16() == 401 && !self.refresh.is_empty() {
            self.refresh_token()?;
            r = self.send(m, path, body).map_err(|e| self.down(e))?;
        }
        let status = r.status().as_u16();
        self.offline = matches!(status, 502..=504); // proxy up, server down
        if self.offline { return Err("Impossible de joindre le serveur.".into()); }
        let v: Value = r.body_mut().read_json().unwrap_or(Value::Null);
        if !(200..300).contains(&status) {
            let msg = [gs(g(&v, "errorModel"), "message"), gs(&v, "message")].into_iter().find(|m| !m.is_empty()).unwrap_or_default();
            return Err(format!("Le serveur a refusé l'opération (HTTP {status}). {msg}").trim().to_string());
        }
        Ok(v)
    }

    /// Transport failure: remembers that the server is unreachable.
    fn down(&mut self, e: ureq::Error) -> String { self.offline = true; net(e) }

    fn refresh_token(&mut self) -> Result<(), String> {
        let mut r = agent().post(&format!("{}/connect/token", self.srv.identity))
            .send_form([("grant_type", "refresh_token"), ("client_id", "desktop"), ("refresh_token", self.refresh.as_str())])
            .map_err(|e| self.down(e))?;
        if matches!(r.status().as_u16(), 502..=504) {
            self.offline = true;
            return Err("Impossible de joindre le serveur.".into());
        }
        if !r.status().is_success() {
            return Err("Session expirée : verrouillez puis reconnectez-vous.".into());
        }
        let t: Value = r.body_mut().read_json().map_err(|e| e.to_string())?;
        self.access = gs(&t, "access_token");
        if !gs(&t, "refresh_token").is_empty() { self.refresh = gs(&t, "refresh_token"); }
        Ok(())
    }

    pub fn srv(&self) -> Server { self.srv.clone() }

    pub fn sync(&mut self) -> Result<(), String> {
        let v = self.call("GET", "/sync?excludeDomains=true", None)?;
        self.load(&v);
        Ok(())
    }

    pub fn encrypt(&self, pt: &str) -> String { self.key.encrypt(pt.as_bytes()) }
    pub fn decrypt(&self, s: &str) -> Result<String, String> { self.key.decrypt_string(s) }
    /// The user key, encrypted under `k` (used for PIN unlock).
    pub fn wrap_key(&self, k: &Key) -> String { k.wrap(&self.key) }

    /// An empty locked session for a restart: `import` fills it once the user key is known.
    pub fn shell(srv: Server) -> Session {
        Session { srv, access: String::new(), refresh: String::new(), key: Key::default(), ciphers: HashMap::new(), folder_ids: HashMap::new(), raw: Value::Null, vault: Vault::default(), offline: false }
    }
    pub fn is_shell(&self) -> bool { self.raw.is_null() }
    /// Refresh token + last sync, encrypted under the user key, for `import` after a restart.
    pub fn export(&self) -> String { self.key.encrypt(json!({ "refresh": self.refresh, "raw": self.raw }).to_string().as_bytes()) }
    pub fn import(&mut self, blob: &str, key: &Key) -> Result<(), String> {
        let v: Value = serde_json::from_str(&key.decrypt_string(blob)?).map_err(|e| e.to_string())?;
        self.refresh = gs(&v, "refresh");
        self.raw = g(&v, "raw").clone();
        Ok(())
    }

    /// Drops every decrypted secret and the user key; the server tokens and encrypted data stay.
    pub fn seal(&mut self) {
        self.key = Key::default();
        self.folder_ids.clear();
        self.vault = Vault::default();
    }

    /// Restores the user key and re-decrypts the last synced data.
    pub fn unseal(&mut self, key: Key) {
        self.key = key;
        let v = std::mem::take(&mut self.raw);
        self.load(&v);
    }

    fn load(&mut self, v: &Value) {
        self.raw = v.clone();
        let k = &self.key;
        self.folder_ids = g(v, "folders").as_array().into_iter().flatten()
            .filter_map(|f| Some((k.decrypt_string(&gs(f, "name")).ok()?, gs(f, "id")))).collect();
        let names: HashMap<&str, &str> = self.folder_ids.iter().map(|(n, i)| (i.as_str(), n.as_str())).collect();
        self.ciphers.clear();
        let (mut items, mut trash) = (vec![], vec![]);
        for c in g(v, "ciphers").as_array().into_iter().flatten() {
            // shortcut: organization items need the org RSA key; skipped.
            if !g(c, "organizationId").is_null() { continue; }
            let trashed = !g(c, "deletedDate").is_null();
            let Ok(ck) = self.cipher_key(c) else { continue };
            let d = |v: &Value, f: &str| ck.decrypt_string(&gs(v, f)).unwrap_or_default();
            let kind = g(c, "type").as_i64().unwrap_or(1);
            let mut data = BTreeMap::new();
            if let Some((sec, fields)) = section(kind) {
                let s = g(c, sec);
                for f in fields { data.insert(f.to_string(), d(s, f)); }
                if kind == 1 {
                    let uri = g(s, "uris").as_array().and_then(|u| u.first()).map(|u| d(u, "uri")).unwrap_or_default();
                    data.insert("uri".into(), uri);
                }
            }
            data.retain(|_, v| !v.is_empty());
            let history = if kind != 1 { vec![] } else {
                g(c, "passwordHistory").as_array().into_iter().flatten()
                    .map(|h| Hist { password: d(h, "password"), date: gs(h, "lastUsedDate") }).filter(|h| !h.password.is_empty()).collect()
            };
            let id = gs(c, "id");
            (if trashed { &mut trash } else { &mut items }).push(Item {
                id: id.clone(), kind, name: d(c, "name"), notes: d(c, "notes"), data, history,
                folder: names.get(gs(c, "folderId").as_str()).map(|s| s.to_string()).unwrap_or_default(),
            });
            self.ciphers.insert(id, c.clone());
        }
        items.sort_by_key(|i: &Item| i.name.to_lowercase());
        trash.sort_by_key(|i: &Item| i.name.to_lowercase());
        let mut folders: Vec<String> = self.folder_ids.keys().cloned().collect();
        folders.sort();
        self.vault = Vault { folders, items, trash };
    }

    fn cipher_key(&self, c: &Value) -> Result<Key, String> {
        match gs(c, "key") {
            k if k.is_empty() => Ok(self.key.clone()),
            k => self.key.unwrap_user_key(&k),
        }
    }

    /// Folder id for a path, creating the folder when only implied by children (or new). "" = no folder.
    fn ensure_folder(&mut self, path: &str) -> Result<Value, String> {
        let path = clean_path(path)?;
        if path.is_empty() { return Ok(Value::Null); }
        if let Some(id) = self.folder_ids.get(&path) { return Ok(json!(id)); }
        let v = self.call("POST", "/folders", Some(&json!({ "name": self.key.encrypt(path.as_bytes()) })))?;
        let id = gs(&v, "id");
        self.folder_ids.insert(path, id.clone());
        Ok(json!(id))
    }

    pub fn create_folder(&mut self, path: &str) -> Result<(), String> {
        if clean_path(path)?.is_empty() { return Err("Nom de dossier vide.".into()); }
        self.ensure_folder(path).map(|_| ())
    }

    /// Renames/moves a folder and all its subfolders (Bitwarden nesting is by name prefix).
    pub fn rename_folder(&mut self, from: &str, to: &str) -> Result<(), String> {
        let to = clean_path(to)?;
        if to.is_empty() { return Err("Nom de dossier vide.".into()); }
        if to == from { return Ok(()); }
        if to.starts_with(&format!("{from}/")) { return Err("Impossible de déplacer un dossier dans lui-même.".into()); }
        let prefix = format!("{from}/");
        let targets: Vec<(String, String)> = self.folder_ids.iter()
            .filter(|(n, _)| *n == from || n.starts_with(&prefix))
            .map(|(n, id)| (format!("{to}{}", &n[from.len()..]), id.clone())).collect();
        if targets.is_empty() { return Err("Dossier introuvable.".into()); }
        for (name, id) in targets {
            self.call("PUT", &format!("/folders/{id}"), Some(&json!({ "name": self.key.encrypt(name.as_bytes()) })))?;
        }
        Ok(())
    }

    /// Deletes a folder and its subfolders; the server moves their items to "no folder".
    pub fn delete_folder(&mut self, path: &str) -> Result<(), String> {
        let prefix = format!("{path}/");
        let ids: Vec<String> = self.folder_ids.iter().filter(|(n, _)| *n == path || n.starts_with(&prefix)).map(|(_, id)| id.clone()).collect();
        for id in ids { self.call("DELETE", &format!("/folders/{id}"), None)?; }
        Ok(())
    }

    pub fn move_items(&mut self, ids: &[String], folder: &str) -> Result<(), String> {
        let fid = self.ensure_folder(folder)?;
        self.call("PUT", "/ciphers/move", Some(&json!({ "ids": ids, "folderId": fid }))).map(|_| ())
    }

    pub fn delete_item(&mut self, id: &str) -> Result<(), String> {
        self.call("PUT", &format!("/ciphers/{id}/delete"), None).map(|_| ())
    }

    pub fn restore_item(&mut self, id: &str) -> Result<(), String> {
        self.call("PUT", &format!("/ciphers/{id}/restore"), None).map(|_| ())
    }

    /// Permanently deletes one trashed item (`None`) or every trashed item.
    pub fn purge(&mut self, id: Option<&str>) -> Result<(), String> {
        let ids: Vec<String> = match id { Some(i) => vec![i.into()], None => self.vault.trash.iter().map(|i| i.id.clone()).collect() };
        for i in ids { self.call("DELETE", &format!("/ciphers/{i}"), None)?; }
        Ok(())
    }

    /// Creates or updates an item. Updates start from the raw cipher so fields this client
    /// does not edit (custom fields, history, extra URIs, attachments…) are kept as they are.
    pub fn save_item(&mut self, it: &ItemInput) -> Result<(), String> {
        if it.name.trim().is_empty() { return Err("Le nom est obligatoire.".into()); }
        let folder_id = self.ensure_folder(&it.folder)?;
        let mut c = match &it.id {
            Some(id) => self.ciphers.get(id).cloned().ok_or("Élément introuvable, synchronisez le coffre.")?,
            None => json!({ "type": it.kind, "favorite": false, "reprompt": 0 }),
        };
        let k = self.cipher_key(&c)?;
        let enc = |s: &str| if s.is_empty() { Value::Null } else { json!(k.encrypt(s.as_bytes())) };
        let get = |f: &str| it.data.get(f).map(|s| s.as_str()).unwrap_or("");
        // the password being replaced goes to the history, like the other Bitwarden clients (last 5 kept)
        let old_pw = if it.kind == 1 && it.id.is_some() { k.decrypt_string(&gs(&c["login"], "password")).unwrap_or_default() } else { String::new() };
        let o = c.as_object_mut().ok_or("Élément invalide.")?;
        if !old_pw.is_empty() && old_pw != get("password") {
            let mut h = vec![json!({ "password": enc(&old_pw), "lastUsedDate": iso_now() })];
            h.extend(o.get("passwordHistory").and_then(|x| x.as_array()).cloned().unwrap_or_default());
            h.truncate(5);
            o.insert("passwordHistory".into(), json!(h));
        }
        o.insert("name".into(), enc(it.name.trim()));
        o.insert("notes".into(), enc(&it.notes));
        o.insert("folderId".into(), folder_id);
        if let Some(rev) = o.get("revisionDate").cloned() { o.insert("lastKnownRevisionDate".into(), rev); }
        if it.kind == 2 && o.get("secureNote").is_none_or(|v| v.is_null()) {
            o.insert("secureNote".into(), json!({ "type": 0 }));
        }
        if let Some((sec, fields)) = section(it.kind) {
            let s = o.entry(sec).or_insert_with(|| json!({}));
            if s.is_null() { *s = json!({}); }
            let s: &mut Map<String, Value> = s.as_object_mut().ok_or("Élément invalide.")?;
            for f in fields { s.insert(f.to_string(), enc(get(f))); }
            if it.kind == 1 {
                let mut uris = s.get("uris").and_then(|u| u.as_array()).cloned().unwrap_or_default();
                match (get("uri"), uris.is_empty()) {
                    ("", false) => { uris.remove(0); }
                    ("", true) => {}
                    (u, true) => uris.push(json!({ "uri": enc(u), "match": null })),
                    (u, false) => { uris[0]["uri"] = enc(u); }
                }
                s.insert("uris".into(), json!(uris));
            }
        }
        match &it.id {
            Some(id) => self.call("PUT", &format!("/ciphers/{id}"), Some(&c)),
            None => self.call("POST", "/ciphers", Some(&c)),
        }.map(|_| ())
    }
}

/// Current UTC time as `2026-11-14T10:46:04.000Z` (civil-from-days, no date crate needed).
fn iso_now() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, secs) = (t.div_euclid(86400), t.rem_euclid(86400));
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let (d, m) = (doy - (153 * mp + 2) / 5 + 1, if mp < 10 { mp + 3 } else { mp - 9 });
    let y = yoe + era * 400 + (m <= 2) as i64;
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z", secs / 3600, secs % 3600 / 60, secs % 60)
}

fn clean_path(p: &str) -> Result<String, String> {
    let parts: Vec<&str> = p.split('/').map(str::trim).collect();
    if parts.iter().all(|x| x.is_empty()) { return Ok(String::new()); }
    if parts.iter().any(|x| x.is_empty()) { return Err("Nom de dossier invalide (« / » vide).".into()); }
    Ok(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_urls() {
        assert!(server(2, "http://example.com").is_err());
        assert_eq!(server(2, "https://vw.example.com/").ok().unwrap().api, "https://vw.example.com/api");
        assert!(server(2, "").is_err());
        assert_eq!(server(1, "").ok().unwrap().identity, "https://identity.bitwarden.eu");
    }
    #[test]
    fn iso_format() {
        let s = iso_now();
        assert_eq!((s.len(), &s[4..5], &s[10..11], &s[19..]), (24, "-", "T", ".000Z"));
        assert!(s.starts_with("20"));
    }
    #[test]
    fn paths() {
        assert_eq!(clean_path(" Perso / Banque ").unwrap(), "Perso/Banque");
        assert_eq!(clean_path("").unwrap(), "");
        assert!(clean_path("a//b").is_err());
    }
}
