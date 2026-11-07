// Cover prüfen: Liegt ein Song bei Deezer nur auf einem Sampler („Sommer Hits“, „Bravo Hits“, Soundtracks, Various Artists …),
// zeigen die Spiele dessen Cover. Dieses Skript sucht für solche Songs das Original-Cover und schreibt die Korrekturen nach
// data/covers.json im jeweiligen Spiel:   { "<Deezer-Track-ID>": "<Cover>" }
//   1. MusicBrainz: früheste offizielle Veröffentlichung (Original-Single/-Album, keine Compilation/Live/Soundtrack) mit Bild im
//      Cover Art Archive → "mb:<release-group-id>" (Bild: coverartarchive.org/release-group/<id>/front-500)
//   2. sonst Deezer: Album/Single (oder Best-of) des Interpreten selbst → md5 des Deezer-Covers
// Die Spiele übernehmen das beim Laden (s.c). Die Song-Dateien selbst bleiben unverändert.
//
// Aufruf (im Ordner Spiele-Hub):  node scripts/check-covers.js
// Zwischenstand: scripts/.cache/covers.json (abbrechen und neu starten ist kein Problem). Dauert beim ersten Mal ca. 30–60 Minuten.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const GAMES = [
  { name: 'Gold Record', dir: 'Gold-Record', files: ['songs.json', 'extra.json', 'more.json'] },
  { name: 'Older or Newer', dir: 'Older-or-Newer', files: ['songs.json'] },
];
const LIMIT = +process.env.LIMIT || 0;            // Test: nur die ersten N Songs je Spiel, nichts schreiben
const cacheF = path.join(__dirname, '.cache', 'covers.json');
fs.mkdirSync(path.dirname(cacheF), { recursive: true });
const cache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : {};
for (const k of ['track', 'album', 'search', 'mb', 'caa']) cache[k] ||= {};
const MB = require(path.join(ROOT, 'Gold-Record', 'scripts', 'mb.js'));   // gleiche Regeln wie für die Originaljahre
let dirty = 0;
const save = (force) => { if (force || ++dirty % 50 === 0) fs.writeFileSync(cacheF, JSON.stringify(cache)); };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function get(url) {
  for (let t = 0; t < 8; t++) {
    const wait = last + 115 - Date.now(); if (wait > 0) await sleep(wait);   // Deezer: höchstens 50 Abfragen in 5 Sekunden
    last = Date.now();
    try {
      const d = await (await fetch(url)).json();
      if (d.error?.code === 4) { await sleep(5000); continue; }           // zu viele Abfragen → kurz warten
      return d;
    } catch { await sleep(2000); }
  }
  return { error: 'x' };
}
const track = async id => cache.track[id] ??= await (async () => {
  const t = await get(`https://api.deezer.com/track/${id}`); save();
  return t.error ? null : { al: t.album?.id, at: t.album?.title || '', c: t.album?.md5_image || '' };
})();
const album = async id => cache.album[id] ??= await (async () => {
  const a = await get(`https://api.deezer.com/album/${id}`); save();
  return a.error ? null : { t: a.title || '', ar: a.artist?.name || '', rt: a.record_type || '', d: a.release_date || '', c: a.md5_image || '' };
})();
const search = async (a, t) => { const k = a + '|' + t; return cache.search[k] ??= await (async () => {
  // Die erweiterte Suche (artist:"…" track:"…") liefert oft nichts – die normale Suche mit Interpret und Titel schon
  const q = encodeURIComponent(`${a} ${t}`);
  const r = await get(`https://api.deezer.com/search?q=${q}&limit=50`); save();
  return (r.data || []).map(x => ({ t: x.title_short || x.title || '', a: x.artist?.name || '', al: x.album?.id, at: x.album?.title || '' }));
})(); };

