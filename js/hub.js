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

/* ---------- Dein Stand je Spiel (aus dem Speicher der Spiele, gleiche Adresse ku3rb1s.github.io) ---------- */
const dayOf = tz => new Date().toLocaleDateString('sv-SE', tz ? { timeZone: tz } : {});   // „2026-11-07“
const prevDay = d => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
function streakOf(has, d) { if (!has(d)) d = prevDay(d); let n = 0; while (has(d)) { n++; d = prevDay(d); } return n; }
const stat = (cls, txt) => `<span class="stat ${cls}">${esc(txt)}</span>`;
const daily = (done, streak) => (done ? stat('ok', '✓ ' + tx('Tägliche Challenge erledigt')) : stat('todo', '📅 ' + tx('Tägliche Challenge offen')))
  + (streak ? stat('', '🔥 ' + tx('Serie {n}', { n: streak })) : '');
// Tägliche Challenge je Spiel: heute erledigt? und Serie
const DAILY = {
  // Needle Drop: Tageswechsel nach deutscher Zeit, nachgespielte Tage (late) zählen nicht zur Serie
  'needle-drop': () => {
    const L = store.get('mq.daily') || {}, t = dayOf('Europe/Berlin');
    return { done: !!L[t], streak: streakOf(d => L[d] && !L[d].late, t) };
  },
  // Gold Record: Tageswechsel nach Gerätezeit, Serie aus dailyLog
  'gold-record': () => {
    const dl = store.get('gr.dailyLog') || {}, t = dayOf();
    return { done: !!store.get('gr.daily.' + t), streak: streakOf(d => d in dl, t) };
  },
};
function dailyOf(id) { try { return DAILY[id]?.() || null; } catch { return null; } }
const STATUS = {
  'needle-drop': () => { const d = dailyOf('needle-drop'); return d ? daily(d.done, d.streak) : ''; },
  'gold-record': () => {
    // Wie oft Diamant (15/15) – Startwert aus früheren Runden + alle Geräte (wie in Gold Record und der Bestenliste)
    const d = dailyOf('gold-record'), start = store.get('gr.diaStart') || {}, all = Sync.view('gr.diamonds', store.get('gr.diamonds')) || {};
    const dia = ['easy', 'normal', 'hard'].reduce((n, k) => n + (+start[k] || 0) + (+all[k] || 0), 0);
    return (d ? daily(d.done, d.streak) : '') + (dia ? stat('', '💎 ' + tx('Diamant: {n}×', { n: dia })) : '');
  },
  // On Tour: Stationen mit mindestens 1 Stern (feste Reihenfolge, darum = offene Station − 1) und Sterne gesamt
  'on-tour': () => {
    const s = store.get('ot.stars') || {}, ON_TOUR_STATIONS = 24;   // Zahl der Stationen in On-Tour/js/stations.js
    const v = Object.entries(s).filter(([k]) => !k.startsWith('zugabe-')).map(([, n]) => +n || 0),   // ohne Bonus-Stationen
      done = v.filter(n => n >= 1).length, stars = v.reduce((a, b) => a + b, 0);
    return stars ? stat('', '🗺️ ' + tx('Station {n} von {m}', { n: Math.min(done + 1, ON_TOUR_STATIONS), m: ON_TOUR_STATIONS })) + stat('', '⭐ ' + stars) : '';
  },
  'older-or-newer': () => {
    const st = Sync.view('oon.stats', store.get('oon.stats'));
    return st?.best ? stat('', '🏆 ' + tx('Rekord: {n} in Folge', { n: st.best })) : '';
  },
};
function statusOf(id) { try { return STATUS[id]?.() || ''; } catch { return ''; } }

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
      <img class="app-ic" src="${esc(a.icon)}" alt="" fetchpriority="high">
      <div class="app-body">
        <h2>${esc(a.name)}</h2>
        <p>${esc(pick(a.desc))}</p>
        <div class="app-tags">${(a.tags || []).map(t => `<span class="pill">${esc(tx(TAGS[t] || t))}</span>`).join('')}</div>
        ${(st => st ? `<div class="app-stat">${st}</div>` : '')(statusOf(a.id))}
      </div>
      <span class="app-go"><svg class="ic"><use href="#i-play"/></svg><span>${tx('Spielen')}</span></span>
    </a>`).join('');
  renderToday();
  renderProfile();
  board()?.refresh();
}
const board = () => typeof Board !== 'undefined' ? Board : null;   // js/leaderboard.js (wird nach dieser Datei geladen)
/** Oben: welche Tages-Challenges heute noch offen sind (Knöpfe führen direkt ins Spiel) */
function renderToday() {
  const games = DATA.apps.map(a => ({ a, d: dailyOf(a.id) })).filter(x => x.d);
  const open = games.filter(x => !x.d.done), box = $('#today');
  if (!games.length) return box.classList.add('hidden');
  box.classList.remove('hidden');
  box.classList.toggle('all', !open.length);
  box.innerHTML = open.length
    ? `<span class="today-h">📅 ${tx('Heute noch offen:')}</span>` + open.map(({ a, d }) =>
      `<a class="today-go" href="${esc(a.url)}" style="--c:${esc(a.color || '#888')}"><img src="${esc(a.icon)}" alt="">${esc(a.name)}${d.streak ? ` <small>🔥 ${d.streak}</small>` : ''}</a>`).join('')
    : `<span class="today-h">✓ ${tx('Alle Tages-Challenges erledigt – morgen gibt es neue.')}</span>`;
}

/* ---------- Einstellungen ---------- */
const sheet = $('#sheet');
/* ---------- Spielerprofil (gilt in allen Spielen) ---------- */
function renderProfile() {
  const p = Profile.get();
  $('#profEmoji').textContent = p.emoji;
  if (document.activeElement !== $('#profName')) $('#profName').value = p.name;
  $('#profName').placeholder = tx('Dein Name');
  // Wer schon gespielt hat (oder einen Namen hat), braucht die Erklärung oben nicht mehr: dann nur Begrüßung + „Heute noch offen“.
  // Beim ersten Besuch bleibt die Einleitung, damit man versteht, worum es geht.
  const back = !!p.name || ['mq.stats', 'mq.daily', 'gr.stats', 'oon.stats', 'hom.stats', 'ot.stars'].some(k => store.get(k));
  $('.hub-hero').classList.toggle('back', back);
  $('#hi').classList.toggle('hidden', !back);
  $('#hi').textContent = p.name ? tx('Hallo {n}!', { n: p.emoji + ' ' + p.name }) : tx('Schön, dass du da bist!');
  $('#hello').textContent = back ? tx('Wähle ein Spiel') : p.name ? tx('Hallo {n}! Wähle ein Spiel', { n: p.emoji + ' ' + p.name }) : tx('Wähle ein Spiel');
}
$('#profEmoji').onclick = () => Profile.pick(() => { renderProfile(); board()?.profileChanged(); });   // Auswahl-Fenster (js/profile.js)
$('#profName').oninput = () => { Profile.set({ name: $('#profName').value }); renderProfile(); board()?.profileChanged(); };
$('#profName').onkeydown = e => { if (e.key === 'Enter') $('#profName').blur(); };

$('#btnSettings').onclick = () => openSheet();
$('#btnBoard').onclick = () => board()?.open();
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
  const unsaved = s.connected && !codeSaved(s.code);
  // Startseite: Ohne Code eine Einladung (große Karte). Mit Code nur eine unauffällige Zeile – der Code selbst steht nicht
  // mehr offen da. Die Karte kommt nur zurück, wenn etwas zu tun ist (Code nicht gesichert, Abgleich klappt nicht).
  // Beide öffnen das Fenster „Dein Code“, ebenso die Zeile in den Einstellungen.
  const problem = s.connected && !!s.err, big = !s.connected || unsaved || problem;
  const title = s.connected ? tx('Dein Code') : tx('Auf anderen Geräten weiterspielen');
  const sub = unsaved ? '⚠️ ' + tx('Code noch nicht gesichert – jetzt sichern') : problem ? syncLine(s)
    : tx('Rekorde, Serien und Profil mit einem Code mitnehmen – ohne E-Mail und Passwort');
  $('#syncCta').innerHTML = `<span class="sc-ic">${ICON('cloud')}</span><span class="grow"><b>${esc(title)}</b><span class="sub">${esc(sub)}</span></span>${ICON('chev')}`;
  $('#syncCta').classList.toggle('hidden', !big);
  $('#syncCta').classList.toggle('on', s.connected);
  $('#syncCta').classList.toggle('warn', unsaved || problem);
  $('#syncMini').classList.toggle('hidden', big);
  $('#syncMini').innerHTML = `${ICON('cloud')} ${tx('Auf deinen Geräten abgeglichen')} · <button type="button" class="hub-link">${tx('Dein Code')}</button>`;
  $('#syncMini').querySelector('button').onclick = () => openSync();
  $('#syncRowTitle').textContent = s.connected ? tx('Dein Code') : tx('Auf anderen Geräten weiterspielen');
  $('#syncRowSub').textContent = unsaved ? '⚠️ ' + tx('Noch nicht gesichert') : s.connected ? '✓ ' + tx('Auf deinen Geräten abgeglichen') : tx('Mit einem Code – ohne E-Mail und Passwort');   // den Code selbst nur im Fenster „Dein Code“
  $('#syncRowIc').style.background = unsaved ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : s.connected ? 'linear-gradient(135deg,#10b981,#0ea5e9)' : 'linear-gradient(135deg,#ff4f86,#fbbf24)';
  $('#syncIntro').innerHTML = s.connected
    ? tx('Mit diesem Code hast du auf allen verbundenen Geräten dieselben Rekorde, Serien und dasselbe Profil. Er ist auch dein Zugang zur Bestenliste.')
    : `<b>${tx('Spiel auf Handy, Tablet und Computer mit denselben Rekorden weiter.')}</b>
      <ol><li>${tx('Hier einen Code erstellen.')}</li><li>${tx('Auf dem anderen Gerät die Jukebox öffnen und den Code eingeben – oder den QR-Code scannen.')}</li></ol>
      ${tx('Kein Konto, keine E-Mail, kein Passwort.')}`;
  if (!s.connected) {
    box.innerHTML = `
      <button class="cell tap" id="syncNew"><span class="cell-ic" style="background:linear-gradient(135deg,#ff4f86,#fbbf24)">${ICON('plus')}</span>
        <span class="grow">${tx('Neuen Code erstellen')}<span class="sub">${tx('Wenn du noch keinen hast')}</span></span>${ICON('chev')}</button>
      <div class="cell sync-join"><span class="cell-ic" style="background:#0ea5e9">${ICON('key')}</span>
        <input id="syncInput" class="bare" placeholder="${tx('Code eingeben')}" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" enterkeyhint="go" value="${esc(syncPending)}">
        <button class="sync-go" id="syncJoin">${tx('Verbinden')}</button></div>`;
    $('#syncFoot').innerHTML = syncMsg ? `<b class="sync-msg">${esc(syncMsg)}</b>` : '';
    $('#syncNew').onclick = async () => {
      $('#syncNew').disabled = true; syncMsg = '';
      try { await Sync.create(); syncMsg = tx('Dein Code ist fertig. Sichere ihn jetzt, z. B. als Bild – ohne ihn kommst du auf einem neuen Gerät nicht mehr an deine Daten.'); }
      catch (e) { syncMsg = e.message === 'limit' ? tx('Heute wurden über diesen Internetanschluss schon 3 Codes erstellt. Morgen geht es wieder – oder verbinde dich mit einem vorhandenen Code.') : tx('Keine Verbindung – versuch es gleich nochmal.'); }
      renderSync();
    };
    const join = async () => {
      const v = $('#syncInput').value;
      if (!Sync.normCode(v)) { syncMsg = tx('Der Code hat 12 Zeichen, z. B. K7QM-2XD9-HF4P.'); syncPending = v; return renderSync(); }
      $('#syncJoin').disabled = true; $('#syncJoin').textContent = '…';
      try { await Sync.join(v); markSaved(Sync.status().code); syncPending = ''; syncMsg = ''; renderProfile(); applyTheme(); }   // eingetippt → hat ihn ja
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
    ${unsaved ? `<div class="cell sync-warn"><span class="grow">⚠️ <b>${tx('Sichere deinen Code')}</b><span class="sub">${tx('Ohne ihn kommst du auf einem neuen Gerät nicht mehr an deine Daten. Wir können ihn nicht wiederherstellen.')}</span></span></div>` : ''}
    <button class="cell tap" id="syncImg"><span class="cell-ic" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">${ICON('image')}</span><span class="grow"><span class="lbl">${tx('Als Bild speichern')}</span><span class="sub">${tx('Mit QR-Code – z. B. in deinen Fotos')}</span></span>${ICON('chev')}</button>
    ${navigator.share ? `<button class="cell tap" id="syncShare"><span class="cell-ic" style="background:#0ea5e9">${ICON('share')}</span><span class="grow"><span class="lbl">${tx('An mich senden')}</span><span class="sub">${tx('Per Nachricht, Mail oder in den Passwort-Manager')}</span></span>${ICON('chev')}</button>` : ''}
    <button class="cell tap" id="syncCopy"><span class="cell-ic" style="background:#6366f1">${ICON('copy')}</span><span class="grow lbl">${tx('Code kopieren')}</span></button>
    <button class="cell tap" id="syncNowBtn"><span class="cell-ic" style="background:#10b981">${ICON('refresh')}</span><span class="grow lbl">${tx('Jetzt abgleichen')}</span></button>
    <button class="cell tap" id="syncLeave"><span class="cell-ic" style="background:#6b7280">${ICON('unlink')}</span><span class="grow"><span class="lbl">${tx('Dieses Gerät trennen')}</span><span class="sub">${tx('Deine Daten bleiben hier und beim Code')}</span></span></button>
    <button class="cell tap danger" id="syncWipe"><span class="cell-ic" style="background:#ef4444">${ICON('trash')}</span><span class="grow"><span class="lbl">${tx('Code löschen')}</span><span class="sub">${tx('Löscht die gespeicherten Daten beim Server – auf den Geräten bleibt alles')}</span></span></button>`;
  $('#syncFoot').innerHTML = (syncMsg ? `<b class="sync-msg">${esc(syncMsg)}</b><br>` : '') +
    tx('Weiteres Gerät verbinden: Dort die Jukebox öffnen und den QR-Code mit der Kamera scannen oder den Code eingeben. Deine Daten sind mit dem Code verschlüsselt – ohne ihn kann sie niemand lesen, auch wir nicht.');
  syncMsg = '';
  $('#syncCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(s.code); markSaved(s.code); $('#syncCopy .lbl').textContent = '✓ ' + tx('Kopiert'); } catch { $('#syncCopy .lbl').textContent = s.code; }
  };
  $('#syncImg').onclick = async () => {
    const lbl = $('#syncImg .lbl'), old = lbl.textContent;
    lbl.textContent = tx('Wird erstellt …');
    try { if (await saveCodeImage(s.code)) { markSaved(s.code); return renderSync(); } }
    catch { syncMsg = tx('Das Bild konnte nicht erstellt werden. Kopiere den Code stattdessen.'); return renderSync(); }
    lbl.textContent = old;
  };
  if ($('#syncShare')) $('#syncShare').onclick = async () => {
    try {
      await navigator.share({ title: tx('Mein Jukebox-Code'), text: tx('Mein Jukebox-Code: {c}', { c: s.code }) + '\n' + SYNC_LINK(s.code) });
      markSaved(s.code); renderSync();
    } catch {}   // abgebrochen
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
/* ---------- Code sichern ---------- */
// Gemerkt pro Gerät: dieser Code wurde gesichert (Bild, Teilen, Kopieren oder selbst eingetippt). Sonst erinnert die Startseite.
const codeSaved = code => store.get('hub.codeSaved') === code;
const markSaved = code => store.set('hub.codeSaved', code);
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
/** Bild mit Code und QR-Code (1080 × 1350) – teilen (Handy: „Bild sichern“) oder herunterladen. true = gespeichert/geteilt */
async function saveCodeImage(code) {
  const qrcode = await loadQr();
  const q = qrcode(0, 'M'); q.addData(SYNC_LINK(code)); q.make();
  try { await document.fonts.load('900 80px Outfit'); await document.fonts.load('600 40px Outfit'); } catch {}
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1d1622'); bg.addColorStop(1, '#0c0c0f');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700); glow.addColorStop(0, 'rgba(245,158,11,.28)'); glow.addColorStop(1, 'rgba(245,158,11,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  x.textAlign = 'center'; x.fillStyle = '#fff';
  // Text, der zu breit ist, wird kleiner (Übersetzungen sind unterschiedlich lang)
  const fit = (t, font, size, y) => { do x.font = font.replace('#', size); while (x.measureText(t).width > W - 120 && --size > 16); x.fillText(t, W / 2, y); };
  try { x.drawImage(await loadImg('logo-small.svg?v=1'), W / 2 - 60, 70, 120, 120); } catch {}
  x.font = '900 72px Outfit, system-ui, sans-serif'; x.fillText('Jukebox', W / 2, 270);
  x.fillStyle = 'rgba(255,255,255,.7)'; fit(tx('Dein persönlicher Code'), '600 #px Outfit, system-ui, sans-serif', 40, 345);
  x.fillStyle = '#fde68a'; x.font = '800 92px ui-monospace, Consolas, Menlo, monospace';
  x.fillText(code, W / 2, 465);
  // QR-Code auf weißer Karte
  const n = q.getModuleCount(), size = 500, cell = Math.floor(size / (n + 4)), qs = cell * (n + 4), qx = (W - qs) / 2, qy = 530;
  x.fillStyle = '#fff'; x.beginPath();
  if (x.roundRect) x.roundRect(qx - 20, qy - 20, qs + 40, qs + 40, 36); else x.rect(qx - 20, qy - 20, qs + 40, qs + 40);
  x.fill();
  x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell, cell);
  x.fillStyle = 'rgba(255,255,255,.85)'; fit(tx('Auf einem neuen Gerät scannen oder in der Jukebox eingeben:'), '600 #px Outfit, system-ui, sans-serif', 36, qy + qs + 100);
  x.fillStyle = '#fff'; x.font = '800 40px Outfit, system-ui, sans-serif';
  x.fillText('ku3rb1s.github.io/jukebox', W / 2, qy + qs + 152);
  x.fillStyle = 'rgba(255,255,255,.55)'; fit(tx('Halte den Code geheim – wer ihn hat, kann deine Spielstände lesen und ändern.'), '500 #px Outfit, system-ui, sans-serif', 30, H - 70);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const file = new File([blob], 'jukebox-code.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: tx('Mein Jukebox-Code') }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }   // sonst: herunterladen
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jukebox-code.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
let qrLib = null;
function loadQr() {
  return qrLib ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    // qrcode-generator 1.4.4 (MIT, Kazuhiko Arase) liegt in der Jukebox selbst – kein fremder Server, klappt auch offline
    s.src = 'js/qrcode.min.js?v=1';
    s.onload = () => res(window.qrcode); s.onerror = () => { qrLib = null; rej(new Error('qr')); };
    document.head.appendChild(s);
  });
}
const openSheet = () => { $('#langSel').innerHTML = langOptions(); applyTheme(); renderProfile(); renderSync(); sheet.showModal(); };
// Fenster „Dein Code“: vom Knopf unten auf der Startseite, aus den Einstellungen, aus der Bestenliste und über Links (#sync, #code=…)
const syncSheet = $('#syncSheet');
const openSync = () => { renderSync(); if (!syncSheet.open) syncSheet.showModal(); };
syncSheet.addEventListener('click', e => { if (e.target === syncSheet || e.target.closest('[data-close]')) syncSheet.close(); });
$('#syncCta').onclick = openSync;
$('#syncRow').onclick = openSync;
Sync.onStatus(() => { if (!$('#syncInput') || document.activeElement !== $('#syncInput')) renderSync(); board()?.refresh(); });
// Zurück aus einem Spiel (auch aus dem Zwischenspeicher des Browsers) oder anderer Tab: Stand neu zeigen
addEventListener('pageshow', e => { if (e.persisted) render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
addEventListener('storage', e => { if (e.key && /^(mq|gr|oon)\./.test(e.key)) render(); });
addEventListener('jukebox-sync', () => { render(); renderProfile(); theme = store.get('hub.theme') || store.get('mq.theme') || theme; applyTheme(); });
// Link aus dem QR-Code: …/jukebox/#code=K7QM-2XD9-HF4P → Code eintragen (und aus der Adresszeile entfernen)
{
  const m = location.hash.match(/code=([A-Za-z0-9-]{12,16})/);
  if (location.hash === '#bestenliste') { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => board()?.open(), 300); }
  if (location.hash === '#sync') { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => $('#syncCta').click(), 300); }
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    const s = Sync.status();
    if (!s.connected) { syncPending = m[1]; syncMsg = tx('Code übernommen – tippe auf „Verbinden“.'); setTimeout(() => $('#syncCta').click(), 300); }
    else if (s.code !== Sync.normCode(m[1])) { syncMsg = tx('Dieses Gerät ist schon mit einem anderen Code verbunden. Erst trennen, dann den neuen Code eingeben.'); setTimeout(() => $('#syncCta').click(), 300); }
  }
}
setInterval(() => { if ($('#syncState') && syncSheet.open) $('#syncState').textContent = syncLine(Sync.status()); }, 30000);

applyTheme();
renderProfile();
renderSync();
load();
