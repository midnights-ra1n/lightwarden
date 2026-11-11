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
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

struct App {
    store: Store,
    sessions: HashMap<String, Arc<Mutex<api::Session>>>, // email -> unlocked session, memory only
    pending: Option<api::Pending>,
}
type S<'a> = State<'a, Mutex<App>>;

#[derive(Serialize)]
struct AccountView {
    email: String,
    server_kind: i32,
    server_url: String,
    unlocked: bool,
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
            unlocked: a.sessions.contains_key(&x.email), icons: icons_base(x),
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
fn lock(s: S) {
    let mut a = s.lock().unwrap();
    if let Some(e) = a.store.accounts.get(a.store.current).map(|x| x.email.clone()) {
        a.sessions.remove(&e);
    }
}

#[tauri::command]
fn remove_account(s: S) {
    let mut a = s.lock().unwrap();
    if a.store.current < a.store.accounts.len() {
        let cur = a.store.current;
        let gone = a.store.accounts.remove(cur);
        a.sessions.remove(&gone.email);
        a.store.current = 0;
        a.store.save();
    }
}

#[tauri::command]
fn save_settings(global: GlobalSettings, account: AccountSettings, s: S, app: AppHandle) -> Result<(), String> {
    let mut a = s.lock().unwrap();
    let autostart_changed = a.store.global.autostart != global.autostart;
    a.store.global = global;
    let cur = a.store.current;
    if let Some(x) = a.store.accounts.get_mut(cur) {
        x.settings = account;
    }
    a.store.save();
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
    let (device_id, pending) = { let a = s.lock().unwrap(); (a.store.device_id.clone(), a.pending.clone()) };
    let e2 = email.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let p = pending.filter(|_| !code.trim().is_empty()).map(|p| (p, code));
        api::login(&srv, &e2, &password, &device_id, p.as_ref().map(|(p, c)| (p.clone(), c.as_str())))
    }).await.map_err(|e| e.to_string())?;
    let mut a = s.lock().unwrap();
    match res {
        Ok(v) => {
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

fn show_main(app: &AppHandle) {
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

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main(app)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(updater::Updater::default()))
        .manage(Mutex::new(App { store, sessions: HashMap::new(), pending: None }))
        .invoke_handler(tauri::generate_handler![
            snapshot, vault, select_account, lock, remove_account, save_settings, copy, open_url, login,
            sync_vault, create_folder, rename_folder, delete_folder, move_items, save_item, delete_item,
            ssh_parse, ssh_generate, open_text_file, save_text_file,
            update_info, update_check, update_install, french
        ])
        .setup(move |app| {
            let menu = Menu::with_items(app, &[
                &MenuItem::with_id(app, "open", "Ouvrir Lightwarden", true, None::<&str>)?,
                &MenuItem::with_id(app, "lock", "Verrouiller tous les coffres", true, None::<&str>)?,
                &MenuItem::with_id(app, "update", "Rechercher des mises à jour", true, None::<&str>)?,
                &MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?,
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
                        app.state::<Mutex<App>>().lock().unwrap().sessions.clear();
                        let _ = app.emit("locked", ());
                    }
                    "update" => {
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
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            updater::start_background(app.handle().clone(), auto_update);
            Ok(())
        })
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
