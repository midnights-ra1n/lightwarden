mod agent;
mod api;
mod crypto;
mod settings;
mod ssh;
mod updater;
mod vault;

use serde::Serialize;
use settings::{Account, AccountSettings, GlobalSettings, Store};
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Duration};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

struct App {
    store: Store,
    sessions: HashMap<String, Arc<Mutex<api::Session>>>, // email -> unlocked session, memory only
    pending: Option<api::Pending>,
    pin_keys: HashMap<String, String>, // email -> user key encrypted under the PIN-derived key, memory only
    sealed: HashMap<String, (Arc<Mutex<api::Session>>, u8)>, // email -> locked session awaiting its PIN, failed tries
}

const PIN_TRIES: u8 = 5;

impl App {
    /// Locks one account. With a PIN armed the session is kept sealed (no key, no decrypted data) for PIN unlock.
    fn lock_account(&mut self, email: &str) {
        let Some(sess) = self.sessions.remove(email) else { return };
        if self.pin_keys.contains_key(email) {
            sess.lock().unwrap().seal();
            self.sealed.insert(email.to_string(), (sess, 0));
        }
    }
    fn forget_pin(&mut self, email: &str) {
        self.pin_keys.remove(email);
        self.sealed.remove(email);
    }
    fn current_email(&self) -> Result<String, String> {
        Ok(self.store.accounts.get(self.store.current).ok_or("Aucun compte.")?.email.clone())
    }
}
type S<'a> = State<'a, Mutex<App>>;

#[derive(Serialize)]
struct AccountView {
    email: String,
    server_kind: i32,
    server_url: String,
    unlocked: bool,
    pin: bool, // locked, and unlockable with its PIN
    icons: String, // base URL of the favicon service for this server
}

#[derive(Serialize)]
struct Snapshot {
    accounts: Vec<AccountView>,
    current: usize,
    global: GlobalSettings,
    account: AccountSettings,
}

#[derive(Serialize)]
#[serde(tag = "status")]
enum LoginOutcome {
    Ok,
    NeedCode { hint: String },
}

fn icons_base(a: &Account) -> String {
    match a.server_kind {
        0 => "https://icons.bitwarden.net".into(),
        1 => "https://icons.bitwarden.eu".into(),
        _ => format!("{}/icons", a.server_url.trim().trim_end_matches('/')),
    }
}

#[tauri::command]
fn snapshot(s: S) -> Snapshot {
    let a = s.lock().unwrap();
    Snapshot {
        accounts: a.store.accounts.iter().map(|x| AccountView {
            email: x.email.clone(), server_kind: x.server_kind, server_url: x.server_url.clone(),
            unlocked: a.sessions.contains_key(&x.email), pin: a.sealed.contains_key(&x.email), icons: icons_base(x),
        }).collect(),
        current: a.store.current,
        global: a.store.global.clone(),
        account: a.store.accounts.get(a.store.current).map(|x| x.settings.clone()).unwrap_or_default(),
    }
}

#[tauri::command]
fn vault(s: S) -> Option<vault::Vault> {
    let a = s.lock().unwrap();
    let sess = a.sessions.get(&a.store.accounts.get(a.store.current)?.email)?;
    let v = sess.lock().unwrap().vault.clone();
    Some(v)
}

