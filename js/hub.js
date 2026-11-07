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
  // Musik-Bingo: ergänzt fehlende Einstellungen selbst mit Standardwerten – ein Objekt nur mit theme ist darum unbedenklich
  const mb = store.get('mb_settings');
  store.set('mb_settings', { ...(mb && typeof mb === 'object' ? mb : {}), theme: t });
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
/* ---------- Spielerprofil (gilt in allen Spielen) ---------- */
function renderProfile() {
  const p = Profile.get();
  $('#profEmoji').textContent = p.emoji;
  if (document.activeElement !== $('#profName')) $('#profName').value = p.name;
  $('#profName').placeholder = tx('Dein Name');
  $('#hello').textContent = p.name ? tx('Hallo {n}! Wähle ein Spiel', { n: p.emoji + ' ' + p.name }) : tx('Wähle ein Spiel');
}
$('#profEmoji').onclick = () => { Profile.nextEmoji(); renderProfile(); };
$('#profName').oninput = () => { Profile.set({ name: $('#profName').value }); renderProfile(); };
$('#profName').onkeydown = e => { if (e.key === 'Enter') $('#profName').blur(); };

$('#btnSettings').onclick = () => openSheet();
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });
$('#langSel').onchange = e => setLang(e.target.value);
$('#themeRow').onclick = e => { const b = e.target.closest('[data-theme-pick]'); if (b) setTheme(b.dataset.themePick); };
self.liveLang = () => { render(); applyTheme(); renderProfile(); renderSync(); };

