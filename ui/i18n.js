'use strict';
// Runtime translation. The UI source text is French; other languages map it, string by string, through
// the dictionaries below. A MutationObserver translates text and tooltips as screens render, so app.js
// stays free of t() calls. Anything inside [translate="no"] (vault data) is left alone.
// To add a language: add a dictionary to LANGS (and an <option> in SEL.language in app.js).
(function (root) {
  const norm = (s) => s.replace(/’/g, "'");

  const EN = {
    // item types & schema
    'Tous les éléments': 'All items', 'Identifiants': 'Logins', 'Identifiant': 'Login', 'Cartes': 'Cards', 'Carte': 'Card',
    'Identités': 'Identities', 'Identité': 'Identity', 'Notes sécurisées': 'Secure notes', 'Note sécurisée': 'Secure note',
    'Clés SSH': 'SSH keys', 'Clé SSH': 'SSH key', "Nom d'utilisateur": 'Username', 'Mot de passe': 'Password',
    "Clé d'authentification (TOTP)": 'Authenticator key (TOTP)', 'Site web': 'Website', 'Titulaire': 'Cardholder name',
    'Marque': 'Brand', 'Numéro': 'Number', "Mois d'expiration": 'Expiration month', "Année d'expiration": 'Expiration year',
    'Code de sécurité': 'Security code', 'Civilité': 'Title', 'Prénom': 'First name', 'Deuxième prénom': 'Middle name',
    'Nom': 'Name', 'Société': 'Company', 'N° de sécurité sociale': 'Social security number', 'N° de passeport': 'Passport number',
    'N° de permis de conduire': "Driver's license number", 'Contact': 'Contact', 'E-mail': 'Email', 'Téléphone': 'Phone',
    'Adresse': 'Address', 'Adresse (suite)': 'Address (line 2)', 'Code postal': 'Postal code', 'Ville': 'City', 'Région': 'State / region',
    'Pays': 'Country', 'Clé privée': 'Private key', 'Clé publique': 'Public key', 'Empreinte': 'Fingerprint', 'Auto-hébergé': 'Self-hosted',
    // login
    'Connexion': 'Sign in', 'Coffre verrouillé': 'Vault locked', 'Connectez-vous à votre compte Bitwarden': 'Sign in to your Bitwarden account',
    'Saisissez votre mot de passe maître pour déverrouiller': 'Enter your master password to unlock', 'Serveur': 'Server',
    'URL du serveur': 'Server URL', 'Adresse e-mail': 'Email address', 'Mot de passe maître': 'Master password', 'Afficher': 'Show',
    'Masquer': 'Hide', 'Se connecter': 'Sign in', 'Déverrouiller': 'Unlock', 'Utiliser le code PIN': 'Use PIN',
    'Annuler': 'Cancel', 'Changer de compte': 'Switch account', 'Code PIN': 'PIN', 'Utiliser le mot de passe maître': 'Use master password',
    'Déverrouillage…': 'Unlocking…', 'Connexion…': 'Signing in…', 'Définir un code PIN': 'Set a PIN', 'Définir le code PIN': 'Set PIN',
    'Confirmer le code PIN': 'Confirm PIN',
    'Le code PIN déverrouille ce coffre sans votre mot de passe maître. Après un redémarrage de Lightwarden, ou après 5 codes erronés, le mot de passe maître est demandé une fois.':
      'The PIN unlocks this vault without your master password. After Lightwarden restarts, or after 5 wrong PINs, the master password is asked for once.',
    'Le code PIN doit comporter au moins 4 caractères.': 'The PIN must be at least 4 characters long.',
    'Les deux codes PIN ne correspondent pas.': 'The two PINs do not match.',
    'Nouvel appareil : saisissez le code reçu par e-mail.': 'New device: enter the code sent by email.',
    "Saisissez le code de votre application d'authentification.": 'Enter the code from your authenticator app.',
    'Saisissez le code reçu par e-mail.': 'Enter the code sent by email.',
    // shell
    'Dossiers': 'Folders', 'Nouveau dossier': 'New folder', 'Verrouiller': 'Lock', 'Synchroniser': 'Sync',
    'Raccourcis clavier': 'Keyboard shortcuts', 'Paramètres': 'Settings', 'Rechercher dans le coffre': 'Search the vault',
    'Effacer': 'Clear', 'Nouvel élément': 'New item', 'Tout développer': 'Expand all', 'Tout réduire': 'Collapse all',
    'Créer un dossier': 'Create a folder', 'Aucun résultat': 'No results', 'Aucun élément': 'No items',
    "Essayez avec d'autres mots-clés.": 'Try different keywords.', 'Créez un élément avec': 'Create an item with',
    'ou glissez-en un ici.': 'or drag one here.', 'Aucun élément sélectionné': 'No item selected', 'Utilisez': 'Use',
    'pour rechercher,': 'to search,', 'pour créer,': 'to create,', "pour l'aide.": 'for help.',
    // menus
    "Copier le nom d'utilisateur": 'Copy username', 'Copier le mot de passe': 'Copy password', "Copier l'URL": 'Copy URL',
    'Ouvrir le site web': 'Open website', 'Copier le numéro': 'Copy number', 'Copier le code de sécurité': 'Copy security code',
    'Copier la clé publique': 'Copy public key', 'Exporter la clé privée…': 'Export private key…',
    'Exporter la clé publique…': 'Export public key…', 'Copier le nom': 'Copy name', 'Copier les notes': 'Copy notes',
    'Modifier': 'Edit', 'Déplacer vers…': 'Move to…', 'Supprimer': 'Delete', 'Suppr': 'Del', 'Nouvel élément ici': 'New item here',
    'Nouveau sous-dossier': 'New subfolder', 'Renommer': 'Rename', 'Développer': 'Expand', 'Réduire': 'Collapse',
    'Déverrouillé': 'Unlocked', 'Verrouillé': 'Locked', 'Ajouter un compte': 'Add account', 'Retirer ce compte…': 'Remove this account…',
    'Copier': 'Copy', 'Copié': 'Copied', 'Fermer': 'Close', 'Échap': 'Esc',
    // folders & items
    'Nom du dossier': 'Folder name', 'Créer': 'Create', 'Dossier créé': 'Folder created', 'Renommer le dossier': 'Rename folder',
    'Nouveau nom': 'New name', 'Dossier renommé': 'Folder renamed', 'Supprimer le dossier': 'Delete folder', 'Dossier supprimé': 'Folder deleted',
    'Aucun dossier': 'No folder', 'la racine': 'the root', 'Déplacer vers': 'Move to', 'Déplacer': 'Move',
    "Supprimer l'élément": 'Delete item', 'Élément envoyé à la corbeille': 'Item moved to the trash',
    'à la corbeille ? Vous pourrez le restaurer depuis le coffre web.': 'to the trash? You can restore it from the web vault.',
    'Corbeille': 'Trash', 'Élément supprimé': 'Deleted item', 'Restaurer': 'Restore', 'Élément restauré': 'Item restored',
    'Vider la corbeille': 'Empty trash', 'Vider': 'Empty', 'Corbeille vidée': 'Trash emptied',
    'Supprimer définitivement': 'Delete permanently', 'Élément supprimé définitivement': 'Item permanently deleted',
    'Cette action est irréversible.': 'This action cannot be undone.', 'Supprimer définitivement les': 'Permanently delete the',
    'éléments de la corbeille ?': 'items in the trash?',
    'Envoyer': 'Send', 'Coffre synchronisé': 'Vault synced', 'Clé privée exportée': 'Private key exported', 'Clé publique exportée': 'Public key exported',
    'Exporter la clé privée': 'Export private key', 'Exporter la clé publique': 'Export public key', 'Cet élément est vide.': 'This item is empty.',
    'Modifications non enregistrées': 'Unsaved changes', 'Abandonner les modifications en cours ?': 'Discard your changes?', 'Abandonner': 'Discard',
    "Modifier l'élément": 'Edit item', 'Générer': 'Generate', 'Rempli automatiquement': 'Filled automatically', 'Dossier': 'Folder',
    'Enregistrer': 'Save', 'Importer un fichier…': 'Import a file…', 'Générer une clé Ed25519': 'Generate an Ed25519 key',
    "… ou glissez-déposez un fichier de clé privée ici. La clé publique et l'empreinte se remplissent automatiquement.":
      '… or drop a private key file here. The public key and fingerprint are filled in automatically.',
    'Remplacer la clé': 'Replace key', 'Remplacer la clé actuelle par une nouvelle clé générée ?': 'Replace the current key with a newly generated one?',
    'Remplacer': 'Replace', 'Clé Ed25519 générée': 'Ed25519 key generated', 'Le nom est obligatoire.': 'The name is required.',
    "La clé privée n'est pas valide.": 'The private key is not valid.', 'Élément enregistré': 'Item saved', 'Élément créé': 'Item created',
    "Cette clé est protégée : importez-la via « Importer un fichier » pour saisir sa phrase de passe.": 'This key is protected: import it with “Import a file” to enter its passphrase.',
    'Clé protégée': 'Protected key', 'Phrase de passe de la clé (elle sera stockée déchiffrée dans le coffre, comme dans Bitwarden)': 'Key passphrase (it will be stored decrypted in the vault, as in Bitwarden)',
    'Clé importée': 'Key imported', 'Fichier trop volumineux pour une clé.': 'File too large for a key.',
    'Retirer le compte': 'Remove account', 'Retirer': 'Remove', 'de Lightwarden ? Le coffre reste intact sur le serveur.': 'from Lightwarden? The vault stays intact on the server.',
    'Une application demande une clé SSH : déverrouillez un coffre.': 'An application is requesting an SSH key: unlock a vault.',
    // shortcuts
    'Rechercher': 'Search', 'Naviguer dans la liste': 'Navigate the list', 'Double-clic': 'Double-click', 'Renommer le dossier sélectionné': 'Rename the selected folder',
    'Filtrer par type': 'Filter by type', 'Menu contextuel': 'Context menu', 'Fermer / annuler / effacer la recherche': 'Close / cancel / clear search', 'ou': 'or',
    "Glissez un élément sur un dossier pour l'y déplacer, ou un dossier sur un autre pour l'imbriquer. Déposez un fichier de clé SSH n'importe où pour l'importer.":
      'Drag an item onto a folder to move it, or a folder onto another to nest it. Drop an SSH key file anywhere to import it.',
    // settings
    "Au redémarrage de l'application": 'When the app restarts', 'Immédiatement': 'Immediately', '1 heure': '1 hour', 'Jamais': 'Never',
    'Se déconnecter': 'Log out', '10 secondes': '10 seconds', '20 secondes': '20 seconds', '30 secondes': '30 seconds',
    'Toujours demander': 'Always ask', "Se souvenir jusqu'au verrouillage du coffre": 'Remember until the vault is locked', 'Ne jamais demander': 'Never ask',
    'Système': 'System', 'Clair': 'Light', 'Sombre': 'Dark', 'Par défaut': 'Default', 'Sécurité': 'Security', 'Préférences': 'Preferences',
    "Délai d'expiration de la session": 'Session timeout', "Action à l'expiration": 'Timeout action', 'Déverrouiller avec un code PIN': 'Unlock with PIN',
    "Déverrouiller avec l'authentification du système": 'Unlock with system authentication', 'Effacer le presse-papiers': 'Clear clipboard',
    'Efface automatiquement les valeurs copiées de votre presse-papiers.': 'Automatically clears copied values from your clipboard.',
    'Réduire lors de la copie dans le presse-papiers': 'Minimize on copy', "Réduit l'application lors de la copie des données d'un élément.": 'Minimizes the app when copying an item’s data.',
    'Afficher les icônes des sites web': 'Show website icons', "Les icônes sont récupérées depuis le service d'icônes de votre serveur.": 'Icons are fetched from your server’s icon service.',
    "Paramètres de l'application (tous les comptes)": 'App settings (all accounts)', "Garder Lightwarden en cours d'exécution en arrière-plan": 'Keep Lightwarden running in the background',
    "À la fermeture de la fenêtre, Lightwarden reste accessible depuis la zone de notification. Recommandé avec l'agent SSH.": 'When the window is closed, Lightwarden stays available from the tray. Recommended with the SSH agent.',
    'Démarrer automatiquement à la connexion': 'Start automatically at login', "Démarre Lightwarden à l'ouverture de session.": 'Starts Lightwarden when you log in.',
    "Utiliser l'accélération matérielle": 'Use hardware acceleration', 'Désactivez-la uniquement en cas de problèmes graphiques. Redémarrage requis.': 'Turn it off only if you have graphics issues. Restart required.',
    "Activer l'agent SSH": 'Enable SSH agent', 'Signe les demandes SSH directement depuis votre coffre.': 'Signs SSH requests directly from your vault.',
    "Demander une autorisation lors de l'utilisation de l'agent SSH": 'Ask for approval when the SSH agent is used', "Choisir comment gérer les demandes d'autorisation de l'agent SSH.": 'Choose how SSH agent approval requests are handled.',
    'Afficher les actions de copie rapide dans le coffre': 'Show quick copy actions in the vault', 'Thème': 'Theme', "Modifier la couleur du thème de l'application.": 'Change the app’s colour theme.',
    'Déverrouiller avec l\'authentification du système': 'Unlock with system authentication',
    'Touch ID, Windows Hello ou le mot de passe de la session. Le mot de passe maître est demandé après un redémarrage de Lightwarden.': 'Touch ID, Windows Hello or your session password. The master password is asked again after Lightwarden restarts.',
    'Authentification du système activée': 'System authentication on', 'Authentification du système désactivée': 'System authentication off',
    'Démarrer réduit': 'Start minimized', 'Au démarrage de la session, Lightwarden reste dans la zone de notification (ou le Dock) sans ouvrir la fenêtre. Nécessite le démarrage automatique.': 'When your session starts, Lightwarden stays in the notification area (or Dock) without opening its window. Requires automatic start.',
    'Serveur hors ligne : le coffre est en lecture seule': 'Server offline: the vault is read-only', 'Serveur hors ligne : lecture seule': 'Server offline: read-only',
    'Connexion rétablie : coffre synchronisé': 'Back online: vault synced', 'Hors ligne · lecture seule': 'Offline · read-only',
    'Mode hors ligne (cache local)': 'Offline mode (local cache)',
    'Si le serveur est injoignable, le coffre reste consultable depuis la copie locale, en lecture seule, et se resynchronise dès que le serveur revient.': 'If the server is unreachable, the vault stays available from the local copy, read-only, and re-syncs as soon as the server is back.',
    'Langue': 'Language', 'Un redémarrage est requis.': 'A restart is required.', 'Code PIN défini': 'PIN set', 'Code PIN supprimé': 'PIN removed',
    'Stable': 'Stable', 'Bêta': 'Beta', 'Développement': 'Development', 'Mises à jour': 'Updates', 'Rechercher des mises à jour': 'Check for updates',
    'Mettre à jour': 'Update', 'Mettre à jour automatiquement': 'Update automatically',
    'Recherche une mise à jour à chaque lancement puis chaque jour, la télécharge en arrière-plan et vous prévient quand elle est prête.': 'Checks for an update at each launch and then daily, downloads it in the background and notifies you when it is ready.',
    'Mises à jour désactivées pour les compilations locales.': 'Updates are disabled for local builds.', 'Recherche en cours…': 'Checking…',
    'Lightwarden est à jour.': 'Lightwarden is up to date.', "L'agent est désactivé.": 'The agent is disabled.',
    "Configurer l'agent SSH": 'Set up the SSH agent', 'Commande': 'Command',
    "Indiquez l'agent à SSH, pour toutes les connexions (terminal, Git, éditeurs…), en ajoutant au début de": 'Point SSH at the agent, for all connections (terminal, Git, editors…), by adding this at the top of',
    'Pour que': 'So that', 'et les autres outils le trouvent aussi, ajoutez à': 'and other tools find it too, add to', 'puis ouvrez un nouveau terminal :': 'then open a new terminal:',
    'ou': 'or', 'Applications graphiques lancées hors terminal : créez': 'GUI apps started outside a terminal: create', 'avec la ligne suivante, puis reconnectez-vous.': 'with the following line, then log in again.',
    'Vérifiez :': 'Verify:', 'Fish :': 'Fish:', 'Applications graphiques lancées hors terminal (à refaire après chaque redémarrage) :': 'GUI apps started outside a terminal (redo after each restart):',
    "Lightwarden remplace l'agent OpenSSH intégré à Windows. Désactivez ce service dans PowerShell": 'Lightwarden replaces the OpenSSH agent built into Windows. Disable that service in PowerShell',
    'ouvert en administrateur': 'opened as administrator', "Décochez puis recochez « Activer l'agent SSH » ci-dessus.": 'Untick then tick “Enable SSH agent” above.',
    'Vérifiez dans un nouveau terminal :': 'Verify in a new terminal:', 'Git for Windows utilise son propre ssh : faites-lui utiliser celui de Windows.': 'Git for Windows uses its own ssh: make it use the Windows one.',
    'Seuls les éléments de type': 'Only items of type',
    "des coffres déverrouillés sont proposés. Si tous les coffres sont verrouillés, Lightwarden s'ouvre et vous laisse une minute pour en déverrouiller un. Avec beaucoup de clés, un serveur peut refuser la connexion (« Too many authentication failures ») : exportez la clé publique voulue et précisez-la par hôte dans":
      'in unlocked vaults are offered. If all vaults are locked, Lightwarden opens and gives you a minute to unlock one. With many keys, a server may refuse the connection (“Too many authentication failures”): export the public key you want and set it per host in',
    'avec': 'with', 'et': 'and',
    // About
    'À propos de Lightwarden': 'About Lightwarden', 'Gestionnaire de mots de passe compatible Bitwarden': 'Bitwarden-compatible password manager',
    'Code source sur GitHub': 'Source code on GitHub', 'Signaler un problème': 'Report an issue', 'Licence': 'License',
    'Client non officiel, indépendant de Bitwarden Inc.': 'Unofficial client, not affiliated with Bitwarden Inc.',
    // generator, TOTP, auto-lock, quick search
    'Générateur de mots de passe': 'Password generator', 'Générer': 'Generate', 'Régénérer': 'Regenerate', 'Type': 'Type', 'Phrase secrète': 'Passphrase',
    'Longueur': 'Length', 'Majuscules (A-Z)': 'Uppercase (A-Z)', 'Minuscules (a-z)': 'Lowercase (a-z)', 'Chiffres (0-9)': 'Digits (0-9)', 'Symboles (!@#$…)': 'Symbols (!@#$…)',
    'Éviter les caractères ambigus (I, l, 1, O, 0)': 'Avoid ambiguous characters (I, l, 1, O, 0)', 'Nombre de mots': 'Number of words', 'Séparateur': 'Separator',
    'Majuscule à chaque mot': 'Capitalize each word', 'Ajouter un chiffre': 'Add a digit', 'Utiliser ce mot de passe': 'Use this password',
    'Faible': 'Weak', 'Correct': 'Fair', 'Fort': 'Strong', 'Excellent': 'Excellent', 'Fermer (Échap)': 'Close (Esc)', 'Fermer': 'Close',
    'Historique des mots de passe': 'Password history', 'Ancien mot de passe': 'Old password',
    'Code de vérification': 'Verification code', 'Code à usage unique': 'One-time code', 'Copier le code': 'Copy code', 'Code TOTP': 'TOTP code',
    'Clé TOTP invalide.': 'Invalid TOTP key.', "Steam Guard n'est pas pris en charge.": 'Steam Guard is not supported.',
    '« Immédiatement » verrouille dès que la fenêtre est masquée ou réduite.': '“Immediately” locks as soon as the window is hidden or minimized.',
    'Raccourci global de recherche rapide': 'Global quick-search shortcut', 'Espace': 'Space',
    'Affiche Lightwarden avec la recherche active, depuis n\'importe quelle application :': 'Brings up Lightwarden with the search focused, from any application:',
    'Recherche rapide (depuis n\'importe quelle application)': 'Quick search (from any application)',
    // Rust errors
    "URL non prise en charge": 'Unsupported URL', "Saisissez l'e-mail et le mot de passe maître.": 'Enter your email and master password.',
    "Saisissez l'URL du serveur.": 'Enter the server URL.', 'Prélogin refusé par le serveur (URL incorrecte ?).': 'Prelogin refused by the server (wrong URL?).',
    "Cette méthode de double authentification n'est pas encore prise en charge (application d'authentification ou e-mail uniquement).": 'This two-step login method is not supported yet (authenticator app or email only).',
    'Session expirée : verrouillez puis reconnectez-vous.': 'Session expired: lock the vault and sign in again.', 'Nom de dossier vide.': 'Empty folder name.',
    'Impossible de déplacer un dossier dans lui-même.': 'A folder cannot be moved into itself.', 'Dossier introuvable.': 'Folder not found.',
    'Nom de dossier invalide (« / » vide).': 'Invalid folder name (empty “/”).', 'Trop de tentatives : saisissez votre mot de passe maître.': 'Too many attempts: enter your master password.',
    "Fichier trop volumineux pour une clé.": 'File too large for a key.', "Ce fichier n'est pas un fichier texte.": 'This file is not a text file.', 'Phrase de passe incorrecte.': 'Wrong passphrase.',
    'Format non reconnu : seules les clés OpenSSH (« BEGIN OPENSSH PRIVATE KEY ») sont prises en charge.': 'Unrecognised format: only OpenSSH keys (“BEGIN OPENSSH PRIVATE KEY”) are supported.',
  };

  // [regex, builder]. Captured parts are translated recursively; the builder gets the translated parts.
  const EN_PAT = [
    [/^(.+) copié$/, (a) => `${a} copied`],
    [/^Copie impossible : (.*)$/, (a) => `Copy failed: ${a}`],
    [/^Résultats pour « (.*) »$/, (a) => `Results for “${a}”`],
    [/^(\d+) éléments?$/, (n) => `${n} item${n === '1' || n === '0' ? '' : 's'}`],
    [/^(\d+) sous-dossiers?$/, (n) => `${n} subfolder${n === '1' ? '' : 's'}`],
    [/^Nouveau sous-dossier dans « (.*) »$/, (a) => `New subfolder in “${a}”`],
    [/^Déplacé vers « (.*) »$/, (a) => `Moved to “${a}”`],
    [/^Dossier déplacé vers « (.*) »$/, (a) => `Folder moved to “${a}”`],
    [/^Dossier de destination pour « (.*) »$/, (a) => `Destination folder for “${a}”`],
    [/^Paramètres de l'application pour (.*)$/, (a) => `App settings for ${a}`],
    [/^\? Cela concerne (.*)\.$/, (a) => `? This affects ${a}.`],
    [/^(\d+ éléments?) \(déplacés dans « Aucun dossier », pas supprimés\)$/, (a) => `${a} (moved to “No folder”, not deleted)`],
    [/^(\d+ sous-dossiers?) et (\d+ éléments? \(.*\))$/, (a, b) => `${a} and ${b}`],
    [/^Déverrouillé · (.*)$/, (a) => `Unlocked · ${a}`],
    [/^Verrouillé · (.*)$/, (a) => `Locked · ${a}`],
    [/^Version (.+) · canal (.+)$/, (a, b) => `Version ${a} · ${b} channel`],
    [/^La version (.+) est disponible\.$/, (a) => `Version ${a} is available.`],
    [/^La version (.+) est prête à être installée\.$/, (a) => `Version ${a} is ready to install.`],
    [/^Installation de la version (.+)…$/, (a) => `Installing version ${a}…`],
    [/^Téléchargement de la version (.+)…(.*)$/, (a, b) => `Downloading version ${a}…${b}`],
    [/^Agent actif : (.*)$/, (a) => `Agent running: ${a}`],
    [/^Erreur : (.*)$/, (a) => `Error: ${a}`],
    [/^Code PIN incorrect \((\d+) essais? restants?\)\.$/, (n) => `Wrong PIN (${n} attempt${n === '1' ? '' : 's'} left).`],
    [/^Impossible de joindre le serveur \((.*)\)\.$/, (a) => `Cannot reach the server (${a}).`],
    [/^Le serveur a refusé l'opération \(HTTP (\d+)\)\. ?(.*)$/, (a, b) => `The server refused the operation (HTTP ${a}). ${b}`.trim()],
    [/^Impossible de créer (.*) \((.*)\)\.$/, (a, b) => `Cannot create ${a} (${b}).`],
  ];

  const LANGS = { en: { dict: EN, pat: EN_PAT } };
  let cur = null;

  function lookup(core) {
    if (!cur) return undefined;
    const k = norm(core).replace(/\s+/g, ' ');
    if (Object.prototype.hasOwnProperty.call(cur.dict, k)) return cur.dict[k];
    for (const [re, f] of cur.pat) {
      const m = k.match(re);
      if (m) return f(...m.slice(1).map((x) => tr(x)));
    }
    // "Label (Ctrl+N)" tooltips: translate the label, keep the shortcut.
    const m = k.match(/^(.*\S) (\([^()]*\))$/);
    if (m) { const h = lookup(m[1]); if (h !== undefined) return `${h} ${m[2]}`; }
    return undefined;
  }

  function tr(s) {
    const m = String(s).match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2]) return s;
    const out = lookup(m[2]);
    return out === undefined ? s : m[1] + out + m[3];
  }

  const ATTRS = ['title', 'placeholder', 'aria-label'];
  const skip = (n) => {
    const el = n.nodeType === 1 ? n : n.parentElement;
    return !el || el.closest('[translate="no"],script,style,textarea');
  };
  function walk(node) {
    if (node.nodeType === 3) {
      if (!skip(node)) { const v = tr(node.nodeValue); if (v !== node.nodeValue) node.nodeValue = v; }
      return;
    }
    if (node.nodeType !== 1 || skip(node)) return;
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (v) { const t = tr(v); if (t !== v) node.setAttribute(a, t); }
    }
    node.childNodes.forEach(walk);
  }

  let obs = null;
  function setLang(code) {
    cur = LANGS[code] || null;
    if (typeof document === 'undefined') return; // unit tests
    document.documentElement.lang = cur ? code : 'fr';
    if (!cur) return;
    walk(document.body);
    if (obs) return;
    obs = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') walk(m.target);
        else walk(m.target);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // 0 = system language, 1 = French, 2 = English (matches GlobalSettings.language).
  function resolve(setting) {
    if (setting === 1) return 'fr';
    if (setting === 2) return 'en';
    return /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
  }

  if (typeof module !== 'undefined') module.exports = { setLang, resolve, tr }; else root.I18N = { setLang, resolve, tr: (s) => tr(s) };
})(this);
