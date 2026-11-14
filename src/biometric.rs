//! System authentication prompt (Touch ID / Apple Watch / password on macOS, Windows Hello) and the
//! OS-keychain slot holding the secret that a successful prompt releases.
//! shortcut: no Linux backend (no common API), `available()` is false there; add polkit/fprintd if asked.

#[cfg(target_os = "macos")]
mod sys {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAPolicy};

    pub fn available() -> bool {
        unsafe { LAContext::new().canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthentication).is_ok() }
    }

    pub fn verify(reason: &str, _window: isize) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let reply = RcBlock::new(move |ok: Bool, err: *mut NSError| {
            let r = if ok.as_bool() { Ok(()) } else {
                Err(unsafe { err.as_ref() }.map(|e| e.localizedDescription().to_string()).unwrap_or_else(|| "Authentification refusée.".into()))
            };
            let _ = tx.send(r);
        });
        unsafe { LAContext::new().evaluatePolicy_localizedReason_reply(LAPolicy::DeviceOwnerAuthentication, &NSString::from_str(reason), &reply) };
        rx.recv().map_err(|e| e.to_string())?
    }
}

#[cfg(windows)]
mod sys {
    use windows_future::IAsyncOperation;
    use windows::{
        core::{factory, HSTRING},
        Security::Credentials::UI::{UserConsentVerificationResult as R, UserConsentVerifier, UserConsentVerifierAvailability},
        Win32::{Foundation::HWND, System::{Com::{CoInitializeEx, COINIT_MULTITHREADED}, WinRT::IUserConsentVerifierInterop}},
    };

    pub fn available() -> bool {
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        UserConsentVerifier::CheckAvailabilityAsync().and_then(|o| o.join()).map_or(false, |a| a == UserConsentVerifierAvailability::Available)
    }

    /// `window` is the HWND of the main window so the Hello dialog opens in front of it.
    pub fn verify(reason: &str, window: isize) -> Result<(), String> {
        let e = |e: windows::core::Error| e.message();
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        let interop = factory::<UserConsentVerifier, IUserConsentVerifierInterop>().map_err(e)?;
        let op: IAsyncOperation<R> = unsafe { interop.RequestVerificationForWindowAsync(HWND(window as _), &HSTRING::from(reason)) }.map_err(e)?;
        match op.join().map_err(e)? {
            R::Verified => Ok(()),
            R::Canceled => Err("Authentification annulée.".into()),
            R::RetriesExhausted => Err("Trop de tentatives, réessayez plus tard.".into()),
            _ => Err("Authentification du système indisponible.".into()),
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod sys {
    pub fn available() -> bool { false }
    pub fn verify(_: &str, _: isize) -> Result<(), String> { Err("Authentification du système non prise en charge.".into()) }
}

pub use sys::{available, verify};

/// macOS: the app is ad-hoc signed, so its code hash changes on every update and the keychain item's
/// "creator app only" ACL (plus its cdhash partition) re-prompts for the login keychain password; it cannot be
/// loosened without that same prompt. The secret therefore lives in an item created and read by Apple's `security`
/// tool, whose identity never changes: no prompt, ever. Unlocking is still gated by the Touch ID prompt in `verify`.
/// shortcut: any same-user process can run `security` and read it; sign with a stable Developer ID and use a normal item.
#[cfg(target_os = "macos")]
mod cli {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use std::process::Command;
    const SVC: &str = "app.lightwarden.unlock.v2"; // the v1 items (keyring) carry the per-build ACL

    fn run(args: &[&str]) -> Result<String, String> {
        let o = Command::new("/usr/bin/security").args(args).output().map_err(|e| e.to_string())?;
        if o.status.success() { Ok(String::from_utf8_lossy(&o.stdout).trim().to_string()) }
        else { Err(String::from_utf8_lossy(&o.stderr).trim().to_string()) }
    }
    pub fn set(email: &str, secret: &[u8]) -> Result<(), String> {
        run(&["add-generic-password", "-U", "-a", email, "-s", SVC, "-w", &B64.encode(secret)]).map(|_| ()).map_err(|e| format!("Keychain: {e}"))
    }
    pub fn get(email: &str) -> Option<[u8; 32]> {
        B64.decode(run(&["find-generic-password", "-a", email, "-s", SVC, "-w"]).ok()?).ok()?.try_into().ok()
    }
    pub fn delete(email: &str) { let _ = run(&["delete-generic-password", "-a", email, "-s", SVC]); }
}

#[cfg(any(target_os = "macos", windows))]
fn entry(email: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("app.lightwarden.unlock", email).map_err(|e| e.to_string())
}

/// Stores a fresh random 32-byte secret for `email` in the OS keychain and returns it.
pub fn new_secret(email: &str) -> Result<[u8; 32], String> {
    #[cfg(any(target_os = "macos", windows))]
    {
        let mut s = [0u8; 32];
        getrandom::fill(&mut s).map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        { cli::set(email, &s)?; if let Ok(e) = entry(email) { let _ = e.delete_credential(); } }
        #[cfg(windows)]
        entry(email)?.set_secret(&s).map_err(|e| e.to_string())?;
        Ok(s)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    { let _ = email; Err("Authentification du système non prise en charge.".into()) }
}

pub fn secret(email: &str) -> Result<[u8; 32], String> {
    #[cfg(target_os = "macos")]
    if let Some(s) = cli::get(email) { return Ok(s); }
    #[cfg(any(target_os = "macos", windows))]
    {
        let s: [u8; 32] = entry(email)?.get_secret().map_err(|e| e.to_string())?.try_into().map_err(|_| "Secret illisible.".to_string())?;
        // macOS: an item from before `cli` (this read may prompt one last time): move it, then drop the old one
        #[cfg(target_os = "macos")]
        if cli::set(email, &s).is_ok() { let _ = entry(email).map(|e| e.delete_credential()); }
        Ok(s)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    { let _ = email; Err("Authentification du système non prise en charge.".into()) }
}

pub fn clear_secret(email: &str) {
    #[cfg(any(target_os = "macos", windows))]
    if let Ok(e) = entry(email) { let _ = e.delete_credential(); }
    #[cfg(target_os = "macos")]
    cli::delete(email);
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = email;
}


#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn keychain_roundtrip() {
        let e = "zz-roundtrip@example.invalid";
        super::cli::set(e, &[9u8; 32]).unwrap();
        assert_eq!(super::cli::get(e), Some([9u8; 32]));
        super::cli::set(e, &[5u8; 32]).unwrap(); // update in place
        assert_eq!(super::cli::get(e), Some([5u8; 32]));
        super::cli::delete(e);
        assert_eq!(super::cli::get(e), None);
    }
}