/// Runs a write on the current account's session (off the UI thread), then re-syncs and returns the fresh vault.
async fn mutate(s: S<'_>, f: impl FnOnce(&mut api::Session) -> Result<(), String> + Send + 'static) -> Result<vault::Vault, String> {
    let sess = {
        let a = s.lock().unwrap();
        let email = &a.store.accounts.get(a.store.current).ok_or("Aucun compte.")?.email;
        a.sessions.get(email).cloned().ok_or("Coffre verrouillé.")?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut x = sess.lock().unwrap();
        let res = f(&mut x);
        x.sync()?; // even after a failure, so the UI shows the real server state
        res.map(|_| x.vault.clone())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_vault(s: S<'_>) -> Result<vault::Vault, String> { mutate(s, |_| Ok(())).await }
#[tauri::command]
async fn create_folder(path: String, s: S<'_>) -> Result<vault::Vault, String> { mutate(s, move |x| x.create_folder(&path)).await }
#[tauri::command]
async fn rename_folder(from: String, to: String, s: S<'_>) -> Result<vault::Vault, String> { mutate(s, move |x| x.rename_folder(&from, &to)).await }
#[tauri::command]
async fn delete_folder(path: String, s: S<'_>) -> Result<vault::Vault, String> { mutate(s, move |x| x.delete_folder(&path)).await }
#[tauri::command]
async fn move_items(ids: Vec<String>, folder: String, s: S<'_>) -> Result<vault::Vault, String> { mutate(s, move |x| x.move_items(&ids, &folder)).await }
#[tauri::command]
async fn save_item(item: vault::ItemInput, s: S<'_>) -> Result<vault::Vault, String> { mutate(s, move |x| x.save_item(&item)).await }
#[tauri::command]
async fn delete_item(id: String, s: S<'_>) -> Result<vault::Vault, String> { mutate(s, move |x| x.delete_item(&id)).await }

fn auto_update(app: &AppHandle) -> bool {
    app.state::<Mutex<App>>().lock().unwrap().store.global.auto_update
}

#[tauri::command]
fn update_info(app: AppHandle) -> updater::Info { updater::info(&app) }
#[tauri::command]
async fn update_check(app: AppHandle) { let d = auto_update(&app); updater::check(app, d).await }
#[tauri::command]
fn update_install(app: AppHandle) { updater::begin_install(&app) }
#[tauri::command]
fn french() -> bool { updater::french() }

#[tauri::command]
fn ssh_parse(text: String, passphrase: String) -> Result<ssh::Parsed, String> { ssh::parse(&text, &passphrase) }
#[tauri::command]
fn ssh_generate() -> Result<ssh::Parsed, String> { ssh::generate() }

fn ssh_dir() -> Option<std::path::PathBuf> {
    directories::UserDirs::new().map(|d| d.home_dir().join(".ssh")).filter(|p| p.is_dir())
}

/// Native "open" dialog; returns (file name, content) of a small text file.
#[tauri::command]
async fn open_text_file(app: AppHandle) -> Result<Option<(String, String)>, String> {
    let mut d = app.dialog().file().set_title("Importer une clé SSH");
    if let Some(p) = ssh_dir() { d = d.set_directory(p); }
    let Some(fp) = d.blocking_pick_file() else { return Ok(None) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 1 << 20 {
        return Err("Fichier trop volumineux pour une clé.".into());
    }
    let text = std::fs::read_to_string(&path).map_err(|_| "Ce fichier n'est pas un fichier texte.".to_string())?;
    Ok(Some((path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), text)))
}

/// Native "save" dialog; private keys are written owner-only (0600) on Unix, as ssh requires.
#[tauri::command]
async fn save_text_file(app: AppHandle, name: String, text: String, private: bool) -> Result<bool, String> {
    let mut d = app.dialog().file().set_title("Exporter la clé").set_file_name(&name);
    if let Some(p) = ssh_dir() { d = d.set_directory(p); }
    let Some(fp) = d.blocking_save_file() else { return Ok(false) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create(true).truncate(true);
    #[cfg(unix)]
    if private { use std::os::unix::fs::OpenOptionsExt; o.mode(0o600); }
    let _ = private;
    use std::io::Write;
    o.open(&path).and_then(|mut f| f.write_all(text.as_bytes())).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn select_account(index: usize, s: S) {
    let mut a = s.lock().unwrap();
    if index < a.store.accounts.len() {
        a.store.current = index;
        a.pending = None;
        a.store.save();
    }
}

#[tauri::command]
fn lock(s: S, app: AppHandle) {
    let mut a = s.lock().unwrap();
    if let Ok(e) = a.current_email() { a.lock_account(&e); }
    agent::forget(&app);
}

fn lock_all(app: &AppHandle) {
    let state = app.state::<Mutex<App>>();
    let mut a = state.lock().unwrap();
    for e in a.sessions.keys().cloned().collect::<Vec<_>>() { a.lock_account(&e); }
    agent::forget(app);
}

/// Sets (non-empty) or removes (empty) the current account's PIN. Setting needs the vault unlocked.
#[tauri::command]
async fn set_pin(pin: String, s: S<'_>) -> Result<(), String> {
    let (email, sess) = { let a = s.lock().unwrap(); let e = a.current_email()?; let x = a.sessions.get(&e).cloned(); (e, x) };
    let armed = if pin.is_empty() { None } else {
        if pin.chars().count() < 4 { return Err("Le code PIN doit comporter au moins 4 caractères.".into()); }
        let sess = sess.ok_or("Déverrouillez le coffre pour définir un code PIN.")?;
        let e2 = email.clone();
        Some(tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
            let k = crypto::Key::from_pin(&pin, &e2)?;
            let x = sess.lock().unwrap();
            Ok((x.encrypt(&pin), x.wrap_key(&k)))
        }).await.map_err(|e| e.to_string())??)
    };
    let mut a = s.lock().unwrap();
    a.forget_pin(&email);
    if let Some((_, wrapped)) = &armed { a.pin_keys.insert(email.clone(), wrapped.clone()); }
    if let Some(x) = a.store.accounts.iter_mut().find(|x| x.email == email) {
        x.settings.unlock_pin = armed.is_some();
        x.pin = armed.map(|(p, _)| p).unwrap_or_default();
    }
    a.store.save();
    Ok(())
}

#[tauri::command]
async fn unlock_pin(pin: String, s: S<'_>) -> Result<(), String> {
    const NEED_MP: &str = "Saisissez votre mot de passe maître.";
    let (email, sess, wrapped) = {
        let a = s.lock().unwrap();
        let e = a.current_email()?;
        let sess = a.sealed.get(&e).ok_or(NEED_MP)?.0.clone();
        let w = a.pin_keys.get(&e).cloned().ok_or(NEED_MP)?;
        (e, sess, w)
    };
    let e2 = email.clone();
    let key = tauri::async_runtime::spawn_blocking(move || crypto::Key::from_pin(&pin, &e2)?.unwrap_user_key(&wrapped))
        .await.map_err(|e| e.to_string())?;
    let mut a = s.lock().unwrap();
    if !a.sealed.contains_key(&email) { return Err(NEED_MP.into()); } // removed or unlocked meanwhile
    match key {
        Ok(k) => {
            sess.lock().unwrap().unseal(k);
            a.sealed.remove(&email);
            a.sessions.insert(email, sess);
            Ok(())
        }
        Err(_) => {
            let tries = { let t = &mut a.sealed.get_mut(&email).unwrap().1; *t += 1; *t };
            if tries >= PIN_TRIES {
                a.forget_pin(&email); // re-armed by the next master-password unlock
                return Err("Trop de tentatives : saisissez votre mot de passe maître.".into());
            }
            let left = PIN_TRIES - tries;
            Err(format!("Code PIN incorrect ({left} essai{} restant{}).", if left > 1 { "s" } else { "" }, if left > 1 { "s" } else { "" }))
        }
    }
}

/// After a master-password unlock: re-derives the PIN key from the stored encrypted PIN.
fn arm_pin(sess: &api::Session, enc_pin: &str, email: &str) -> Option<String> {
    let pin = sess.decrypt(enc_pin).ok()?;
    Some(sess.wrap_key(&crypto::Key::from_pin(&pin, email).ok()?))
}

#[tauri::command]
fn ssh_agent_status(app: AppHandle) -> agent::Status { agent::status(&app) }

#[tauri::command]
fn remove_account(s: S) {
    let mut a = s.lock().unwrap();
    if a.store.current < a.store.accounts.len() {
        let cur = a.store.current;
        let gone = a.store.accounts.remove(cur);
        a.sessions.remove(&gone.email);
        a.forget_pin(&gone.email);
        a.store.current = 0;
        a.store.save();
    }
}

#[tauri::command]
fn save_settings(global: GlobalSettings, account: AccountSettings, s: S, app: AppHandle) -> Result<(), String> {
    let mut a = s.lock().unwrap();
    let autostart_changed = a.store.global.autostart != global.autostart;
    let agent_changed = a.store.global.ssh_agent != global.ssh_agent;
    a.store.global = global;
    let cur = a.store.current;
    if let Some(x) = a.store.accounts.get_mut(cur) {
        let pin = x.settings.unlock_pin; // only set_pin changes it
        x.settings = account;
        x.settings.unlock_pin = pin;
    }
    a.store.save();
    if agent_changed {
        drop(a);
        agent::sync(&app);
        a = s.lock().unwrap();
    }
    if autostart_changed {
        let al = app.autolaunch();
        if a.store.global.autostart { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Wayland/X11 clipboard content lives only while this object does, so keep one for the whole run.
static CLIPBOARD: Mutex<Option<arboard::Clipboard>> = Mutex::new(None);

#[tauri::command]
fn copy(text: String, s: S, window: tauri::WebviewWindow) -> Result<(), String> {
    let (clear, minimize) = {
        let a = s.lock().unwrap();
        let acc = a.store.accounts.get(a.store.current).map(|x| x.settings.clone()).unwrap_or_default();
        ([0u64, 10, 20, 30, 60, 120, 300].get(acc.clipboard_clear as usize).copied().unwrap_or(0), acc.minimize_on_copy)
    };
    let mut g = CLIPBOARD.lock().unwrap();
    if g.is_none() {
        *g = Some(arboard::Clipboard::new().map_err(|e| e.to_string())?);
    }
    g.as_mut().unwrap().set_text(text.clone()).map_err(|e| e.to_string())?;
    if clear > 0 {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(clear));
            if let Some(cb) = CLIPBOARD.lock().unwrap().as_mut() {
                if cb.get_text().is_ok_and(|t| t == text) { let _ = cb.clear(); }
            }
        });
    }
    if minimize { let _ = window.minimize(); }
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    // only web links: the URI comes from vault data
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("URL non prise en charge".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn login(kind: i32, url: String, email: String, password: String, code: String, s: S<'_>) -> Result<LoginOutcome, String> {
    let email = email.trim().to_lowercase();
    if email.is_empty() || password.is_empty() {
        return Err("Saisissez l'e-mail et le mot de passe maître.".into());
    }
    let srv = api::server(kind, &url)?;
    let (device_id, pending, enc_pin) = {
        let a = s.lock().unwrap();
        let pin = a.store.accounts.iter().find(|x| x.email == email && x.settings.unlock_pin).map(|x| x.pin.clone()).unwrap_or_default();
        (a.store.device_id.clone(), a.pending.clone(), pin)
    };
    let e2 = email.clone();
    let (res, armed) = tauri::async_runtime::spawn_blocking(move || {
        let p = pending.filter(|_| !code.trim().is_empty()).map(|p| (p, code));
        let r = api::login(&srv, &e2, &password, &device_id, p.as_ref().map(|(p, c)| (p.clone(), c.as_str())));
        let armed = r.as_ref().ok().filter(|_| !enc_pin.is_empty()).and_then(|v| arm_pin(v, &enc_pin, &e2));
        (r, armed)
    }).await.map_err(|e| e.to_string())?;
    let mut a = s.lock().unwrap();
    match res {
        Ok(v) => {
            a.forget_pin(&email);
            match armed {
                Some(w) => { a.pin_keys.insert(email.clone(), w); }
                None => if let Some(x) = a.store.accounts.iter_mut().find(|x| x.email == email) {
                    // PIN unreadable (e.g. the account key changed): turn PIN unlock off rather than leave it broken
                    if x.settings.unlock_pin { x.settings.unlock_pin = false; x.pin.clear(); }
                },
            }
            let idx = match a.store.accounts.iter().position(|x| x.email == email) {
                Some(i) => i,
                None => { a.store.accounts.push(Account { email: email.clone(), ..Default::default() }); a.store.accounts.len() - 1 }
            };
            let acc = &mut a.store.accounts[idx];
            (acc.server_kind, acc.server_url) = (kind, url);
            a.store.current = idx;
            a.store.save();
            a.sessions.insert(email, Arc::new(Mutex::new(v)));
            a.pending = None;
            Ok(LoginOutcome::Ok)
        }
        Err(api::LoginErr::Need(p)) => {
            let hint = match p {
                api::Pending::DeviceOtp => "Nouvel appareil : saisissez le code reçu par e-mail.",
                api::Pending::TwoFactor(0) => "Saisissez le code de votre application d'authentification.",
                api::Pending::TwoFactor(_) => "Saisissez le code reçu par e-mail.",
            };
            a.pending = Some(p);
            Ok(LoginOutcome::NeedCode { hint: hint.into() })
        }
        Err(api::LoginErr::Msg(m)) => Err(m),
    }
}

const REPO_URL: &str = "https://github.com/midnights-ra1n/lightwarden";

fn tx(fr: &'static str, en: &'static str) -> &'static str { if updater::french() { fr } else { en } }

/// Native macOS menu bar. Items prefixed `m:` are routed by `on_menu_bar`; most just forward to the UI.
#[cfg(target_os = "macos")]
fn menu_bar(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let mi = |id: &str, fr, en, accel: Option<&str>| MenuItem::with_id(app, format!("m:{id}"), tx(fr, en), true, accel);
    let sep = || PredefinedMenuItem::separator(app);
    let kinds = Submenu::with_items(app, tx("Nouvel élément", "New item"), true, &[
        &mi("new:1", "Identifiant", "Login", None)?,
        &mi("new:3", "Carte", "Card", None)?,
        &mi("new:4", "Identité", "Identity", None)?,
        &mi("new:2", "Note sécurisée", "Secure note", None)?,
        &mi("new:5", "Clé SSH", "SSH key", None)?,
    ])?;
    let (emails, current) = {
        let st = app.state::<Mutex<App>>();
        let a = st.lock().unwrap();
        (a.store.accounts.iter().map(|x| x.email.clone()).collect::<Vec<_>>(), a.store.current)
    };
    let accounts = emails.iter().enumerate()
        .map(|(i, e)| CheckMenuItem::with_id(app, format!("m:acct:{i}"), e, true, i == current, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let mut account_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = accounts.iter().map(|x| x as _).collect();
    let account_sep = sep()?;
    if !accounts.is_empty() { account_items.push(&account_sep); }
    let add = mi("add-account", "Ajouter un compte…", "Add Account…", None)?;
    let remove = mi("remove-account", "Retirer ce compte…", "Remove This Account…", None)?;
    let sep2 = sep()?;
    let lock_all = mi("lock-all", "Verrouiller tous les coffres", "Lock All Vaults", None)?;
    account_items.extend::<[&dyn tauri::menu::IsMenuItem<tauri::Wry>; 4]>([&add, &remove, &sep2, &lock_all]);
    Menu::with_items(app, &[
        &Submenu::with_items(app, "Lightwarden", true, &[
            &mi("about", "À propos de Lightwarden", "About Lightwarden", None)?,
            &mi("update", "Rechercher des mises à jour…", "Check for Updates…", None)?,
            &sep()?,
            &mi("settings", "Paramètres…", "Settings…", Some("CmdOrCtrl+,"))?,
            &sep()?,
            &PredefinedMenuItem::services(app, None)?,
            &sep()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &sep()?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?,
        &Submenu::with_items(app, tx("Coffre", "Vault"), true, &[
            &kinds,
            &mi("new-folder", "Nouveau dossier", "New Folder", Some("CmdOrCtrl+Shift+N"))?,
            &sep()?,
            &mi("edit", "Modifier l'élément", "Edit Item", Some("CmdOrCtrl+E"))?,
            &mi("search", "Rechercher", "Search", Some("CmdOrCtrl+F"))?,
            &sep()?,
            &mi("sync", "Synchroniser", "Sync Vault", Some("CmdOrCtrl+R"))?,
            &mi("lock", "Verrouiller", "Lock Vault", Some("CmdOrCtrl+L"))?,
        ])?,
        &Submenu::with_items(app, tx("Compte", "Account"), true, &account_items)?,
        &Submenu::with_items(app, tx("Édition", "Edit"), true, &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &sep()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])?,
        &Submenu::with_items(app, tx("Affichage", "View"), true, &[
            &mi("kind:0", "Tous les éléments", "All Items", Some("CmdOrCtrl+1"))?,
            &mi("kind:1", "Identifiants", "Logins", Some("CmdOrCtrl+2"))?,
            &mi("kind:3", "Cartes", "Cards", Some("CmdOrCtrl+3"))?,
            &mi("kind:4", "Identités", "Identities", Some("CmdOrCtrl+4"))?,
            &mi("kind:2", "Notes sécurisées", "Secure Notes", Some("CmdOrCtrl+5"))?,
            &mi("kind:5", "Clés SSH", "SSH Keys", Some("CmdOrCtrl+6"))?,
            &sep()?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ])?,
        &Submenu::with_id_and_items(app, WINDOW_SUBMENU_ID, tx("Fenêtre", "Window"), true, &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &sep()?,
            &PredefinedMenuItem::close_window(app, None)?,
        ])?,
        &Submenu::with_id_and_items(app, HELP_SUBMENU_ID, tx("Aide", "Help"), true, &[
            &mi("shortcuts", "Raccourcis clavier", "Keyboard Shortcuts", Some("F1"))?,
            &sep()?,
            &mi("github", "Code source sur GitHub", "Source Code on GitHub", None)?,
            &mi("issues", "Signaler un problème", "Report an Issue", None)?,
        ])?,
    ])
}

/// The account list in the menu bar is static: the UI calls this whenever accounts change.
#[tauri::command]
fn refresh_menu(app: AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || { if let Ok(m) = menu_bar(&a) { let _ = a.set_menu(m); } });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

fn update_from_menu(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let d = auto_update(&app);
        updater::check(app.clone(), d).await;
        match updater::info(&app).status {
            updater::Status::Available { .. } | updater::Status::Ready { .. } => updater::begin_install(&app),
            _ => show_main(&app),
        }
    });
}

fn on_menu_bar(app: &AppHandle, id: &str) {
    let Some(id) = id.strip_prefix("m:") else { return };
    match id {
        "github" => { let _ = tauri_plugin_opener::open_url(REPO_URL, None::<&str>); }
        "issues" => { let _ = tauri_plugin_opener::open_url(format!("{REPO_URL}/issues"), None::<&str>); }
        "update" => update_from_menu(app),
        "lock-all" => {
            lock_all(app);
            let _ = app.emit("locked", ());
        }
        _ => {
            show_main(app);
            let _ = app.emit("menu", id);
        }
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    let store = Store::load();
    #[cfg(target_os = "linux")]
    if !store.global.hw_accel {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
    let light_tray = store.global.theme == 1;
    updater::LANG.store(store.global.language.clamp(0, 2) as u8, std::sync::atomic::Ordering::Relaxed);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main(app)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(updater::Updater::default()))
        .manage(Mutex::new(App { store, sessions: HashMap::new(), pending: None, pin_keys: HashMap::new(), sealed: HashMap::new() }))
        .manage(Mutex::new(agent::Agent::default()))
        .invoke_handler(tauri::generate_handler![
            snapshot, vault, select_account, lock, remove_account, save_settings, copy, open_url, login,
            sync_vault, create_folder, rename_folder, delete_folder, move_items, save_item, delete_item,
            ssh_parse, ssh_generate, open_text_file, save_text_file,
            update_info, update_check, update_install, french,
            set_pin, unlock_pin, ssh_agent_status, refresh_menu
        ])
        .setup(move |app| {
            let menu = Menu::with_items(app, &[
                &MenuItem::with_id(app, "open", tx("Ouvrir Lightwarden", "Open Lightwarden"), true, None::<&str>)?,
                &MenuItem::with_id(app, "lock", tx("Verrouiller tous les coffres", "Lock all vaults"), true, None::<&str>)?,
                &MenuItem::with_id(app, "update", tx("Rechercher des mises à jour", "Check for updates"), true, None::<&str>)?,
                &MenuItem::with_id(app, "quit", tx("Quitter", "Quit"), true, None::<&str>)?,
            ])?;
            // macOS: template icon, the menu bar recolours it (white on dark, black on light).
            // shortcut: elsewhere the colour follows the app theme, not the panel; applied at startup.
            let png: &[u8] = if light_tray || cfg!(target_os = "macos") { include_bytes!("../assets/tray-black.png") } else { include_bytes!("../assets/tray-white.png") };
            TrayIconBuilder::with_id("main")
                .icon(Image::from_bytes(png)?)
                .icon_as_template(true)
                .tooltip("Lightwarden")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "lock" => {
                        lock_all(app);
                        let _ = app.emit("locked", ());
                    }
                    "update" => update_from_menu(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            #[cfg(target_os = "macos")]
            app.set_menu(menu_bar(app.handle())?)?;
            updater::start_background(app.handle().clone(), auto_update);
            agent::sync(app.handle());
            Ok(())
        })
        .on_menu_event(|app, e| on_menu_bar(app, e.id.as_ref()))
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.state::<Mutex<App>>().lock().unwrap().store.global.keep_background {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Lightwarden");
}
