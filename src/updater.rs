//! Self-update: checks the release channel at launch and daily, downloads in the background
//! (signature verified by tauri-plugin-updater), notifies, and installs from a small progress window.
use serde::Serialize;
use std::{sync::Mutex, time::{Duration, SystemTime}};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Set by CI (`stable` or `beta`). Local builds are `dev` and never self-update.
pub const CHANNEL: &str = match option_env!("LIGHTWARDEN_CHANNEL") { Some(c) => c, None => "dev" };
const REPO: &str = "midnights-ra1n/lightwarden";
const CHECK_EVERY: Duration = Duration::from_secs(24 * 3600);

#[derive(Clone, Serialize, Default)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Status {
    #[default]
    Idle,
    Disabled,
    Checking,
    UpToDate,
    Available { version: String, notes: String },
    Downloading { version: String, done: u64, total: Option<u64> },
    Ready { version: String, notes: String },
    Installing { version: String },
    Error { message: String },
}

#[derive(Default)]
pub struct Updater {
    status: Status,
    update: Option<Update>,
    bytes: Option<Vec<u8>>, // verified package, ready to install
    busy: bool,             // a check or download is running
    last_check: Option<SystemTime>,
    notified: Option<String>,
}
type U = Mutex<Updater>;

#[derive(Serialize)]
pub struct Info {
    version: String,
    channel: &'static str,
    pub status: Status,
}

/// UI language setting (0 system, 1 French, 2 English); set once at startup, changing it needs a restart.
pub static LANG: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

pub fn french() -> bool {
    match LANG.load(std::sync::atomic::Ordering::Relaxed) {
        1 => true,
        2 => false,
        _ => sys_locale::get_locale().is_some_and(|l| l.to_lowercase().starts_with("fr")),
    }
}

fn set(app: &AppHandle, s: Status) {
    if !matches!(s, Status::Downloading { .. }) {
        eprintln!("[updater] {}", serde_json::to_string(&s).unwrap_or_default());
    }
    app.state::<U>().lock().unwrap().status = s.clone();
    let _ = app.emit("update-status", s);
}

pub fn info(app: &AppHandle) -> Info {
    Info { version: app.package_info().version.to_string(), channel: CHANNEL, status: app.state::<U>().lock().unwrap().status.clone() }
}

fn endpoint() -> String {
    // compile-time override for local end-to-end tests only; packages must still be signed with our key
    match option_env!("LIGHTWARDEN_UPDATE_ENDPOINT") {
        Some(u) => u.to_string(),
        None => format!("https://github.com/{REPO}/releases/download/channels/{CHANNEL}.json"),
    }
}

/// Checks the channel; with `download`, fetches the package right away (auto-update).
pub async fn check(app: AppHandle, download: bool) {
    if CHANNEL == "dev" {
        return set(&app, Status::Disabled);
    }
    {
        let state = app.state::<U>();
        let mut u = state.lock().unwrap();
        // never interrupt a download or drop an update that is already waiting to be installed
        if u.busy || matches!(u.status, Status::Ready { .. } | Status::Installing { .. }) { return; }
        u.busy = true;
        u.last_check = Some(SystemTime::now());
    }
    set(&app, Status::Checking);
    let res = async {
        let url = tauri::Url::parse(&endpoint()).map_err(|e| e.to_string())?;
        app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?
            .build().map_err(|e| e.to_string())?
            .check().await.map_err(|e| e.to_string())
    }.await;
    let found = match res {
        Ok(None) => { set(&app, Status::UpToDate); None }
        Ok(Some(up)) => {
            let (version, notes) = (up.version.clone(), up.body.clone().unwrap_or_default());
            app.state::<U>().lock().unwrap().update = Some(up);
            set(&app, Status::Available { version: version.clone(), notes });
            Some(version)
        }
        Err(e) => { set(&app, Status::Error { message: friendly(&e) }); None }
    };
    app.state::<U>().lock().unwrap().busy = false;
    if found.is_some() && download {
        fetch(app).await;
    }
}

fn friendly(e: &str) -> String {
    let fr = french();
    if e.contains("404") || e.contains("Could not fetch a valid release JSON") {
        return if fr { "Aucune version publiée sur ce canal pour le moment." } else { "No release published on this channel yet." }.into();
    }
    if e.to_lowercase().contains("signature") {
        return if fr { "Signature de la mise à jour invalide : installation refusée." } else { "Invalid update signature: installation refused." }.into();
    }
    format!("{} ({e})", if fr { "Impossible de vérifier les mises à jour" } else { "Could not check for updates" })
}

