/* Jukebox – Spielstände auf allen Geräten (gleiche Datei in allen Spielen: Jukebox, Needle Drop, Older or Newer …)
 *
 * Mit einem persönlichen Code (z. B. „K7QM-2XD9-HF4P“) werden Rekorde, Statistik, Tages-Challenge und Profil
 * zwischen Geräten abgeglichen. Ohne Konto, ohne E-Mail.
 *
 * Datenschutz: Alles wird hier im Browser mit dem Code verschlüsselt (AES-GCM, Schlüssel per PBKDF2 aus dem Code).
 * Der Server (Cloudflare Worker „jukebox-sync“) bekommt nur eine Prüfsumme des Codes und einen unlesbaren Block.
 * Wer den Code nicht kennt, kann nichts lesen – auch der Server nicht. Darum: Code gut aufheben, ohne ihn ist nichts wiederherstellbar.
 *
 * Was abgeglichen wird, steht in RULES (alles andere, z. B. Lautstärke oder Spotify-Anmeldung, bleibt auf dem Gerät):
 *   latest – neueste Änderung gewinnt (Profil, Design, Sprache)
 *   max    – höchster Wert gewinnt (Rekorde)
 *   days   – Tages-Challenge: alle Tage zusammen, bei doppeltem Tag der am Tag selbst gespielte bzw. bessere
 *   day    – ein einzelnes Tagesergebnis (Gold Record): wie bei days
 *   mapmax – Liste Tag → Punkte: alle Tage, je Tag der höhere Wert
 *   union  – Sammlung (Erfolge): alles, was auf irgendeinem Gerät freigeschaltet wurde
 *   top    – Bestenliste (Gold Record): die 10 besten Runden aller Geräte
 *   device – je Gerät getrennt gespeichert und für die Anzeige zusammengezählt (Statistik; sonst würde doppelt gezählt)
 */
