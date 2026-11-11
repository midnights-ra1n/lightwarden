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
    pub hw_accel: bool,
    pub ssh_agent: bool,
    pub ssh_approval: i32, // 0 always ask, 1 remember until lock, 2 never ask
    pub quick_copy: bool,
    pub theme: i32, // 0 system, 1 light, 2 dark
    pub language: i32,
    pub auto_update: bool, // download updates in the background and notify when ready
}
impl Default for GlobalSettings {
    fn default() -> Self {
        Self { keep_background: true, autostart: false, hw_accel: true, ssh_agent: false, ssh_approval: 1, quick_copy: true, theme: 2, language: 0, auto_update: true }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Account {
    pub email: String,
    pub server_kind: i32, // 0 bitwarden.com, 1 bitwarden.eu, 2 self-hosted
    pub server_url: String,
    pub settings: AccountSettings,
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
