<p align="center">
  <img src="icons/128x128.png" width="96" alt="Lightwarden">
</p>

<h1 align="center">Lightwarden</h1>

<p align="center">A lightweight, native desktop client for Bitwarden, written in Rust with Tauri.</p>

---

## Features

- **Bitwarden compatible**: bitwarden.com, bitwarden.eu or self-hosted servers (Vaultwarden…).
- **Multiple accounts** at once, each with its own settings.
- **End-to-end encryption** on the client (PBKDF2 / Argon2id, AES-CBC + HMAC), like the official client.
- **Full item editing**, nested folders, drag and drop.
- **SSH keys**: import (including encrypted ones), generation and a built-in **SSH agent**.
- **PIN unlock**.
- **Password and passphrase generator** (`Cmd/Ctrl+G`): length, character classes, ambiguous characters, EFF word list.
- **Live TOTP codes** on login items, with a countdown and one-click copy (SHA-1/256/512, `otpauth://` URIs).
- **Auto-lock** on inactivity (1 min to 1 hour), or as soon as the window is hidden or minimized; lock or log out.
- **Clipboard clearing** after 10 s to 5 min; copied secrets are kept out of clipboard history managers.
- **Global quick search** (`Cmd/Ctrl+Shift+Space`): brings Lightwarden up with the search focused, from any app.
- **Tray icon**: lock every vault in one click, keep running in the background.
- **macOS menu bar** with vault, account, view and help menus.
- **Light / dark theme**.
- **Languages**: English and French (follows the system language, or pick one in Settings).
- **Signed automatic updates** (see below).

See [ROADMAP.md](ROADMAP.md) for what is planned.

## Installation

Download the latest version from the [Releases](https://github.com/midnights-ra1n/lightwarden/releases) page:

| System | File |
|---|---|
| Windows | `Lightwarden_x.y.z_x64-setup.exe` |
| macOS (Intel and Apple Silicon) | `Lightwarden_x.y.z_universal.dmg` |
| Linux | `.AppImage`, `.deb` or `.rpm` |

> macOS: the app is not notarized. On first launch, right-click → **Open**.

## Language

**Settings → App settings → Language**: *Default* (system language), *Français* or *English*.
A restart is required. Interface text is French in the source; `ui/i18n.js` maps it to other
languages, so adding one means adding a dictionary there (and an option in `SEL.language` in `ui/app.js`).
Text inside `translate="no"` elements (vault data) is never translated.

## PIN unlock

**Settings → Security → Unlock with PIN**: choose and confirm a PIN (4 characters minimum).
The locked vault can then be reopened with it.

- The vault key is encrypted with a key derived from the PIN (Argon2id, 64 MiB) and only kept in memory.
- After Lightwarden restarts, or after 5 wrong PINs, the master password is asked for once.
- Unticking the option removes the PIN.

## SSH agent

Lightwarden can act as an SSH agent: **SSH key** items of unlocked vaults can be used by `ssh`, `git`, etc.,
without the private key ever being written to disk.

Enable **Settings → App settings → Enable SSH agent**, then configure your system
(the same instructions are shown in the app).

### Linux and macOS

The agent listens on `~/.lightwarden-ssh-agent.sock`.

1. For every SSH connection (terminal, Git, editors…), add this at the top of `~/.ssh/config`:

   ```
   Host *
     IdentityAgent ~/.lightwarden-ssh-agent.sock
   ```

2. For `ssh-add` and other tools, add this to `~/.bashrc` or `~/.zshrc` (macOS: `~/.zshrc`):

   ```sh
   export SSH_AUTH_SOCK="$HOME/.lightwarden-ssh-agent.sock"
   ```

   Fish: `set -Ux SSH_AUTH_SOCK $HOME/.lightwarden-ssh-agent.sock`

   GUI applications started outside a terminal:
   - Linux: create `~/.config/environment.d/lightwarden.conf` containing
     `SSH_AUTH_SOCK=${HOME}/.lightwarden-ssh-agent.sock`, then log in again;
   - macOS: `launchctl setenv SSH_AUTH_SOCK "$HOME/.lightwarden-ssh-agent.sock"` (redo after each restart).

3. Verify with `ssh-add -L`.

### Windows

The agent uses OpenSSH's named pipe (`\\.\pipe\openssh-ssh-agent`), so it replaces the agent built into Windows.

1. In PowerShell **opened as administrator**:

   ```powershell
   Stop-Service ssh-agent; Set-Service ssh-agent -StartupType Disabled
   ```

2. Untick then tick **Enable SSH agent**.
3. Verify with `ssh-add -L` in a new terminal.
4. Git for Windows uses its own `ssh`; make it use the Windows one:

   ```powershell
   git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"
   ```

### Good to know

- Supported keys: Ed25519, ECDSA (P-256, P-384, P-521) and RSA (`rsa-sha2-256` / `rsa-sha2-512` signatures).
- **Approval**: each use can be confirmed in a dialog (always, once until the vault is locked, or never).
- If every vault is locked when a request comes in, Lightwarden opens and gives you a minute to unlock one.
- With many keys, a server may answer "Too many authentication failures". Export the public key you want
  and set it per host in `~/.ssh/config`:

  ```
  Host github.com
    IdentityFile ~/.ssh/github.pub
    IdentitiesOnly yes
  ```

## Updates

Lightwarden checks for an update at launch and then once a day. If
**Settings → Update automatically** is on (the default), the update is downloaded in the background
and a notification tells you when it is ready; one click installs it and restarts the app.
The *Check for updates* and *Update* buttons in Settings do it manually.

Every package is signed; an update whose signature does not match is refused.

Two channels:

- **stable**: final releases (`1.2.0`).
- **beta**: pre-releases (`1.3.0-beta.1`); beta users also receive new stable versions.

## Development

Requirements: stable Rust, Node.js, and on Linux `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`.

```sh
cargo install tauri-cli --version "^2" --locked
cargo tauri dev                      # run in development mode
cargo tauri build                    # produce packages
cargo tauri build --bundles dmg -c '{"bundle":{"createUpdaterArtifacts":false}}'   # local macOS DMG, no signing key needed
```

Local builds are on the `dev` channel: automatic updates are disabled there.

Icons are generated from `assets/*.svg` by `scripts/make-icons.sh` (needs ImageMagick 7). The PNGs must be
8-bit RGBA, and Tauri embeds them at compile time: after changing an icon, `touch src/main.rs` to force a rebuild.

Tests:

```sh
cargo test
node tests/logic.test.js
node tests/i18n.test.js
node tests/generator.test.js
bash tests/next-version.test.sh
bash tests/publish-newer.test.sh
```

## Releasing

| Branch | Role |
|---|---|
| `dev` | day-to-day development |
| `unstable` | every push publishes a **beta** |
| `stable` | every push publishes a **stable release** |

The `.github/workflows/release.yml` workflow computes the version from commit messages
([Conventional Commits](https://www.conventionalcommits.org/)) since the last stable release:

- `fix: …` → patch (`1.0.0` → `1.0.1`)
- `feat: …` → minor (`1.0.0` → `1.1.0`)
- `feat!: …` or `BREAKING CHANGE` → major (`1.0.0` → `2.0.0`)

A higher version written by hand in `tauri.conf.json` takes precedence.

It builds for Windows, macOS and Linux, signs the packages, publishes the release and then updates
the channel file read by the app (the `channels` release, do not delete it).

Required GitHub secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
The matching public key is in `tauri.conf.json` (`plugins.updater.pubkey`);
**losing the private key makes it impossible to update existing installs.**

## License

Independent project, not affiliated with Bitwarden Inc.
