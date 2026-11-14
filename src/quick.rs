//! Data side of the native menu bar panel (macOS, native/macos/QuickPanel.swift). The panel talks to us
//! through one C callback: (command, JSON argument) -> JSON answer, `{"error": ".."}` on failure.
//! Windows (WinUI) and Linux (Qt/GTK) panels can reuse `handle` unchanged.
use crate::{lock_all, show_main, totp, tx, unlock_pin, unlock_system_at, App};
use serde_json::{json, Value};
#[cfg(target_os = "macos")]
use std::ffi::{c_char, CStr, CString};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    type Handler = extern "C" fn(*const c_char, *const c_char) -> *mut c_char;
    type Free = extern "C" fn(*mut c_char);
    extern "C" {
        fn lw_panel_init(h: Handler, f: Free);
        fn lw_panel_toggle();
    }

    use std::sync::OnceLock;
    static APP: OnceLock<AppHandle> = OnceLock::new();

    pub fn init(app: &AppHandle) {
        let _ = APP.set(app.clone());
        unsafe { lw_panel_init(ffi_handler, ffi_free) };
    }

    extern "C" fn ffi_handler(cmd: *const c_char, arg: *const c_char) -> *mut c_char {
        let (cmd, arg) = unsafe { (CStr::from_ptr(cmd).to_string_lossy(), CStr::from_ptr(arg).to_string_lossy()) };
        let out = std::panic::catch_unwind(|| handle(APP.get().expect("init"), &cmd, &arg))
            .unwrap_or_else(|_| json!({ "error": "internal error" }).to_string());
        CString::new(out).unwrap_or_default().into_raw()
    }

    extern "C" fn ffi_free(p: *mut c_char) { if !p.is_null() { drop(unsafe { CString::from_raw(p) }); } }


    /// Main thread only (tray click).
    /// Main thread only (tray click).
    pub fn toggle(_: &AppHandle, _: Option<(f64, f64)>) -> bool { unsafe { lw_panel_toggle() }; true }
}

/// Windows (WinUI 3) and Linux (Qt or GTK 4): a separate native helper process, spawned on first use and kept
/// hidden. Lines of JSON over its pipes: helper -> us `{"id","cmd","arg"}`, us -> helper `{"id","res"}`
/// and `{"event":"toggle","x","y"}` (click position in physical pixels, -1 when unknown).
#[cfg(not(target_os = "macos"))]
mod native {
    use super::*;
    use std::{io::{BufRead, BufReader, Write}, process::{Child, ChildStdin, Command, Stdio}, sync::{atomic::{AtomicBool, Ordering}, Arc}};

    type Pipe = Arc<Mutex<ChildStdin>>;
    static GAVE_UP: AtomicBool = AtomicBool::new(false); // no usable helper: stop trying until restart
    static CHILD: Mutex<Option<(Child, Pipe)>> = Mutex::new(None);

    pub fn init(_: &AppHandle) {}

    fn helpers() -> Vec<&'static str> {
        if cfg!(windows) { return vec!["lightwarden-quick-win.exe"]; }
        let kde = std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|d| d.to_uppercase().contains("KDE"));
        if kde { vec!["lightwarden-quick-qt", "lightwarden-quick-gtk.py"] } else { vec!["lightwarden-quick-gtk.py", "lightwarden-quick-qt"] }
    }

    fn spawn(app: &AppHandle) -> Option<(Child, Pipe)> {
        let dir = app.path().resource_dir().ok()?.join("quick");
        for name in helpers() {
            let path = dir.join(name);
            if !path.exists() { continue; }
            let mut cmd = if name.ends_with(".py") { let mut c = Command::new("python3"); c.arg(&path); c } else { Command::new(&path) };
            let Ok(mut child) = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).spawn() else { continue };
            // a helper that cannot start (missing Qt, no PyGObject) dies at once: try the next one
            std::thread::sleep(std::time::Duration::from_millis(400));
            if child.try_wait().ok().flatten().is_some() { continue; }
            let (Some(stdin), Some(out)) = (child.stdin.take(), child.stdout.take()) else { continue };
            let pipe: Pipe = Arc::new(Mutex::new(stdin));
            let (app, w) = (app.clone(), pipe.clone());
            std::thread::spawn(move || for line in BufReader::new(out).lines().map_while(Result::ok) {
                let Ok(req) = serde_json::from_str::<Value>(&line) else { continue };
                let (app, w) = (app.clone(), w.clone());
                // one thread per request: an unlock may block for seconds, search must stay responsive
                std::thread::spawn(move || {
                    let res = handle(&app, req["cmd"].as_str().unwrap_or(""), &req["arg"].to_string());
                    let _ = writeln!(w.lock().unwrap(), r#"{{"id":{},"res":{res}}}"#, req["id"]);
                });
            });
            return Some((child, pipe));
        }
        None
    }

    /// False when no helper is installed or it cannot run: the caller falls back to the main window.
    pub fn toggle(app: &AppHandle, pos: Option<(f64, f64)>) -> bool {
        let mut g = CHILD.lock().unwrap();
        if g.as_mut().is_some_and(|(c, _)| c.try_wait().ok().flatten().is_some()) { *g = None; }
        if g.is_none() && !GAVE_UP.load(Ordering::Relaxed) {
            *g = spawn(app);
            if g.is_none() { GAVE_UP.store(true, Ordering::Relaxed); }
        }
        let Some((_, pipe)) = g.as_ref() else { return false };
        let (x, y) = pos.unwrap_or((-1.0, -1.0));
        let ok = writeln!(pipe.lock().unwrap(), r#"{{"event":"toggle","x":{x},"y":{y}}}"#).is_ok();
        if !ok { *g = None; }
        ok
    }
}

pub use native::{init, toggle};

