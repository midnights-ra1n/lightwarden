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
    use windows::{
        core::{factory, HSTRING},
        Foundation::IAsyncOperation,
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
        entry(email)?.set_secret(&s).map_err(|e| e.to_string())?;
        Ok(s)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    { let _ = email; Err("Authentification du système non prise en charge.".into()) }
}

pub fn secret(email: &str) -> Result<[u8; 32], String> {
    #[cfg(any(target_os = "macos", windows))]
    { entry(email)?.get_secret().map_err(|e| e.to_string())?.try_into().map_err(|_| "Secret illisible.".to_string()) }
    #[cfg(not(any(target_os = "macos", windows)))]
    { let _ = email; Err("Authentification du système non prise en charge.".into()) }
}

pub fn clear_secret(email: &str) {
    #[cfg(any(target_os = "macos", windows))]
    if let Ok(e) = entry(email) { let _ = e.delete_credential(); }
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = email;
}