/// Downloads (and verifies) the pending update, then notifies that it is ready.
pub async fn fetch(app: AppHandle) -> bool {
    let up = {
        let state = app.state::<U>();
        let mut u = state.lock().unwrap();
        if u.bytes.is_some() { return true; }
        if u.busy { return false; }
        let Some(up) = u.update.clone() else { return false };
        u.busy = true;
        up
    };
    let version = up.version.clone();
    let mut done = 0u64;
    let mut last_emit = 0u64;
    let res = up.download(
        |chunk, total| {
            done += chunk as u64;
            // ~1% steps keep the event channel quiet
            if done - last_emit >= total.unwrap_or(u64::MAX / 2) / 100 || Some(done) == total {
                last_emit = done;
                set(&app, Status::Downloading { version: version.clone(), done, total });
            }
        },
        || {},
    ).await;
    let ok = match res {
        Ok(bytes) => {
            let notes = up.body.clone().unwrap_or_default();
            let first = {
                let state = app.state::<U>();
                let mut u = state.lock().unwrap();
                u.bytes = Some(bytes);
                u.notified.replace(version.clone()).as_deref() != Some(version.as_str())
            };
            set(&app, Status::Ready { version: version.clone(), notes });
            if first { notify_ready(&app, &version); }
            true
        }
        Err(e) => { set(&app, Status::Error { message: friendly(&e.to_string()) }); false }
    };
    app.state::<U>().lock().unwrap().busy = false;
    ok
}

/// Opens the progress window and installs (downloading first if needed), then restarts.
pub fn begin_install(app: &AppHandle) {
    if matches!(app.state::<U>().lock().unwrap().status, Status::Installing { .. }) {
        if let Some(w) = app.get_webview_window("update") { let _ = w.set_focus(); }
        return;
    }
    if app.get_webview_window("update").is_none() {
        let title = if french() { "Mise à jour de Lightwarden" } else { "Updating Lightwarden" };
        let built = WebviewWindowBuilder::new(app, "update", WebviewUrl::App("update.html".into()))
            .title(title).inner_size(400.0, 168.0).resizable(false).maximizable(false).minimizable(false)
            .center().always_on_top(true).focused(true).build();
        if let Err(e) = built { eprintln!("update window: {e}"); }
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // a background check/download may be running: wait for it instead of failing
        while !fetch(app.clone()).await {
            if !app.state::<U>().lock().unwrap().busy {
                return; // nothing to install or download failed: the window shows the status
            }
            tokio_sleep(Duration::from_millis(300)).await;
        }
        let (up, bytes) = {
            let state = app.state::<U>();
            let mut u = state.lock().unwrap();
            (u.update.clone(), u.bytes.take())
        };
        let (Some(up), Some(bytes)) = (up, bytes) else { return };
        set(&app, Status::Installing { version: up.version.clone() });
        // let the window paint the "installing" state before the installer takes over
        tokio_sleep(Duration::from_millis(400)).await;
        match up.install(&bytes) {
            Ok(()) => app.restart(), // Windows: the installer already exited the app
            Err(e) => {
                app.state::<U>().lock().unwrap().bytes = Some(bytes);
                set(&app, Status::Error { message: format!("{} ({e})", if french() { "Échec de l'installation" } else { "Installation failed" }) });
            }
        }
    });
}

async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

/// Launch check, then a daily one. Polls hourly against wall-clock time so that
/// sleep/suspend (which pauses monotonic timers) does not postpone the daily check.
pub fn start_background(app: AppHandle, auto_download: impl Fn(&AppHandle) -> bool + Send + 'static) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(8));
        loop {
            let due = app.state::<U>().lock().unwrap().last_check
                .is_none_or(|t| t.elapsed().map_or(true, |e| e >= CHECK_EVERY));
            if due {
                tauri::async_runtime::block_on(check(app.clone(), auto_download(&app)));
            }
            std::thread::sleep(Duration::from_secs(3600));
        }
    });
}

fn notify_ready(app: &AppHandle, version: &str) {
    let (title, body) = if french() {
        ("Mise à jour prête", format!("Lightwarden {version} est prêt à être installé. Cliquez pour mettre à jour."))
    } else {
        ("Update ready", format!("Lightwarden {version} is ready to install. Click to update."))
    };
    let app = app.clone();
    std::thread::spawn(move || {
        #[cfg(not(windows))]
        {
            let mut n = notify_rust::Notification::new();
            n.appname("Lightwarden").summary(title).body(&body).icon("lightwarden")
                .action("default", if french() { "Mettre à jour" } else { "Update" });
            #[cfg(target_os = "linux")]
            n.hint(notify_rust::Hint::DesktopEntry("lightwarden".into()));
            match n.show() {
                Ok(h) => h.wait_for_action(|a| if a == "default" { begin_install(&app) }),
                Err(e) => eprintln!("notification: {e}"),
            }
        }
        #[cfg(windows)]
        {
            // AppUserModelID registered by the NSIS installer = bundle identifier
            let app2 = app.clone();
            let r = tauri_winrt_notification::Toast::new(&app.config().identifier)
                .title(title).text1(&body)
                .on_activated(move |_| { begin_install(&app2); Ok(()) })
                .show();
            if let Err(e) = r { eprintln!("notification: {e}"); }
        }
    });
}
