'use strict';
// Progress window shown while an update is downloaded/installed. Text follows the system language.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const $ = (s) => document.querySelector(s);

let fr = true;
const t = (f, e) => (fr ? f : e);

function show(s) {
  const bar = $('#bar'), fill = $('#fill'), sub = $('#sub'), close = $('#close');
  bar.className = 'bar';
  sub.className = 'muted';
  close.classList.add('hidden');
  $('#title').textContent = t('Mise à jour…', 'Updating…');
  switch (s.state) {
    case 'downloading': {
      const pct = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : null;
      if (pct === null) bar.classList.add('indeterminate'); else fill.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', pct ?? 0);
      sub.textContent = t(`Téléchargement de la version ${s.version}`, `Downloading version ${s.version}`) + (pct === null ? '…' : ` — ${pct} %`);
      break;
    }
    case 'ready':
    case 'installing':
      bar.classList.add('indeterminate');
      sub.textContent = t(`Installation de la version ${s.version}… Lightwarden va redémarrer.`, `Installing version ${s.version}… Lightwarden will restart.`);
      break;
    case 'checking':
    case 'available':
    case 'idle':
      bar.classList.add('indeterminate');
      sub.textContent = t('Préparation…', 'Preparing…');
      break;
    case 'up_to_date':
      fill.style.width = '100%';
      $('#title').textContent = t('Lightwarden est à jour', 'Lightwarden is up to date');
      sub.textContent = '';
      close.classList.remove('hidden');
      break;
    default: // error, disabled
      bar.classList.add('error');
      $('#title').textContent = t('La mise à jour a échoué', 'Update failed');
      sub.className = 'err';
      sub.textContent = s.message || t('Mises à jour désactivées pour cette version.', 'Updates are disabled for this build.');
      close.classList.remove('hidden');
  }
  close.textContent = t('Fermer', 'Close');
}

$('#close').onclick = () => window.__TAURI__.window.getCurrentWindow().close();
(async () => {
  try { fr = await invoke('french'); } catch { /* default French */ }
  document.documentElement.lang = fr ? 'fr' : 'en';
  document.title = t('Mise à jour de Lightwarden', 'Updating Lightwarden');
  await listen('update-status', (e) => show(e.payload));
  show((await invoke('update_info')).status);
})();
