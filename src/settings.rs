//! Per-account and global settings, persisted as JSON in the user config dir.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct AccountSettings {
    pub timeout: i32,        // index into session-timeout choices
    pub timeout_action: i32, // 0 lock, 1 log out
    pub unlock_pin: bool,
    pub unlock_system: bool,
    pub clipboard_clear: i32, // index: never,10s,20s,30s,1m,2m,5m
    pub minimize_on_copy: bool,
    pub website_icons: bool,
}
impl Default for AccountSettings {
    fn default() -> Self {
        Self { timeout: 0, timeout_action: 0, unlock_pin: false, unlock_system: false, clipboard_clear: 5, minimize_on_copy: false, website_icons: true }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct GlobalSettings {
    pub keep_background: bool,
    pub autostart: bool,
    pub start_hidden: bool, // when launched at login, stay in the tray / Dock instead of showing the window
    pub hw_accel: bool,
    pub offline_cache: bool, // keep working from the local copy (read-only) while the server is down, re-sync when it is back
    pub ssh_agent: bool,
    pub ssh_approval: i32, // 0 always ask, 1 remember until lock, 2 never ask
    pub quick_copy: bool,
    pub theme: i32, // 0 system, 1 light, 2 dark
    pub language: i32,
    pub auto_update: bool, // download updates in the background and notify when ready
}
impl Default for GlobalSettings {
    fn default() -> Self {
        Self { keep_background: true, autostart: false, start_hidden: false, hw_accel: true, offline_cache: true, ssh_agent: false, ssh_approval: 1, quick_copy: true, theme: 2, language: 0, auto_update: true }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Account {
    pub email: String,
    pub server_kind: i32, // 0 bitwarden.com, 1 bitwarden.eu, 2 self-hosted
    pub server_url: String,
    pub settings: AccountSettings,
    #[serde(default)]
    pub pin: String, // the PIN, encrypted with the user key: re-arms PIN unlock after each master-password unlock
    // Quick unlock across restarts: the user key wrapped under the PIN key / the keychain secret, and the
    // session (refresh token + last sync) encrypted under the user key. Empty when no quick unlock is armed.
    #[serde(default)]
    pub pin_key: String,
    #[serde(default)]
    pub sys_key: String,
    #[serde(default)]
    pub blob: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Store {
    pub accounts: Vec<Account>,
    pub current: usize,
    pub global: GlobalSettings,
    pub device_id: String, // stable per install: 2FA "remember" and new-device checks depend on it
}

fn path() -> Option<std::path::PathBuf> {
    directories::ProjectDirs::from("", "", "lightwarden").map(|d| d.config_dir().join("settings.json"))
}

impl Store {
    pub fn load() -> Store {
        let mut s: Store = path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        if s.device_id.is_empty() {
            s.device_id = uuid::Uuid::new_v4().to_string();
        }
        s.current = s.current.min(s.accounts.len().saturating_sub(1));
        s
    }
    pub fn save(&self) {
        let Some(p) = path() else { return };
        let _ = std::fs::create_dir_all(p.parent().unwrap());
        if let Err(e) = std::fs::write(&p, serde_json::to_vec_pretty(self).unwrap()) {
            eprintln!("cannot save settings: {e}");
        }
    }
}