const Sync = (() => {
  const API = 'https://jukebox-sync.ku3rb1s.workers.dev/sync/';
  const RULES = [
    [/^jb\.profile$/, 'latest'],
    [/^jb\.lbOn$/, 'latest'],                       // in der Bestenliste mitmachen (ja/nein) – gilt für alle Geräte mit dem Code
    [/^(mq|hub)\.(theme|lang)$/, 'latest'],
    [/^(mq|oon)\.best2\./, 'max'],
    [/^(gr|hom)\.best\./, 'max'],
    [/^mq\.dailyBest$/, 'max'],
    [/^mq\.daily$/, 'days'],
    [/^(gr|hom)\.daily\.\d{4}-\d{2}-\d{2}$/, 'day'],
    [/^(gr|hom)\.dailyLog$/, 'mapmax'],
    [/^(gr|mq|hom)\.ach$/, 'union'],
    [/^gr\.top$/, 'top'],
    [/^(mq|oon|gr|hom)\.stats$/, 'device'],
    [/^gr\.diamonds$/, 'device'],                   // Diamanten je Schwierigkeit (je Gerät gezählt, zusammengezählt angezeigt)
    [/^gr\.diaStart$/, 'mapmax'],                   // Startwert der Diamanten aus der Zeit davor (für alle Geräte gleich)
    [/^ot\.(stars|stars2|astars)$/, 'mapmax'],      // On Tour: Sterne je Station (Haupt-Tour, Tour 2, Künstler-Touren) – der beste Wert zählt
    [/^ot\.(advent|adventDay)$/, 'mapmax'],         // Adventskalender: Sterne je Türchen „Jahr.Tür“ (0 = geöffnet), am Tag selbst geöffnet (Serie)
    [/^jb\.avatars$/, 'union'],                     // exklusive Avatare aus dem Adventskalender (js/profile.js)
    [/^ot\.ach$/, 'union'],
    [/^ot\.stats$/, 'device'],
  ];
  // Statistik mehrerer Geräte zusammenzählen (je Spiel eigener Aufbau)
  const COMBINE = {
    'mq.stats': (a, b) => {
      const cats = { ...a.cats };
      for (const [id, v] of Object.entries(b.cats || {})) { const c = cats[id] || { g: 0, s: 0, f: 0 }; cats[id] = { g: c.g + v.g, s: c.s + v.s, f: c.f + v.f }; }
      return { games: a.games + b.games, songs: a.songs + b.songs, found: a.found + b.found, stageSum: a.stageSum + b.stageSum, cats,
        best: [...(a.best || []), ...(b.best || [])].sort((x, y) => x.s - y.s).slice(0, 5) };
    },
    'gr.stats': (a, b) => {
      const pairs = (x = {}, y = {}) => { const o = { ...x }; for (const [k, [r, n]] of Object.entries(y)) { const t = o[k] || [0, 0]; o[k] = [t[0] + r, t[1] + n]; } return o; };
      return { games: a.games + b.games, right: a.right + b.right, asked: a.asked + b.asked, best: Math.max(a.best, b.best),
        wins: (a.wins || 0) + (b.wins || 0), jokers: (a.jokers || 0) + (b.jokers || 0), types: pairs(a.types, b.types), dec: pairs(a.dec, b.dec) };
    },
    'gr.diamonds': (a, b) => { const o = { ...a }; for (const [k, n] of Object.entries(b || {})) o[k] = (o[k] || 0) + (+n || 0); return o; },
    'oon.stats': (a, b) => ({ games: a.games + b.games, right: a.right + b.right, best: Math.max(a.best, b.best), years: Math.max(a.years || 0, b.years || 0) }),
    'ot.stats': (a, b) => {
      const types = { ...a.types };
      for (const [k, [r, n]] of Object.entries(b.types || {})) { const t = types[k] || [0, 0]; types[k] = [t[0] + r, t[1] + n]; }
      return { games: a.games + b.games, right: a.right + b.right, asked: a.asked + b.asked, perfect: (a.perfect || 0) + (b.perfect || 0), types };
    },
    'hom.stats': (a, b) => {
      const types = { ...a.types };
      for (const [k, [r, n]] of Object.entries(b.types || {})) { const t = types[k] || [0, 0]; types[k] = [t[0] + r, t[1] + n]; }
      return { games: a.games + b.games, right: a.right + b.right, wrong: a.wrong + b.wrong, best: Math.max(a.best || 0, b.best || 0),
        streak: Math.max(a.streak || 0, b.streak || 0), sd: Math.max(a.sd || 0, b.sd || 0), types };
    },
  };
  const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne 0/O und 1/I – nicht verwechselbar

  const ruleOf = k => (RULES.find(([re]) => re.test(k)) || [])[1];
  const ls = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
  const now = () => Date.now();

  /* ---------- Zustand auf diesem Gerät ---------- */
  // jb.sync = { code, rev, dev, snap: {key: hash}, ts: {key: zeit}, z: {präfix: zeit}, last, err }
  let st = ls.get('jb.sync', null);
  const save = () => st ? ls.set('jb.sync', st) : ls.del('jb.sync');
  let others = ls.get('jb.syncOthers', {});          // Werte der anderen Geräte (nur für „device“-Schlüssel)
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(status()); } catch {} });

  /* ---------- Code und Verschlüsselung ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  function newCode() {
    const b = crypto.getRandomValues(new Uint8Array(12));
    const s = [...b].map(x => ALPHA[x & 31]).join('');
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  }
  /** Eingabe bereinigen: Leerzeichen, Striche und Groß-/Kleinschreibung sind egal */
  function normCode(c) {
    const s = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (s.length !== 12 || [...s].some(ch => !ALPHA.includes(ch))) return null;
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  }
  let keyCache = null;
  async function keys(code) {
    if (keyCache?.code === code) return keyCache;
    const idBuf = await crypto.subtle.digest('SHA-256', enc.encode('jukebox-sync-id|' + code));
    const id = [...new Uint8Array(idBuf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('jukebox-sync-key-v1'), iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return keyCache = { code, id, key };
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function pipe(u8, Stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer()); }
  async function seal(obj, key) {
    let raw = enc.encode(JSON.stringify(obj)), flag = 0;
    if (self.CompressionStream) { try { raw = await pipe(raw, CompressionStream); flag = 1; } catch {} }
    const plain = new Uint8Array(raw.length + 1); plain[0] = flag; plain.set(raw, 1);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return b64(out);
  }
  async function open(data, key) {
    const u8 = unb64(data);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12)));
    let raw = plain.subarray(1);
    if (plain[0] === 1) raw = await pipe(raw, DecompressionStream);
    return JSON.parse(dec.decode(raw));
  }

  /* ---------- Server ---------- */
  async function api(method, id, body) {
    const r = await fetch(API + id, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', keepalive: method === 'PUT' && JSON.stringify(body).length < 60000 });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  }

  /* ---------- Lokale Daten einsammeln ---------- */
  function watchedKeys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (ruleOf(k)) out.push(k); } } catch {}
    return out;
  }
  /** Lokale Werte mit Zeitstempel; was sich seit dem letzten Abgleich geändert hat, bekommt „jetzt“ */
  function collect() {
    const out = {}, t = now();
    for (const k of watchedKeys()) {
      let raw; try { raw = localStorage.getItem(k); } catch { continue; }
      const h = hash(raw);
      if (st.snap[k] !== h) { st.ts[k] = t; st.snap[k] = h; }
      try { out[k] = { v: JSON.parse(raw), t: st.ts[k] || t }; } catch {}
    }
    return out;
  }
  const dirty = () => !!st && watchedKeys().some(k => { try { return st.snap[k] !== hash(localStorage.getItem(k)); } catch { return false; } });

  /* ---------- Zusammenführen ---------- */
  // Löschmarke: Präfix ('mq.best2.') oder mit '=' genau ein Schlüssel ('=ot.stars' trifft nicht 'ot.stars2')
  const zHit = (p, k) => p[0] === '=' ? k === p.slice(1) : k.startsWith(p);
  const zFor = (z, k) => Math.max(0, ...Object.entries(z).filter(([p]) => zHit(p, k)).map(([, t]) => t));
  /** Welches von zwei Ergebnissen desselben Tages zählt: am Tag selbst gespielt vor nachgespielt, fertig vor offen, dann mehr Punkte */
  const dayRank = r => [r && !r.late ? 1 : 0, r && r.done !== false ? 1 : 0, (r && (r.score ?? r.final)) || 0];
  function betterDay(l, r) {
    if (!l) return r; if (!r) return l;
    const a = dayRank(l), b = dayRank(r);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? l : r;
    return l;
  }
  function mergeDays(a = {}, b = {}) {
    const out = { ...a };
    for (const [d, r] of Object.entries(b)) out[d] = betterDay(out[d], r);
    return out;
  }
  function mergeEntry(rule, a, b) {
    if (!a) return b; if (!b) return a;
    const t = Math.max(a.t, b.t);
    if (rule === 'max') return { v: Math.max(+a.v || 0, +b.v || 0), t };
    if (rule === 'days') return { v: mergeDays(a.v, b.v), t };
    if (rule === 'day') return { v: betterDay(a.v, b.v), t };
    if (rule === 'union') return { v: { ...b.v, ...a.v }, t };
    if (rule === 'top') {                                                    // gleiche Sortierung wie in Gold Record
      const seen = new Set(), all = [...(a.v || []), ...(b.v || [])].filter(x => { const k = JSON.stringify(x); return !seen.has(k) && seen.add(k); });
      all.sort((x, y) => y.f - x.f || x.j - y.j || (x.d < y.d ? 1 : -1));
      return { v: all.slice(0, 10), t };
    }
    if (rule === 'mapmax') { const v = { ...a.v }; for (const [k, x] of Object.entries(b.v || {})) v[k] = Math.max(+v[k] || 0, +x || 0); return { v, t }; }
    return a.t >= b.t ? a : b;                                               // latest
  }

  /* ---------- Abgleich ---------- */
  let running = null, timer = 0;
  async function syncNow() {
    if (!st) return false;
    if (running) return running;
    running = (async () => {
      try {
        const { id, key } = await keys(st.code);
        const local = collect();
        for (let attempt = 0; attempt < 4; attempt++) {
          let doc = { v: 1, k: {}, d: {}, z: {} }, rev = 0;
          const got = st.fresh && attempt === 0 ? { status: 404 } : await api('GET', id);   // neuer Code: gibt es noch nicht
          if (got.status === 200) { doc = await open(got.data, key); rev = got.rev; }
          else if (got.status !== 404) throw new Error('server ' + got.status);
          else if (st.joined) { st.err = 'gone'; save(); emit(); return false; }   // Code wurde gelöscht

          // Löschmarken (z. B. „Rekorde löschen“) beider Seiten
          for (const [p, t] of Object.entries(st.z || {})) doc.z[p] = Math.max(doc.z[p] || 0, t);
          const before = JSON.stringify(doc);
          // Was älter als eine Löschmarke ist, schon vor dem Zusammenführen verwerfen – sonst holt „max“/„mapmax“
          // gelöschte Werte aus dem alten Stand zurück (z. B. eine zurückgesetzte On-Tour-Tour)
          for (const k of Object.keys(doc.k)) if (doc.k[k].t < zFor(doc.z, k)) delete doc.k[k];

          // Gemeinsame Werte
          for (const [k, e] of Object.entries(local)) {
            if (e.t < zFor(doc.z, k)) continue;
            const rule = ruleOf(k);
            if (rule === 'device') ((doc.d[st.dev] ||= {})[k] = e);
            else doc.k[k] = mergeEntry(rule, doc.k[k], e);
          }
          // Alles, was älter als eine Löschmarke ist, verwerfen
          for (const k of Object.keys(doc.k)) if (doc.k[k].t < zFor(doc.z, k)) delete doc.k[k];
          for (const dv of Object.values(doc.d)) for (const k of Object.keys(dv)) if (dv[k].t < zFor(doc.z, k)) delete dv[k];

          // Zurück in den lokalen Speicher, was sich durch andere Geräte geändert hat
          const changed = [];
          for (const [k, e] of Object.entries(doc.k)) {
            const raw = JSON.stringify(e.v);
            let cur = null; try { cur = localStorage.getItem(k); } catch {}
            if (cur !== raw) { try { localStorage.setItem(k, raw); } catch {} changed.push(k); }
            st.snap[k] = hash(raw); st.ts[k] = e.t;
          }
          for (const k of watchedKeys()) if (!(ruleOf(k) === 'device' ? doc.d[st.dev]?.[k] : doc.k[k]) && (st.ts[k] || 0) < zFor(doc.z, k)) { ls.del(k); delete st.snap[k]; delete st.ts[k]; changed.push(k); }
          // Werte der anderen Geräte für die Anzeige merken
          const oth = {};
          for (const [dv, vals] of Object.entries(doc.d)) if (dv !== st.dev) for (const [k, e] of Object.entries(vals)) (oth[k] ||= []).push(e.v);
          const othChanged = JSON.stringify(oth) !== JSON.stringify(others);
          others = oth; ls.set('jb.syncOthers', others);

          // Hochladen, wenn sich am Gesamtstand etwas geändert hat
          if (JSON.stringify(doc) !== before || rev === 0) {
            const put = await api('PUT', id, { rev, data: await seal(doc, key) });
            if (put.status === 409) continue;                                  // jemand war schneller → nochmal zusammenführen
            if (put.status === 429) { st.err = 'limit'; save(); emit(); return false; } // heute schon zu viele neue Codes
            if (put.status !== 200) throw new Error('server ' + put.status);
            rev = put.rev;
          }
          st.rev = rev; st.last = now(); st.err = ''; st.joined = true; delete st.fresh; st.z = doc.z; save();
          if (changed.length || othChanged) dispatchEvent(new CustomEvent('jukebox-sync', { detail: { changed } }));
          emit();
          boardSend();                                                         // neue Ergebnisse auch an die Bestenliste
          return true;
        }
        throw new Error('busy');
      } catch (e) {
        if (st) { st.err = navigator.onLine === false ? 'offline' : 'error'; save(); emit(); }
        return false;
      } finally { running = null; }
    })();
    return running;
  }
  const soon = (ms = 2500) => { clearTimeout(timer); timer = setTimeout(syncNow, ms); };

  /* ---------- Öffentliche Funktionen ---------- */
  function status() { return st ? { connected: true, code: st.code, last: st.last || 0, err: st.err || '' } : { connected: false }; }
  async function create() {
    st = { code: newCode(), rev: 0, dev: newCode().slice(0, 4) + Date.now().toString(36), snap: {}, ts: {}, z: {}, last: 0, joined: false, fresh: true };
    save(); emit();
    const ok = await syncNow();
    if (!ok) { const why = st?.err === 'limit' ? 'limit' : 'offline'; st = null; save(); emit(); throw new Error(why); }
    return st.code;
  }
  /** Mit bestehendem Code verbinden: Daten dieses Geräts werden mit denen des Codes zusammengeführt */
  async function join(input) {
    const code = normCode(input);
    if (!code) throw new Error('invalid');
    const { id } = await keys(code);
    const got = await api('GET', id).catch(() => ({ status: 0 }));
    if (got.status === 404) throw new Error('unknown');
    if (got.status !== 200) throw new Error('offline');
    st = { code, rev: 0, dev: newCode().slice(0, 4) + Date.now().toString(36), snap: {}, ts: {}, z: {}, last: 0, joined: true };
    // Lokale Werte gelten als „alt“, damit beim Profil/Design der Stand vom Code gewinnt (Rekorde werden trotzdem zusammengeführt)
    for (const k of watchedKeys()) st.ts[k] = 1;
    for (const k of watchedKeys()) { try { st.snap[k] = hash(localStorage.getItem(k)); } catch {} }
    save();
    const ok = await syncNow();
    if (!ok) { st = null; save(); emit(); throw new Error('offline'); }
    return code;
  }
  /** Dieses Gerät trennen (Daten bleiben hier und beim Code) */
  function leave() { st = null; save(); others = {}; ls.del('jb.syncOthers'); emit(); dispatchEvent(new CustomEvent('jukebox-sync', { detail: { changed: [] } })); }
  /** Code samt Daten beim Server löschen (die Daten auf den Geräten bleiben) */
  async function wipe() { if (!st) return; const { id } = await keys(st.code); await api('DELETE', id); leave(); }
  /** Löschmarke setzen, z. B. „Alle Rekorde löschen“ (präfix = 'mq.best2.', genau ein Schlüssel: '=ot.astars') – gilt dann
      auf allen Geräten. Den neuen lokalen Stand vorher schreiben: er ist jünger als die Marke und wird dann übernommen. */
  function reset(prefix) { if (!st) return; (st.z ||= {})[prefix] = now(); save(); soon(500); }
  /** Statistik über alle Geräte (eigener Wert + die der anderen Geräte) */
  function view(k, own) {
    const f = COMBINE[k], list = (others[k] || []).filter(Boolean);
    if (!st || !f || !list.length) return own;
    return list.reduce((acc, v) => acc ? f(acc, v) : v, own && own.games ? own : null) || own;
  }
  const onStatus = f => { listeners.add(f); return () => listeners.delete(f); };

  /* ---------- Bestenliste: Ergebnisse melden (nur wer mitmacht, siehe Jukebox js/leaderboard.js) ----------
     Läuft nach jedem Abgleich in jedem Spiel – so landet ein neues Tagesergebnis, ein Rekord oder die Serie in der
     Bestenliste, ohne dass man erst die Jukebox öffnen muss. Gesendet wird nur, was sich geändert hat (Merkliste hub.lb). */
  const LB = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && ls.get('hub.lbApi', null)) || API.replace(/sync\/$/, 'lb/');
  const dayOf = tz => new Date().toLocaleDateString('sv-SE', tz ? { timeZone: tz } : {});
  const prevDay = d => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
  const streakOf = (has, d) => { if (!has(d)) d = prevDay(d); let n = 0; while (has(d)) { n++; d = prevDay(d); } return n; };
  const BOARD = {
    // Tages-Challenge: Ergebnisse von heute und gestern (am Tag selbst gespielt, nicht nachgespielt)
    daily: () => {
      const out = [], L = ls.get('mq.daily', {}) || {}, t = dayOf('Europe/Berlin');
      for (const d of [t, prevDay(t)]) if (L[d] && !L[d].late && Number.isInteger(L[d].score)) out.push({ game: 'needle-drop', day: d, score: L[d].score });
      const g = dayOf();
      for (const d of [g, prevDay(g)]) { const r = ls.get('gr.daily.' + d, null); if (r?.done && !r.late && Number.isInteger(r.final)) out.push({ game: 'gold-record', day: d, score: r.final }); }
      for (const d of [t, prevDay(t)]) { const r = ls.get('hom.daily.' + d, null); if (r?.done && !r.late && Number.isInteger(r.score)) out.push({ game: 'hit-or-miss', day: d, score: r.score }); }
      return out;
    },
    // Highscores: nur Songauswahl „Alle“ (vergleichbar), je Stufe und Modus
    high: () => {
      const out = [];
      for (const d of ['easy', 'normal', 'hard', 'pro']) for (const m of ['show', 'blind']) out.push({ game: 'older-or-newer', cat: `${d}.${m}`, score: ls.get(`oon.best2.all.${d}.${m}`, 0) });
      // Gold Record: wie oft Diamant (15/15) je Schwierigkeit – Startwert + alle Geräte (die höchste Stufe wäre fast immer 15)
      const dStart = ls.get('gr.diaStart', null) || {}, dAll = view('gr.diamonds', ls.get('gr.diamonds', null)) || {};
      for (const d of ['easy', 'normal', 'hard']) out.push({ game: 'gold-record', cat: 'dia.' + d, score: (+dStart[d] || 0) + (+dAll[d] || 0) });
      // On Tour: Sterne – Haupt-Tour (ot.stars, mit Bonus-Stationen) und alle Touren (dazu ot.astars, Künstler-Touren)
      const sum = m => Object.values(m || {}).reduce((a, n) => a + (+n || 0), 0), otMain = sum(ls.get('ot.stars', null));
      out.push({ game: 'on-tour', cat: 'main', score: otMain }, { game: 'on-tour', cat: 'all', score: otMain + sum(ls.get('ot.astars', null)) });
      for (const m of ['60s', 'sd']) for (const d of ['easy', 'normal', 'hard']) out.push({ game: 'hit-or-miss', cat: `${m}.${d}`, score: ls.get(`hom.best.${m}.${d}`, 0) });   // Punkte (60 s) bzw. richtig in Folge
      return out.filter(x => Number.isInteger(x.score) && x.score > 0);
    },
    // Laufende Serie der Tages-Challenge
    streak: () => {
      const L = ls.get('mq.daily', {}) || {}, dl = ls.get('gr.dailyLog', {}) || {};
      const hl = ls.get('hom.dailyLog', {}) || {};
      return [{ game: 'needle-drop', score: streakOf(d => L[d] && !L[d].late, dayOf('Europe/Berlin')) }, { game: 'gold-record', score: streakOf(d => d in dl, dayOf()) },
        ...(Object.keys(hl).length ? [{ game: 'hit-or-miss', score: streakOf(d => d in hl, dayOf('Europe/Berlin')) }] : [])];
    },
  };
  let boardBusy = null;
  /** Neue Ergebnisse an die Bestenliste. Gibt die id zurück (oder null, wenn nicht mitgemacht wird). */
  function boardSend() {
    if (!st) return Promise.resolve(null);
    return boardBusy ||= (async () => {
      try {
        const { id } = await keys(st.code);
        let m = ls.get('hub.lb', null);
        if (!m || m.id !== id) m = { id, on: false, sent: {}, hs: {}, st: {} };
        m.sent ||= {}; m.hs ||= {}; m.st ||= {};
        const flag = ls.get('jb.lbOn', null);                                  // abgeglichen; fehlt er (ältere Geräte), zählt hub.lb
        if (!(flag === null ? m.on : flag === true)) return null;
        const post = (p, body) => fetch(LB + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }), cache: 'no-store' })
          .then(r => { if (!r.ok) throw new Error(r.status); });
        const jobs = [];
        const scores = BOARD.daily().filter(x => m.sent[x.game + '|' + x.day] !== x.score);
        if (scores.length) jobs.push(post('score', { scores }).then(() => {
          for (const s of scores) m.sent[s.game + '|' + s.day] = s.score;
          m.sent = Object.fromEntries(Object.entries(m.sent).sort((a, b) => b[0].slice(-10).localeCompare(a[0].slice(-10))).slice(0, 12));
        }));
        const highs = BOARD.high().filter(x => x.score > (m.hs[x.game + '|' + x.cat] || 0));
        if (highs.length) jobs.push(post('high', { scores: highs }).then(() => { for (const h of highs) m.hs[h.game + '|' + h.cat] = h.score; }));
        const today = dayOf('Europe/Berlin');
        const streaks = BOARD.streak().filter(x => !m.st[x.game] || m.st[x.game][0] !== x.score || m.st[x.game][1] !== today);
        if (streaks.length) jobs.push(post('streak', { scores: streaks }).then(() => { for (const s of streaks) m.st[s.game] = [s.score, today]; }));
        await Promise.allSettled(jobs);
        m.on = true; ls.set('hub.lb', m);
        return id;
      } catch { return null; } finally { boardBusy = null; }
    })();
  }

  /* ---------- Automatisch ---------- */
  if (st) setTimeout(syncNow, 1200);                                         // beim Öffnen
  setInterval(() => { if (dirty()) soon(); }, 8000);                         // neue Rekorde usw. bald hochladen
  document.addEventListener('visibilitychange', () => {
    if (!st) return;
    if (document.visibilityState === 'hidden') { if (dirty()) syncNow(); }     // beim Wegwechseln sofort sichern
    else if (now() - (st.last || 0) > 30000) soon(300);                       // beim Zurückkommen holen
  });
  addEventListener('storage', e => { if (e.key === 'jb.sync') { st = ls.get('jb.sync', null); emit(); } }); // anderer Tab

  return { status, create, join, leave, wipe, reset, view, onStatus, syncNow, normCode, boardSend };
})();
