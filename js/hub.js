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

/* ---------- Dein Stand je Spiel (aus dem Speicher der Spiele, gleiche Adresse jukeboxquiz.de) ---------- */
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
  // Hit or Miss: Tageswechsel nach deutscher Zeit, Serie aus dailyLog. Schon begonnen (Eintrag ohne „done“) zählt als gespielt –
  // nachholen am selben Tag geht dort nicht mehr (nur noch außer Wertung)
  'hit-or-miss': () => {
    const hl = store.get('hom.dailyLog') || {}, t = dayOf('Europe/Berlin');
    return { done: !!store.get('hom.daily.' + t), streak: streakOf(d => d in hl, t) };
  },
};
function dailyOf(id) { try { return DAILY[id]?.() || null; } catch { return null; } }
const STATUS = {
  'needle-drop': () => { const d = dailyOf('needle-drop'); return d ? daily(d.done, d.streak) : ''; },
  'hit-or-miss': () => { const d = dailyOf('hit-or-miss'); return d ? daily(d.done, d.streak) : ''; },
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
  // Piano Rain: Sterne gesamt und Übungs-Serie (Tage mit mindestens einer Minute Üben, deutsche Zeit wie im Spiel)
  'piano-rain': () => {
    const st = Sync.view('pr.stars', store.get('pr.stars')) || {}, days = Sync.view('pr.days', store.get('pr.days')) || {};
    const stars = Object.values(st).reduce((a, n) => a + (+n || 0), 0), streak = streakOf(d => (days[d] || 0) >= 60, dayOf('Europe/Berlin'));
    return (streak ? stat('', '🔥 ' + tx('Serie {n}', { n: streak })) : '') + (stars ? stat('', '⭐ ' + stars) : '');
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
  AdventCal.renderCard();   // Adventskalender (js/advent.js), nur 25.11.–6.1.
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
      `<a class="today-go" href="${esc(a.url + (a.url.includes('?') ? '&' : '?') + 'daily=1')}" style="--c:${esc(a.color || '#888')}"><img src="${esc(a.icon)}" alt="">${esc(a.name)}${d.streak ? ` <small>🔥 ${d.streak}</small>` : ''}</a>`).join('')
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
  const back = !!p.name || ['mq.stats', 'mq.daily', 'gr.stats', 'oon.stats', 'hom.stats', 'ot.stars', 'pr.stars'].some(k => store.get(k));
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
// Töne und Vibration gelten für alle Spiele (Prefs in js/profile.js, Schlüssel jb.sfx / jb.vib) – die Spiele haben dafür keine eigenen Schalter mehr
function renderPrefs() {
  $('#setSfx').checked = Prefs.sfx; $('#setVib').checked = Prefs.vib;
  $('#rowVib').classList.toggle('hidden', !('vibrate' in navigator));   // iPhone-Safari kann nicht vibrieren (die iOS-App schon)
}
$('#setSfx').onchange = e => Prefs.set('sfx', e.target.checked);
$('#setVib').onchange = e => { Prefs.set('vib', e.target.checked); if (e.target.checked) try { navigator.vibrate?.(60); } catch {} };
self.liveLang = () => { render(); applyTheme(); renderProfile(); renderSync(); if ($('#advSheet').open) AdventCal.render(); };

/* ---------- Auf allen Geräten: persönlicher Code (js/sync.js) ---------- */
const SYNC_LINK = c => 'https://jukeboxquiz.de/jukebox/#code=' + c;
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
/* ---------- Passkeys (freiwillig): ein Passkey schließt den Code auf – Face ID / Fingerabdruck statt Code eintippen ----------
   Der Code bleibt der Schlüssel zu den Daten. Der Passkey liefert über die WebAuthn-Erweiterung PRF ein Geheimnis, mit dem der Code
   hier im Browser verschlüsselt wird; beim Server (worker/sync.js, /pk/) liegt nur dieser Block. Plan: docs/passkey-plan.md.
   In der iOS-App (noch) nicht: dafür braucht die App die Domain-Verknüpfung (bezahlter Apple-Account). */
const PK_API = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && store.get('hub.pkApi')) || 'https://jukebox-sync.ku3rb1s.workers.dev/pk/';
const pkEnc = s => new TextEncoder().encode(s);
const pkB64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pkB64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const pkRp = () => location.hostname.replace(/^www\./, '');
const PK_SALT = pkEnc('jukebox-code-wrap-v1');
const inApp = !!window.webkit?.messageHandlers?.jbNative;
let pkOk = !inApp && !!window.PublicKeyCredential && window.isSecureContext;
// Kann der Browser PRF? (neuere Browser sagen es vorher; sonst merken wir es beim Versuch)
if (pkOk && PublicKeyCredential.getClientCapabilities) PublicKeyCredential.getClientCapabilities().then(c => { if (c && c['extension:prf'] === false) { pkOk = false; renderSync(); } }).catch(() => {});
async function pkPost(path, body) {
  const r = await fetch(PK_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'http');
  return j;
}
async function pkId(code) {
  const buf = await crypto.subtle.digest('SHA-256', pkEnc('jukebox-sync-id|' + code));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function pkKey(prf) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: pkEnc('jukebox'), info: pkEnc('code-wrap-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function pkWrap(prf, code) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pkKey(prf), pkEnc(code)));
  return pkB64([...iv, ...ct]);
}
async function pkUnwrap(prf, b64) {
  const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, await pkKey(prf), u.subarray(12)));
}
const pkLabel = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Mac/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Passkey'; };
let pkKeys = [];   // Passkeys dieses Codes (zuletzt geladen) – damit nicht derselbe Schlüsselbund einen zweiten bekommt
const pkFromB64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const pkUnsupported = () => Object.assign(new Error('prf'), { name: 'PrfError' });
/** Code mit einem neuen Passkey sichern */
async function pkRegister() {
  const s = Sync.status(), id = await pkId(s.code), { challenge } = await pkPost('options', { id }), p = Profile.get();
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { id: pkRp(), name: 'Jukebox' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: p.name || 'Jukebox', displayName: p.name ? `${p.emoji} ${p.name}` : 'Jukebox' },
    challenge: pkEnc(challenge), timeout: 120000,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: pkKeys.map(k => ({ type: 'public-key', id: pkFromB64u(k.cred) })),   // hier schon einer → Browser meldet das
    extensions: { prf: { eval: { first: PK_SALT } } } } });
  const ext = cred.getClientExtensionResults().prf;
  if (!ext || (!ext.enabled && !ext.results)) throw pkUnsupported();
  pkPending = { id, challenge, code: s.code, rawId: cred.rawId, clientData: pkB64u(cred.response.clientDataJSON),
    authData: pkB64u(cred.response.getAuthenticatorData()), publicKey: pkB64(cred.response.getPublicKey()), alg: cred.response.getPublicKeyAlgorithm() };
  // Safari (iPhone) liefert das Geheimnis erst bei der ersten Anmeldung – und die braucht einen eigenen Tipp (sonst bricht Safari still ab).
  // Darum dann ein zweiter, sichtbarer Schritt „Jetzt bestätigen“ (pkFinish).
  if (!ext.results?.first) return false;
  await pkFinish(ext.results.first);
  return true;
}
let pkPending = null;   // angelegter, aber noch nicht fertig verbundener Passkey (wartet auf „Jetzt bestätigen“)
async function pkFinish(out) {
  const p = pkPending; if (!p) return;
  if (!out) {
    const a = await navigator.credentials.get({ publicKey: { rpId: pkRp(), challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: p.rawId }], extensions: { prf: { eval: { first: PK_SALT } } } } });
    out = a.getClientExtensionResults().prf?.results?.first;
    if (!out) throw pkUnsupported();
  }
  await pkPost('register', { id: p.id, challenge: p.challenge, cred: pkB64u(p.rawId), clientData: p.clientData, authData: p.authData,
    publicKey: p.publicKey, alg: p.alg, wrapped: await pkWrap(out, p.code), label: pkLabel() });
  pkPending = null;
  markSaved(p.code);
}
/** Mit Passkey anmelden: Code holen, entschlüsseln, verbinden */
async function pkLogin() {
  const { challenge } = await pkPost('options', {});
  const a = await navigator.credentials.get({ publicKey: { rpId: pkRp(), challenge: pkEnc(challenge), userVerification: 'required', timeout: 120000,
    extensions: { prf: { eval: { first: PK_SALT } } } } });
  const out = a.getClientExtensionResults().prf?.results?.first;
  if (!out) throw a.authenticatorAttachment === 'cross-platform' ? Object.assign(new Error('hybrid'), { name: 'PrfError', hybrid: true }) : pkUnsupported();
  let wrapped;
  try { ({ wrapped } = await pkPost('login', { challenge, cred: pkB64u(a.rawId), clientData: pkB64u(a.response.clientDataJSON),
    authData: pkB64u(a.response.authenticatorData), signature: pkB64u(a.response.signature) })); }
  catch (e) {
    // Passkey ohne Code beim Server (z. B. Einrichten abgebrochen): dem Passwortmanager sagen, dass er ihn löschen kann
    if (e.message === 'unknown') try { await PublicKeyCredential.signalUnknownCredential?.({ rpId: pkRp(), credentialId: pkB64u(a.rawId) }); } catch {}
    throw e;
  }
  await Sync.join(await pkUnwrap(out, wrapped));
  markSaved(Sync.status().code);
}
const pkError = e => e?.name === 'InvalidStateError' ? tx('Auf diesem Gerät ist dein Code schon mit einem Passkey gesichert.') : e?.name === 'NotAllowedError' || e?.name === 'AbortError' ? '' : e?.name === 'PrfError' ? (e.hybrid ? tx('Mit einem Passkey von einem anderen Gerät (per QR-Code) geht das hier leider noch nicht – gib den Code ein.') : tx('Dein Browser kann das mit Passkeys leider noch nicht – nutze den Code.'))
  : e?.message === 'unknown' ? tx('Dieser Passkey ist mit keinem Code verbunden (das Einrichten wurde nicht abgeschlossen). Du kannst ihn in deinen Passwörtern löschen.') : e?.message === 'gone' ? tx('Zu diesem Passkey gibt es keinen Code mehr.')
  : e?.message === 'limit' ? tx('Mehr Passkeys gehen für diesen Code nicht.') : tx('Keine Verbindung – versuch es gleich nochmal.');