/* ---------- Auf allen Geräten: persönlicher Code (js/sync.js) ---------- */
const SYNC_LINK = c => 'https://ku3rb1s.github.io/jukebox/#code=' + c;
let syncPending = '', syncMsg = '';
const ICON = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
function syncAgo(t) {
  if (!t) return tx('noch nicht abgeglichen');
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return tx('gerade eben abgeglichen');
  if (m < 60) return tx('vor {n} Min. abgeglichen', { n: m });
  if (m < 60 * 24) return tx('vor {n} Std. abgeglichen', { n: Math.round(m / 60) });
  return tx('abgeglichen am {d}', { d: new Date(t).toLocaleDateString(LANG) });
}
function syncLine(s) {
  if (s.err === 'offline') return '⚠️ ' + tx('Offline – wird nachgeholt');
  if (s.err === 'gone') return '⚠️ ' + tx('Dieser Code wurde gelöscht');
  if (s.err) return '⚠️ ' + tx('Abgleich gerade nicht möglich');
  return '✓ ' + syncAgo(s.last);
}
/** Gefährliche Knöpfe: erst beim zweiten Antippen ausführen */
function arm(btn, label, fn) {
  btn.onclick = () => {
    if (btn.dataset.armed) { delete btn.dataset.armed; return fn(); }
    btn.dataset.armed = '1'; const old = btn.querySelector('.lbl').textContent; btn.querySelector('.lbl').textContent = label;
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.querySelector('.lbl').textContent = old; } }, 4000);
  };
}
function renderSync() {
  const s = Sync.status(), box = $('#syncBox');
  $('#syncCta').innerHTML = `<span class="sc-ic">${ICON('cloud')}</span><span class="grow"><b>${s.connected ? tx('Auf allen Geräten verbunden') : tx('Auf allen Geräten spielen')}</b>
    <span class="sub">${s.connected ? esc(s.code) + ' · ' + esc(syncLine(s)) : tx('Rekorde, Serie und Profil mit einem Code mitnehmen')}</span></span>${ICON('chev')}`;
  $('#syncCta').classList.toggle('on', s.connected);
  if (!s.connected) {
    box.innerHTML = `
      <button class="cell tap" id="syncNew"><span class="cell-ic" style="background:linear-gradient(135deg,#ff4f86,#fbbf24)">${ICON('plus')}</span>
        <span class="grow">${tx('Neuen Code erstellen')}<span class="sub">${tx('Auf deinem ersten Gerät')}</span></span>${ICON('chev')}</button>
      <div class="cell sync-join"><span class="cell-ic" style="background:#0ea5e9">${ICON('key')}</span>
        <input id="syncInput" class="bare" placeholder="${tx('Code eingeben')}" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" enterkeyhint="go" value="${esc(syncPending)}">
        <button class="sync-go" id="syncJoin">${tx('Verbinden')}</button></div>`;
    $('#syncFoot').innerHTML = (syncMsg ? `<b class="sync-msg">${esc(syncMsg)}</b><br>` : '') +
      tx('Mit deinem persönlichen Code hast du Rekorde, Statistik, Tages-Challenge und Profil auf jedem Gerät – ohne Konto und ohne E-Mail.');
    $('#syncNew').onclick = async () => {
      $('#syncNew').disabled = true; syncMsg = '';
      try { await Sync.create(); }
      catch (e) { syncMsg = e.message === 'limit' ? tx('Heute wurden über diesen Internetanschluss schon 3 Codes erstellt. Morgen geht es wieder – oder verbinde dich mit einem vorhandenen Code.') : tx('Keine Verbindung – versuch es gleich nochmal.'); }
      renderSync();
    };
    const join = async () => {
      const v = $('#syncInput').value;
      if (!Sync.normCode(v)) { syncMsg = tx('Der Code hat 12 Zeichen, z. B. K7QM-2XD9-HF4P.'); syncPending = v; return renderSync(); }
      $('#syncJoin').disabled = true; $('#syncJoin').textContent = '…';
      try { await Sync.join(v); syncPending = ''; syncMsg = ''; renderProfile(); applyTheme(); }
      catch (e) { syncPending = v; syncMsg = e.message === 'unknown' ? tx('Diesen Code gibt es nicht (mehr). Vertippt?') : tx('Keine Verbindung – versuch es gleich nochmal.'); }
      renderSync();
    };
    $('#syncJoin').onclick = join;
    $('#syncInput').onkeydown = e => { if (e.key === 'Enter') join(); };
    return;
  }
  box.innerHTML = `
    <div class="cell sync-code"><div class="grow"><span class="sub">${tx('Dein Code')}</span><div class="code" data-no-tx>${esc(s.code)}</div>
      <span class="sub" id="syncState">${esc(syncLine(s))}</span></div><div class="sync-qr" id="syncQr" aria-label="${tx('QR-Code zum Scannen')}"></div></div>
    <button class="cell tap" id="syncCopy"><span class="cell-ic" style="background:#6366f1">${ICON('copy')}</span><span class="grow lbl">${tx('Code kopieren')}</span></button>
    <button class="cell tap" id="syncNowBtn"><span class="cell-ic" style="background:#10b981">${ICON('refresh')}</span><span class="grow lbl">${tx('Jetzt abgleichen')}</span></button>
    <button class="cell tap" id="syncLeave"><span class="cell-ic" style="background:#6b7280">${ICON('unlink')}</span><span class="grow"><span class="lbl">${tx('Dieses Gerät trennen')}</span><span class="sub">${tx('Deine Daten bleiben hier und beim Code')}</span></span></button>
    <button class="cell tap danger" id="syncWipe"><span class="cell-ic" style="background:#ef4444">${ICON('trash')}</span><span class="grow"><span class="lbl">${tx('Code löschen')}</span><span class="sub">${tx('Löscht die gespeicherten Daten beim Server – auf den Geräten bleibt alles')}</span></span></button>`;
  $('#syncFoot').innerHTML = (syncMsg ? `<b class="sync-msg">${esc(syncMsg)}</b><br>` : '') +
    tx('Auf einem anderen Gerät den QR-Code mit der Kamera scannen oder den Code in der Jukebox eingeben. Bewahre den Code gut auf: Deine Daten sind damit verschlüsselt – ohne ihn kann sie niemand lesen, auch wir nicht.');
  syncMsg = '';
  $('#syncCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(s.code); $('#syncCopy .lbl').textContent = '✓ ' + tx('Kopiert'); } catch { $('#syncCopy .lbl').textContent = s.code; }
  };
  $('#syncNowBtn').onclick = async () => { $('#syncState').textContent = tx('Gleiche ab …'); await Sync.syncNow(); renderSync(); };
  arm($('#syncLeave'), tx('Nochmal tippen zum Trennen'), () => { Sync.leave(); renderSync(); });
  arm($('#syncWipe'), tx('Nochmal tippen zum Löschen'), async () => {
    try { await Sync.wipe(); syncMsg = tx('Code gelöscht. Die Daten auf diesem Gerät bleiben.'); } catch { syncMsg = tx('Keine Verbindung – versuch es gleich nochmal.'); }
    renderSync();
  });
  // QR-Code mit Link: öffnet die Jukebox auf dem anderen Gerät mit eingetragenem Code
  loadQr().then(qrcode => {
    const q = qrcode(0, 'M'); q.addData(SYNC_LINK(s.code)); q.make();
    if ($('#syncQr')) $('#syncQr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }).catch(() => { if ($('#syncQr')) $('#syncQr').remove(); });
}
let qrLib = null;
function loadQr() {
  return qrLib ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => res(window.qrcode); s.onerror = () => { qrLib = null; rej(new Error('qr')); };
    document.head.appendChild(s);
  });
}
const openSheet = () => { $('#langSel').innerHTML = langOptions(); applyTheme(); renderProfile(); renderSync(); sheet.showModal(); };
$('#syncCta').onclick = () => { openSheet(); setTimeout(() => $('#syncAnchor').scrollIntoView({ block: 'start', behavior: 'smooth' }), 80); };
Sync.onStatus(() => { if (!$('#syncInput') || document.activeElement !== $('#syncInput')) renderSync(); });
addEventListener('jukebox-sync', () => { renderProfile(); theme = store.get('hub.theme') || store.get('mq.theme') || theme; applyTheme(); });
// Link aus dem QR-Code: …/jukebox/#code=K7QM-2XD9-HF4P → Code eintragen (und aus der Adresszeile entfernen)
{
  const m = location.hash.match(/code=([A-Za-z0-9-]{12,16})/);
  if (location.hash === '#sync') { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => $('#syncCta').click(), 300); }
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    const s = Sync.status();
    if (!s.connected) { syncPending = m[1]; syncMsg = tx('Code übernommen – tippe auf „Verbinden“.'); setTimeout(() => $('#syncCta').click(), 300); }
    else if (s.code !== Sync.normCode(m[1])) { syncMsg = tx('Dieses Gerät ist schon mit einem anderen Code verbunden. Erst trennen, dann den neuen Code eingeben.'); setTimeout(() => $('#syncCta').click(), 300); }
  }
}
setInterval(() => { if ($('#syncState') && sheet.open) $('#syncState').textContent = syncLine(Sync.status()); }, 30000);

applyTheme();
renderProfile();
renderSync();
load();
