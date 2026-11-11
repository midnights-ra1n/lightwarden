<p align="center">
  <img src="icons/128x128.png" width="96" alt="Lightwarden">
</p>

<h1 align="center">Lightwarden</h1>

<p align="center">Un client de bureau léger et natif pour Bitwarden, écrit en Rust avec Tauri.</p>

---

## Fonctionnalités

- **Compatible Bitwarden** : bitwarden.com, bitwarden.eu ou serveur auto-hébergé (Vaultwarden…).
- **Plusieurs comptes** à la fois, chacun avec ses propres réglages.
- **Chiffrement de bout en bout** côté client (PBKDF2 / Argon2id, AES-CBC + HMAC), comme le client officiel.
- **Édition complète** des éléments, dossiers imbriqués, glisser-déposer.
- **Clés SSH** : import (y compris chiffrées), génération et **agent SSH** intégré.
- **Déverrouillage par code PIN**.
- **Icône dans la barre système** : verrouiller tous les coffres en un clic, rester en arrière-plan.
- **Thème clair / sombre**.
- **Mises à jour automatiques** signées (voir plus bas).

## Installation

Télécharger la dernière version depuis la page [Releases](https://github.com/midnights-ra1n/lightwarden/releases) :

| Système | Fichier |
|---|---|
| Windows | `Lightwarden_x.y.z_x64-setup.exe` |
| macOS (Intel et Apple Silicon) | `Lightwarden_x.y.z_universal.dmg` |
| Linux | `.AppImage`, `.deb` ou `.rpm` |

> macOS : l'application n'est pas notariée. Au premier lancement, faire clic droit → **Ouvrir**.

## Déverrouillage par code PIN

**Paramètres → Sécurité → Déverrouiller avec un code PIN** : choisissez puis confirmez un code
(4 caractères minimum). Le coffre verrouillé se rouvre ensuite avec ce code.

- La clé du coffre est chiffrée avec une clé dérivée du PIN (Argon2id, 64 Mio) et ne reste qu'en mémoire.
- Après un redémarrage de Lightwarden, ou après 5 codes erronés, le mot de passe maître est demandé une fois.
- Décocher l'option supprime le code PIN.

## Agent SSH

Lightwarden peut servir d'agent SSH : les éléments de type **Clé SSH** des coffres déverrouillés
sont utilisables par `ssh`, `git`, etc., sans jamais écrire la clé privée sur le disque.

Activez **Paramètres → Paramètres de l'application → Activer l'agent SSH**, puis configurez votre système
(les mêmes instructions sont affichées dans l'application).

### Linux et macOS

L'agent écoute sur `~/.lightwarden-ssh-agent.sock`.

1. Pour toutes les connexions SSH (terminal, Git, éditeurs…), ajoutez au début de `~/.ssh/config` :

   ```
   Host *
     IdentityAgent ~/.lightwarden-ssh-agent.sock
   ```

2. Pour `ssh-add` et les autres outils, ajoutez à `~/.bashrc` ou `~/.zshrc` (macOS : `~/.zshrc`) :

   ```sh
   export SSH_AUTH_SOCK="$HOME/.lightwarden-ssh-agent.sock"
   ```

   Fish : `set -Ux SSH_AUTH_SOCK $HOME/.lightwarden-ssh-agent.sock`

   Applications graphiques lancées hors terminal :
   - Linux : créez `~/.config/environment.d/lightwarden.conf` contenant
     `SSH_AUTH_SOCK=${HOME}/.lightwarden-ssh-agent.sock`, puis reconnectez-vous ;
   - macOS : `launchctl setenv SSH_AUTH_SOCK "$HOME/.lightwarden-ssh-agent.sock"` (à refaire après chaque redémarrage).

3. Vérifiez avec `ssh-add -L`.

### Windows

L'agent utilise le canal nommé d'OpenSSH (`\\.\pipe\openssh-ssh-agent`) et remplace donc l'agent intégré à Windows.

1. Dans PowerShell **ouvert en administrateur** :

   ```powershell
   Stop-Service ssh-agent; Set-Service ssh-agent -StartupType Disabled
   ```

2. Décochez puis recochez **Activer l'agent SSH**.
3. Vérifiez avec `ssh-add -L` dans un nouveau terminal.
4. Git for Windows utilise son propre `ssh` ; faites-lui utiliser celui de Windows :

   ```powershell
   git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"
   ```

### Bon à savoir

- Clés prises en charge : Ed25519, ECDSA (P-256, P-384, P-521) et RSA (signatures `rsa-sha2-256` / `rsa-sha2-512`).
- **Autorisation** : chaque utilisation peut être confirmée dans une fenêtre (toujours, une fois jusqu'au verrouillage, ou jamais).
- Si tous les coffres sont verrouillés lors d'une demande, Lightwarden s'ouvre et laisse une minute pour en déverrouiller un.
- Avec beaucoup de clés, un serveur peut répondre « Too many authentication failures ». Exportez la clé publique
  voulue et précisez-la par hôte dans `~/.ssh/config` :

  ```
  Host github.com
    IdentityFile ~/.ssh/github.pub
    IdentitiesOnly yes
  ```

## Mises à jour

Lightwarden recherche une mise à jour au lancement puis une fois par jour. Si l'option
**Paramètres → Mettre à jour automatiquement** est active (par défaut), la mise à jour est
téléchargée en arrière-plan et une notification prévient quand elle est prête ; un clic
l'installe et relance l'application. Les boutons *Vérifier* et *Mettre à jour* des paramètres
permettent de le faire manuellement.

Chaque paquet est signé ; une mise à jour dont la signature ne correspond pas est refusée.

Deux canaux :

- **stable** : versions finales (`1.2.0`).
- **beta** : pré-versions (`1.3.0-beta.1`) ; les utilisateurs beta reçoivent aussi les nouvelles versions stables.

## Développement

Prérequis : Rust stable, Node.js, et sous Linux `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`.

```sh
npx @tauri-apps/cli dev     # lancer en mode développement
npx @tauri-apps/cli build   # produire les paquets
```

Les builds locaux sont sur le canal `dev` : la mise à jour automatique y est désactivée.

Tests :

```sh
cargo test
node --test tests/logic.test.js
bash tests/next-version.test.sh
bash tests/publish-newer.test.sh
```

## Publier une version

| Branche | Rôle |
|---|---|
| `dev` | développement courant |
| `unstable` | chaque push publie une **beta** |
| `stable` | chaque push publie une **version stable** |

Le workflow `.github/workflows/release.yml` calcule la version à partir des messages de commit
([Conventional Commits](https://www.conventionalcommits.org/fr/)) depuis la dernière version stable :

- `fix: …` → correctif (`1.0.0` → `1.0.1`)
- `feat: …` → mineure (`1.0.0` → `1.1.0`)
- `feat!: …` ou `BREAKING CHANGE` → majeure (`1.0.0` → `2.0.0`)

Une version plus haute écrite à la main dans `tauri.conf.json` est prioritaire.

Il compile pour Windows, macOS et Linux, signe les paquets, publie la release puis met à jour
le canal lu par l'application (release `channels`, à ne pas supprimer).

Secrets GitHub nécessaires : `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
La clé publique correspondante est dans `tauri.conf.json` (`plugins.updater.pubkey`) ;
**perdre la clé privée empêche toute mise à jour des installations existantes.**

## Licence

Projet indépendant, non affilié à Bitwarden Inc.
