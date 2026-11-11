//! Bitwarden-compatible server API: prelogin, token (password grant, 2FA, new-device OTP), sync + decrypt.
use crate::crypto::{master_key, master_password_hash, Kdf, Key};
use crate::vault::{Item, Vault};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use std::{collections::HashMap, time::Duration};

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

fn net(e: ureq::Error) -> String { format!("Impossible de joindre le serveur ({e}).") }

fn device_type() -> &'static str {
    if cfg!(target_os = "windows") { "6" } else if cfg!(target_os = "macos") { "7" } else { "8" }
}

pub fn login(srv: &Server, email: &str, password: &str, device_id: &str, pending: Option<(Pending, &str)>) -> Result<Vault, LoginErr> {
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
        .header("Device-Type", device_type())
        .send_form(form.iter().map(|(k, v)| (*k, v.as_str()))).map_err(net)?;
    let status = r.status().as_u16();
    let tok: Value = r.body_mut().read_json().unwrap_or(Value::Null);
    if status != 200 {
        let msg = gs(&g(&tok, "errorModel").clone(), "message");
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
    let access = gs(&tok, "access_token");

    let mut r = a.get(&format!("{}/sync?excludeDomains=true", srv.api)).header("Authorization", &format!("Bearer {access}")).call().map_err(net)?;
    if !r.status().is_success() {
        return Err(format!("Synchronisation refusée (HTTP {}).", r.status().as_u16()).into());
    }
    let sync: Value = r.body_mut().read_json().map_err(|e| e.to_string())?;
    let user_key = Key::stretch(&mk).unwrap_user_key(&gs(g(&sync, "profile"), "key"))?;
    Ok(decrypt_vault(&sync, &user_key))
}

fn decrypt_vault(sync: &Value, uk: &Key) -> Vault {
    let folders: HashMap<String, String> = g(sync, "folders").as_array().into_iter().flatten()
        .filter_map(|f| Some((gs(f, "id"), uk.decrypt_string(&gs(f, "name")).ok()?))).collect();
    let mut out = vec![];
    for c in g(sync, "ciphers").as_array().into_iter().flatten() {
        // shortcut: organization items need the org RSA key; skipped. Trashed items skipped.
        if !g(c, "organizationId").is_null() || !g(c, "deletedDate").is_null() { continue; }
        let key = match gs(c, "key") {
            k if k.is_empty() => None,
            k => match uk.unwrap_user_key(&k) { Ok(k) => Some(k), Err(_) => continue },
        };
        let k = key.as_ref().unwrap_or(uk);
        let d = |v: &Value, f: &str| k.decrypt_string(&gs(v, f)).unwrap_or_default();
        let login = g(c, "login");
        let uri = g(login, "uris").as_array().and_then(|u| u.first()).map(|u| d(u, "uri")).unwrap_or_default();
        out.push(Item {
            kind: g(c, "type").as_i64().unwrap_or(1),
            name: d(c, "name"), username: d(login, "username"), password: d(login, "password"), notes: d(c, "notes"), uri,
            folder: folders.get(&gs(c, "folderId")).cloned().unwrap_or_default(),
        });
    }
    out.sort_by_key(|i| i.name.to_lowercase());
    Vault { folders: folders.into_values().collect(), items: out }
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
}