// Vergleichen ohne Klammern, „feat.“, Remaster-Zusätze, Sonderzeichen
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s+-\s+.*$/, '').replace(/\b(feat|ft|featuring)\b.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const firstArtist = a => norm(String(a).split(/,|&| x | und | and | feat\.? | ft\.? | with /i)[0]);
const sameArtist = (x, y) => { const a = norm(x), b = norm(y), fa = firstArtist(x), fb = firstArtist(y);
  return !!a && !!b && (a === b || fa === fb || a.includes(fb) || b.includes(fa)); };
const sameTitle = (x, y) => { const a = norm(x), b = norm(y); return a === b || (a.length > 3 && (a.startsWith(b) || b.startsWith(a))); };
// Andere Fassungen als das Original (im vollen Titel, auch in Klammern): Remixe, Edits, Live, Akustik, Coverversionen …
const BAD_VERSION = /\b(live|karaoke|instrumental|acoustic|unplugged|tribute|cover|covers|remix|remixes|mix|edit|relift|rework|remake|re-?recorded|sped up|slowed|8-bit|lullaby|orchestral|piano|originally|performed by|made famous|in the style|version|a cappella|demo|en directo)\b/i;
const VARIOUS = /various|verschiedene|varios|divers|vari artisti|compilation|soundtrack|motion picture|cast|karaoke/i;
const SOUNDTRACK = /soundtrack|motion picture|original score|\bost\b|musical|from the (movie|film|series)/i;

/** Ist das Album vom Interpreten selbst? (Auch ein Best-of des Interpreten ist in Ordnung – nur Sampler mit
    verschiedenen Interpreten, Soundtracks usw. haben das falsche Cover.) */
const ownAlbum = (al, song) => !!al && sameArtist(al.ar, song.a) && !VARIOUS.test(al.ar);
/** Filmsong: Der Soundtrack aus dem Jahr des Songs IST das Original („Let It Go“ → Frozen) – nicht ersetzen.
    Ein späterer Soundtrack (Hound Dog 1956 auf Forrest Gump 2001) dagegen schon. */
const originalSoundtrack = (al, song) => !!al && SOUNDTRACK.test(al.t + ' ' + al.ar) && !!song.y && Math.abs(+String(al.d).slice(0, 4) - song.y) <= 1;

/** Gibt es im Cover Art Archive ein Vorderseiten-Bild für diese Release-Group? */
async function caa(id) {
  if (id in cache.caa) return cache.caa[id];
  let ok = false;
  try { const r = await fetch(`https://coverartarchive.org/release-group/${id}/front-250`, { method: 'HEAD', redirect: 'manual' }); ok = [200, 302, 307].includes(r.status); }
  catch { return false; }                                                   // Netzfehler: nicht merken, beim nächsten Lauf neu prüfen
  cache.caa[id] = ok; save(); return ok;
}
/** MusicBrainz, Schritt 1: Single/Album, die so heißt wie der Song („Hound Dog / Don't Be Cruel“), aus der Zeit des Songs */
async function rgCover(song, vs) {
  const T = MB.baseTitle(song.t).toLowerCase().replace(/[’']/g, "'").trim();
  const q = `releasegroup:"${MB.baseTitle(song.t).replace(/"/g, '')}" AND (${vs.map(a => `artist:"${a.replace(/"/g, '')}"`).join(' OR ')}) AND (primarytype:single OR primarytype:album OR primarytype:ep)`;
  let j;
  try { j = await MB.mbJson('https://musicbrainz.org/ws/2/release-group?fmt=json&limit=25&query=' + encodeURIComponent(q)); } catch { return undefined; }
  const okTitle = x => { const t = String(x.title || '').toLowerCase().replace(/[’']/g, "'"); return t === T || (t.startsWith(T) && /^[\s/(:,–-]/.test(t.slice(T.length))); };
  const okArtist = x => { const credit = MB.normStr((x['artist-credit'] || []).map(a => a.name || a.artist?.name).join(''));
    return vs.some(a => credit.includes(MB.normStr(a)) || (credit.length > 2 && MB.normStr(a).includes(credit))); };
  const y = +song.y || 0;
  const list = (j['release-groups'] || []).filter(x => !(x['secondary-types'] || []).length && okTitle(x) && okArtist(x) && !BAD_VERSION.test(x.title || '') && /^\d{4}/.test(x['first-release-date'] || ''))
    .filter(x => { const ry = +x['first-release-date'].slice(0, 4); return !y || (ry >= y - 1 && ry <= y + 2); })
    .sort((a, b) => a['first-release-date'].localeCompare(b['first-release-date']));
  for (const x of list.slice(0, 4)) if (await caa(x.id)) return { id: x.id, d: x['first-release-date'], t: x.title };
  return null;
}
/** MusicBrainz: Original-Cover – erst Single/Album mit dem Songtitel, sonst früheste offizielle Veröffentlichung mit dem Song
    (ohne Compilation, Live, Soundtrack …), jeweils nur mit Bild im Cover Art Archive */
async function mbCover(song) {
  const k = song.a + '|' + song.t;
  if (k in cache.mb) return cache.mb[k];
  const vs0 = [song.a, song.a.split(/ & | x | feat\.? | with |, /i)[0]].map(s => s.trim()).filter((v, i, a) => v && a.indexOf(v) === i);
  const first = await rgCover(song, vs0);
  if (first === undefined) return null;                                     // Netzfehler: nicht merken
  if (first) { cache.mb[k] = first; save(); return first; }
  const vs = [song.a, song.a.split(/ & | x | feat\.? | with |, /i)[0]].map(s => s.trim()).filter((v, i, a) => v && a.indexOf(v) === i);
  const q = `recording:"${MB.baseTitle(song.t).replace(/"/g, '')}" AND (${vs.map(a => `artist:"${a.replace(/"/g, '')}"`).join(' OR ')}) AND status:official`;
  let j;
  try { j = await MB.mbJson('https://musicbrainz.org/ws/2/recording?fmt=json&limit=100&query=' + encodeURIComponent(q)); } catch { return null; }
  const want = MB.normStr(MB.baseTitle(song.t)), groups = new Map();      // Release-Group-ID → früheste Veröffentlichung
  for (const rec of j.recordings || []) {
    if ((rec.score ?? 0) < 80 || /\blive\b/i.test(rec.disambiguation || '')) continue;
    if (MB.normStr(MB.baseTitle(rec.title)) !== want) continue;
    const credit = MB.normStr((rec['artist-credit'] || []).map(a => a.name || a.artist?.name).join(''));
    if (!vs.some(a => credit.includes(MB.normStr(a)) || (credit.length > 2 && MB.normStr(a).includes(credit)))) continue;
    for (const r of rec.releases || []) {
      if (/bootleg|pseudo|withdrawn|promotion/i.test(r.status || '')) continue;
      const g = r['release-group'] || {}, sec = g['secondary-types'] || [];
      if (!g.id || sec.some(t => /compilation|live|remix|dj-mix|soundtrack|interview|demo|mixtape/i.test(t))) continue;
      if (!/^(album|single|ep)$/i.test(g['primary-type'] || '')) continue;
      if (BAD_VERSION.test(g.title || r.title || '')) continue;               // „The Body Acoustic“, „Unplugged“ …
      const d = r.date || ''; if (!/^\d{4}/.test(d)) continue;
      const cur = groups.get(g.id);
      if (!cur || d < cur.d) groups.set(g.id, { d, t: g.title || r.title || '' });
    }
  }
  let res = null;
  // Plausibel: höchstens 2 Jahre nach dem bekannten Songjahr (sonst ist es eine spätere Ausgabe, nicht das Original)
  const maxY = song.y ? song.y + 2 : 9999;
  for (const [id, g] of [...groups].filter(([, g]) => +g.d.slice(0, 4) <= maxY).sort((a, b) => a[1].d.localeCompare(b[1].d)).slice(0, 8))
    if (await caa(id)) { res = { id, ...g }; break; }
  cache.mb[k] = res; save();
  return res;
}

async function original(song) {
  const found = await search(song.a, song.t);
  const ids = [...new Set(found.filter(x => x.al && sameArtist(x.a, song.a) && sameTitle(x.t, song.t) && !BAD_VERSION.test(x.t) && !BAD_VERSION.test(x.at)).map(x => x.al))].slice(0, 8);
  const albums = [];
  // Nur sichere Fälle: Album aus der Zeit des Songs, oder die Single selbst (gleicher Titel). Spätere Boxen, Live-Alben
  // ohne „live“ im Namen usw. fallen so raus – dann lieber das alte Cover behalten als ein falsches nehmen.
  const ofItsTime = al => { const ay = +String(al.d).slice(0, 4); return !!song.y && ay >= song.y - 1 && ay <= song.y + 2; };
  for (const id of ids) {
    const al = await album(id);
    if (ownAlbum(al, song) && al.c && !BAD_VERSION.test(al.t) && (ofItsTime(al) || norm(al.t) === norm(song.t))) albums.push(al);
  }
  // Bevorzugt echte Alben/Singles (kein Best-of), dann die früheste Veröffentlichung = Original
  albums.sort((x, y) => (x.rt === 'compile') - (y.rt === 'compile') || (x.d || '9999').localeCompare(y.d || '9999'));
  return albums[0] || null;
}

(async () => {
  const report = [];
  for (const g of GAMES) {
    const songs = g.files.flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, g.dir, 'data', f), 'utf8')).songs).slice(0, LIMIT || Infinity);
    const out = {}; let checked = 0, bad = 0, fixed = 0;
    for (const s of songs) {
      if (++checked % 250 === 0) { console.log(`${g.name}: ${checked}/${songs.length} geprüft, ${bad} Sampler-Cover, ${fixed} korrigiert`); save(true); }
      const tr = await track(s.id);
      if (!tr?.al) continue;
      const al = await album(tr.al);
      if (!al || ownAlbum(al, s)) continue;                                // Cover ist vom Interpreten selbst → in Ordnung
      if (originalSoundtrack(al, s)) continue;                             // Filmsong auf dem Soundtrack seines Jahres → Original
      bad++;
      const m = await mbCover(s);
      if (m) { out[s.id] = 'mb:' + m.id; fixed++; report.push(`${g.name}: ${s.a} – ${s.t}: „${al.t}“ (${al.ar}) → MusicBrainz „${m.t}“ (${m.d.slice(0, 4)})`); continue; }
      const o = await original(s);
      if (o && o.c !== s.c) { out[s.id] = o.c; fixed++; report.push(`${g.name}: ${s.a} – ${s.t}: „${al.t}“ (${al.ar}) → Deezer „${o.t}“ (${o.d.slice(0, 4)})`); }
      else if (!o) report.push(`${g.name}: ${s.a} – ${s.t}: „${al.t}“ (${al.ar}) → kein Original gefunden`);
    }
    const f = path.join(ROOT, g.dir, 'data', 'covers.json');
    if (!LIMIT) fs.writeFileSync(f, JSON.stringify({ _hinweis: 'Original-Cover statt Sampler-Cover (Deezer-Track-ID → Cover). Erstellt mit Spiele-Hub/scripts/check-covers.js', built: new Date().toISOString().slice(0, 10), covers: out }));
    console.log(`✓ ${g.name}: ${songs.length} Songs, ${bad} mit Sampler-Cover, ${fixed} korrigiert → ${path.relative(ROOT, f)}`);
  }
  save(true);
  fs.writeFileSync(path.join(__dirname, '.cache', 'covers-report.txt'), report.join('\n'));
  console.log('Bericht: scripts/.cache/covers-report.txt');
})();
