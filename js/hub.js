/* Jukebox – Übersicht aller Spiele. Die Spiele stehen in apps.json (neues Spiel = neuer Eintrag). */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Farbthemen wie in Musik-Bingo und Needle Drop (gleiche Namen → gleiche Einstellung überall)
const THEMES = [['graphit', 'Graphit', '#3a4252', '#1f3a32'], ['ozean', 'Ozean', '#0b4f75', '#0d6e66'], ['wald', 'Wald', '#1d5a3a', '#4c5b1a'],
  ['abend', 'Abend', '#7a2e1c', '#7d1f4a'], ['lila', 'Lila', '#4a22a0', '#8a1458'], ['oled', 'OLED', '#000', '#000']];
const TAGS = { group: 'Gruppe', solo: 'Allein', lobby: 'Lobby per QR-Code', daily: 'Tägliche Challenge', spotify: 'mit Spotify', nologin: 'ohne Anmeldung' };

const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- Design: für alle Spiele gemeinsam ---------- */
let theme = store.get('hub.theme') || store.get('mq.theme') || store.get('mb_settings')?.theme || 'graphit';
function applyTheme() {
  if (!THEMES.some(t => t[0] === theme)) theme = 'graphit';
  document.documentElement.dataset.theme = theme;
  $('meta[name=theme-color]').content = { graphit: '#0c0c0f', lila: '#0d0a1a', ozean: '#05111a', abend: '#130a0b', wald: '#08110c', oled: '#000000' }[theme];
  $('#themeRow').innerHTML = THEMES.map(([id, name, a, b]) =>
    `<button class="theme-pick ${theme === id ? 'on' : ''}" data-theme-pick="${id}"><i style="background:linear-gradient(135deg,${a},${b})"></i>${tx(name)}</button>`).join('');
}
function setTheme(t) {
  theme = t;
  store.set('hub.theme', t);
  store.set('mq.theme', t);                                        // Needle Drop
  const mb = store.get('mb_settings'); if (mb && typeof mb === 'object') { mb.theme = t; store.set('mb_settings', mb); } // Musik-Bingo (nur wenn schon benutzt)
  applyTheme();
}

/* ---------- Spiele ---------- */
let DATA = null;
async function load() {
  try { DATA = await (await fetch('apps.json?v=' + Date.now().toString(36).slice(0, 5))).json(); }
  catch { $('#apps').innerHTML = `<p class="hub-foot">${tx('Die Spieleliste konnte nicht geladen werden.')}</p>`; return; }
  render();
}
function render() {
  if (!DATA) return;
  const pick = o => (o && (o[LANG] || o.de)) || '';
  document.title = DATA.title;
  $('#hubTitle').textContent = DATA.title;
  $('#apps').innerHTML = DATA.apps.map(a => `
    <a class="app glass" href="${esc(a.url)}" style="--c:${esc(a.color || '#888')}">
      <img class="app-ic" src="${esc(a.icon)}" alt="" loading="lazy">
      <div class="app-body">
        <h2>${esc(a.name)}</h2>
        <p>${esc(pick(a.desc))}</p>
        <div class="app-tags">${(a.tags || []).map(t => `<span class="pill">${esc(tx(TAGS[t] || t))}</span>`).join('')}</div>
      </div>
      <span class="app-go"><svg class="ic"><use href="#i-play"/></svg><span>${tx('Spielen')}</span></span>
    </a>`).join('');
}

/* ---------- Einstellungen ---------- */
const sheet = $('#sheet');
$('#btnSettings').onclick = () => { $('#langSel').innerHTML = langOptions(); applyTheme(); sheet.showModal(); };
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });
$('#langSel').onchange = e => setLang(e.target.value);
$('#themeRow').onclick = e => { const b = e.target.closest('[data-theme-pick]'); if (b) setTheme(b.dataset.themePick); };
self.liveLang = () => { render(); applyTheme(); };

applyTheme();
load();