fn handle(app: &AppHandle, cmd: &str, arg: &str) -> String {
    let arg: Value = serde_json::from_str(arg).unwrap_or_default();
    let s = |k: &str| arg[k].as_str().unwrap_or("").to_string();
    let out = match cmd {
        "state" => Ok(state(app)),
        "search" => search(app, &s("q")),
        "copy" => copy(app, &s("id"), &s("field")),
        "unlock" => unlock(app, &s("mode"), s("value")),
        "open" => { show_main(app); Ok(json!({})) }
        "lock" => { lock_all(app); let _ = app.emit("locked", ()); Ok(json!({})) }
        _ => Err("unknown command".into()),
    };
    out.unwrap_or_else(|e: String| json!({ "error": e })).to_string()
}

fn state(app: &AppHandle) -> Value {
    let state = app.state::<Mutex<App>>();
    let a = state.lock().unwrap();
    let fr = crate::updater::french();
    let Some(acc) = a.store.accounts.get(a.store.current) else { return json!({ "state": "none", "fr": fr }) };
    let (e, sealed) = (&acc.email, a.sealed.contains_key(&acc.email));
    json!({
        "state": if a.sessions.contains_key(e) { "open" } else { "locked" }, "email": e, "fr": fr,
        "pin": sealed && a.pin_keys.contains_key(e), "system": sealed && a.sys_keys.contains_key(e),
    })
}

fn current_session(app: &AppHandle) -> Result<std::sync::Arc<Mutex<crate::api::Session>>, String> {
    let state = app.state::<Mutex<App>>();
    let a = state.lock().unwrap();
    a.sessions.get(&a.current_email()?).cloned().ok_or_else(|| tx("Coffre verrouillé.", "Vault locked.").into())
}

fn search(app: &AppHandle, q: &str) -> Result<Value, String> {
    let sess = current_session(app)?;
    let sess = sess.lock().unwrap();
    let q = q.to_lowercase();
    let (base, icons) = {
        let state = app.state::<Mutex<App>>();
        let a = state.lock().unwrap();
        a.store.accounts.get(a.store.current).map(|x| (crate::icons_base(x), x.settings.website_icons)).unwrap_or_default()
    };
    let d = |i: &crate::vault::Item, k: &str| i.data.get(k).cloned().unwrap_or_default();
    let mut hits: Vec<_> = sess.vault.items.iter().filter(|i| i.kind == 1 && (q.is_empty()
        || [i.name.clone(), d(i, "username"), d(i, "uri")].iter().any(|f| f.to_lowercase().contains(&q)))).collect();
    hits.sort_by_key(|i| i.name.to_lowercase());
    let items: Vec<_> = hits.iter().take(50).map(|i| json!({
        "id": i.id, "name": i.name, "user": d(i, "username"), "icon": host(&d(i, "uri")).filter(|_| icons).map(|h| format!("{base}/{h}/icon.png")), "totp": !d(i, "totp").is_empty(),
    })).collect();
    Ok(json!({ "items": items }))
}

fn copy(app: &AppHandle, id: &str, field: &str) -> Result<Value, String> {
    let text = {
        let sess = current_session(app)?;
        let sess = sess.lock().unwrap();
        let item = sess.vault.items.iter().find(|i| i.id == id).ok_or("Introuvable.")?;
        let get = |k: &str| item.data.get(k).cloned().unwrap_or_default();
        match field {
            "user" => get("username"),
            "pass" => get("password"),
            "totp" => totp(get("totp"))?.code,
            _ => String::new(),
        }
    };
    if text.is_empty() { return Err(tx("Champ vide.", "Empty field.").into()); }
    crate::copy_text(&app.state::<Mutex<App>>(), text)?;
    Ok(json!({}))
}

/// Blocks (called from the panel's background queue): Argon2 / the keychain prompt / the network take a while.
fn unlock(app: &AppHandle, mode: &str, value: String) -> Result<Value, String> {
    let state = app.state::<Mutex<App>>();
    tauri::async_runtime::block_on(async {
        match mode {
            "pin" => unlock_pin(value, app.state()).await?,
            "system" => unlock_system_at(app.state(), app.get_webview_window("main").map_or(0, |w| crate::hwnd(&w))).await?,
            _ => {
                let (email, kind, url) = {
                    let a = state.lock().unwrap();
                    let acc = a.store.accounts.get(a.store.current).ok_or("Aucun compte.")?;
                    (acc.email.clone(), acc.server_kind, acc.server_url.clone())
                };
                if let crate::LoginOutcome::NeedCode { .. } = crate::login(kind, url, email, value, String::new(), app.state()).await? {
                    return Err(tx("Double authentification requise : ouvrez Lightwarden.", "Two-step login needed: open Lightwarden.").to_string());
                }
            }
        }
        Ok::<_, String>(())
    })?;
    let _ = app.emit("unlocked", ()); // the main window repaints
    Ok(json!({}))
}

/// Hostname of a login URI (same rule as `L.host` in ui/logic.js), None if it is not a plain host.
fn host(uri: &str) -> Option<String> {
    let rest = uri.split_once("://").map_or(uri, |x| x.1);
    let auth = rest.split(['/', '?', '#']).next()?.rsplit('@').next()?;
    let h = auth.split(':').next()?.to_lowercase();
    (!h.is_empty() && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')).then_some(h)
}

#[cfg(test)]
mod tests {
    #[test]
    fn host_of_uri() {
        assert_eq!(super::host("https://User@Account.Google.com:8443/x?y").as_deref(), Some("account.google.com"));
        assert_eq!(super::host("example.org/path").as_deref(), Some("example.org"));
        assert_eq!(super::host("androidapp://com.x"), Some("com.x".into()));
        assert_eq!(super::host(""), None);
    }
}