async function pkFillList(s) {
  const box = $('#pkList'); if (!box) return;
  try {
    const { keys } = await pkPost('list', { id: await pkId(s.code) });
    pkKeys = keys;
    if (!$('#pkList')) return;
    if (keys.length && !codeSaved(s.code)) { markSaved(s.code); return renderSync(); }   // Passkey vorhanden = Code gesichert
    // Schon gesichert: Haken statt Aufforderung; ein weiterer Passkey ist nur für Geräte außerhalb des Schlüsselbunds nötig (z. B. Android, Windows)
    const add = pkPending ? null : $('#pkAdd');
    if (add) {
      add.classList.toggle('pk-done', keys.length > 0);
      add.querySelector('.lbl').textContent = keys.length ? tx('Weiteren Passkey hinzufügen') : tx('Mit Passkey sichern');
      add.querySelector('.sub').textContent = keys.length ? tx('Nur nötig für Geräte, die deine Passkeys nicht kennen (z. B. Android oder Windows)')
        : tx('Mit Face ID oder Fingerabdruck – auf neuen Geräten einfach anmelden');
    }
    box.innerHTML = keys.map(k => `<div class="cell"><span class="cell-ic" style="background:linear-gradient(135deg,#10b981,#0ea5e9)">${ICON('key')}</span>
      <span class="grow">✓ ${tx('Mit Passkey gesichert')}<span class="sub">${esc(k.label)} · ${esc(new Date(k.created).toLocaleDateString(LANG))}</span></span>
      <button class="sync-go pk-del" data-cred="${esc(k.cred)}"><span class="lbl">${tx('Entfernen')}</span></button></div>`).join('');
    box.classList.toggle('hidden', !keys.length);
    box.querySelectorAll('.pk-del').forEach(b => arm(b, tx('Nochmal tippen'), async () => {
      try { await pkPost('delete', { id: await pkId(s.code), cred: b.dataset.cred }); } catch {}
      pkFillList(s);
    }));
  } catch { box.classList.add('hidden'); }
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
    box.innerHTML = (pkOk ? `
      <button class="cell tap" id="pkLogin"><span class="cell-ic" style="background:linear-gradient(135deg,#10b981,#0ea5e9)">${ICON('key')}</span>
        <span class="grow"><span class="lbl">${tx('Mit Passkey anmelden')}</span><span class="sub">${tx('Wenn du deinen Code schon mit einem Passkey gesichert hast')}</span></span>${ICON('chev')}</button>` : '') + `
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
    if ($('#pkLogin')) $('#pkLogin').onclick = async () => {
      $('#pkLogin').disabled = true; syncMsg = '';
      try { await pkLogin(); syncMsg = tx('Mit Passkey angemeldet.'); renderProfile(); applyTheme(); }
      catch (e) { syncMsg = pkError(e); }
      renderSync();
    };
    $('#syncInput').onkeydown = e => { if (e.key === 'Enter') join(); };
    return;
  }
  box.innerHTML = `
    <div class="cell sync-code"><div class="grow"><span class="sub">${tx('Dein Code')}</span><div class="code" data-no-tx>${esc(s.code)}</div>
      <span class="sub" id="syncState">${esc(syncLine(s))}</span></div><div class="sync-qr" id="syncQr" aria-label="${tx('QR-Code zum Scannen')}"></div></div>
    ${unsaved ? `<div class="cell sync-warn"><span class="grow">⚠️ <b>${tx('Sichere deinen Code')}</b><span class="sub">${tx('Ohne ihn kommst du auf einem neuen Gerät nicht mehr an deine Daten. Wir können ihn nicht wiederherstellen.')}</span></span></div>` : ''}
    ${pkOk ? `<div class="hidden" id="pkList"></div><button class="cell tap" id="pkAdd"><span class="cell-ic" style="background:linear-gradient(135deg,#10b981,#0ea5e9)">${ICON('key')}</span><span class="grow"><span class="lbl">${tx('Mit Passkey sichern')}</span><span class="sub">${tx('Mit Face ID oder Fingerabdruck – auf neuen Geräten einfach anmelden')}</span></span>${ICON('chev')}</button>` : ''}
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
  if ($('#pkAdd')) {
    $('#pkAdd').onclick = async () => {
      $('#pkAdd').disabled = true;
      try { syncMsg = await pkRegister() ? tx('Mit Passkey gesichert. Auf einem neuen Gerät: „Dein Code“ → „Mit Passkey anmelden“.')
          : tx('Fast fertig: Tippe auf „Jetzt bestätigen“, damit dein Passkey den Code aufschließen kann.'); }
      catch (e) { syncMsg = pkError(e); }
      renderSync();
    };
    if (pkPending) {   // zweiter Schritt (Safari): sichtbarer Knopf, damit Face ID nach einem Tipp kommt
      const add = $('#pkAdd'); add.id = 'pkConfirm'; add.classList.remove('pk-done');
      add.querySelector('.lbl').textContent = tx('Jetzt bestätigen');
      add.querySelector('.sub').textContent = tx('Noch einmal mit Face ID oder Fingerabdruck – dann ist dein Code mit dem Passkey gesichert');
      add.onclick = async () => {
        add.disabled = true;
        try { await pkFinish(); syncMsg = tx('Mit Passkey gesichert. Auf einem neuen Gerät: „Dein Code“ → „Mit Passkey anmelden“.'); }
        catch (e) { syncMsg = pkError(e) || tx('Abgebrochen – tippe nochmal auf „Jetzt bestätigen“.'); }
        renderSync();
      };
    }
    pkFillList(s);
  }
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
  x.fillText('jukeboxquiz.de/jukebox', W / 2, qy + qs + 152);
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
const openSheet = () => { $('#langSel').innerHTML = langOptions(); applyTheme(); renderProfile(); renderPrefs(); renderSync(); sheet.showModal(); };
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
addEventListener('storage', e => { if (e.key && /^(mq|gr|oon|ot|hom|pr)\./.test(e.key)) render(); });
addEventListener('jukebox-sync', () => { render(); if ($('#advSheet').open) AdventCal.render(); renderProfile(); theme = store.get('hub.theme') || store.get('mq.theme') || theme; applyTheme(); });
// Link aus dem QR-Code: …/jukebox/#code=K7QM-2XD9-HF4P → Code eintragen (und aus der Adresszeile entfernen)
{
  const m = location.hash.match(/code=([A-Za-z0-9-]{12,16})/);
  // #bestenliste – oder mit Vorauswahl aus einem Spiel: #bestenliste=needle-drop/high/80s.normal
  const lb = location.hash.match(/^#bestenliste(?:=(.+))?$/);
  if (lb) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => board()?.open(decodeURIComponent(lb[1] || '')), 300); }
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
AdventCal.init();
AdventCal.renderCard();
load();
