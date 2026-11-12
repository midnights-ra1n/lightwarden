# Roadmap

Ideas not built yet, roughly in priority order. Done items are in the README.

## Next

- **Auto-type**: type the login and password into the foreground app (KeePassXC style).
- **Passkeys / FIDO2**: store and use them, through a browser extension or the system API. Large.
- **Browser integration**: native messaging to fill forms. Large, but changes daily use the most.
- **Fuller SSH agent**: confirmation on every use (or with Touch ID), list of keys in use, signature log.
- **Bitwarden Send**: create and manage text / file Sends, with expiry and auto-delete.

## Vault hygiene

- **Vault health report**: weak, reused or breached passwords (HIBP, k-anonymity), sites without 2FA, non-HTTPS URLs.
- **Password history and trash** with restore.
- **Attachments**: upload, download, preview, client-side encrypted.
- **2FA at login**: only authenticator app and email are supported today; add YubiKey / FIDO2.

## Comfort

- **Import / export** from 1Password, KeePass, Chrome, LastPass; encrypted export.
- **Organizations and collections**: sharing, filters, permissions.
- **Duplicate detection** and merge.
- **Compact mode / collapsed sidebar**, pinned favourites at the top of the list.
- **Changelog** in the update window.

## Known gaps in what shipped

- Auto-lock does not react to system sleep or screen lock yet (only inactivity and "Immediately" = window hidden or minimized).
- Quick search is a global shortcut that brings the main window up with the search focused, not a separate Spotlight-style mini window.
- Steam Guard (`steam://`) TOTP secrets are not supported.
- The global shortcut is fixed (`Cmd/Ctrl+Shift+Space`); it is not configurable.
