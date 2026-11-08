// Neue Songs für Gold Record, Older or Newer, Hit or Miss und On Tour – alles in der richtigen Reihenfolge.
// (Needle Drop aktualisiert sich selbst: GitHub-Automatik „Songlisten aktualisieren“ am 1. des Monats.)
//
// Aufruf im Ordner Spiele-Hub:
//   node scripts/update-songs.js            alles bauen, danach Bericht – nichts wird hochgeladen
//   node scripts/update-songs.js --commit   …und geänderte Songdaten einchecken und hochladen
//   node scripts/update-songs.js --only gr,oon,covers,hom,ot   nur einzelne Schritte
//
// Reihenfolge (jeder Schritt baut auf dem vorigen auf):
//   1. Milliarden-Liste von Needle Drop übernehmen (dort monatlich automatisch aktualisiert)
//   2. Gold Record: Playlists (build-more → pick-more), Milliarden-Songs (build-extra), Originaljahre (check-years-more,
//      MusicBrainz), Genres, Gast-Interpreten (build-feat)
//   3. Older or Newer: automatische Songliste (build-auto, MusicBrainz) → Deezer-IDs (build-songs)
//   4. Original-Cover für beide (check-covers.js)
//   5. Hit or Miss: Datenpaket aus Gold Record + Older or Newer (build-data)
//   6. On Tour: Datenpaket aus Hit or Miss + Gold Record (build-data) – Songs je Station; Adventskalender (build-advent,
//      Weihnachtsliste aus dem Zwischenspeicher – neue Playlists holen: im Ordner On-Tour node scripts/build-advent.js --refresh)
//   7. DATA_V erhöhen, wo sich Songdaten geändert haben (sonst laden Handys die neuen Daten erst später)
// Vorsicht: Liegen in einem Spiel noch fremde, nicht eingecheckte Änderungen an den Daten, wird es übersprungen.
// Dauer: meist wenige Minuten (Zwischenspeicher); bei vielen neuen Songs länger (MusicBrainz: 1 Abfrage/Sekunde).
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync, execFileSync } = require('child_process');
const HUB = path.join(__dirname, '..'), DOCS = path.join(HUB, '..');
const args = process.argv.slice(2), COMMIT = args.includes('--commit');
const only = (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean);
const want = step => !only.length || only.includes(step);
const today = new Date().toISOString().slice(0, 10);
const G = { gr: path.join(DOCS, 'Gold-Record'), oon: path.join(DOCS, 'Older-or-Newer'), hom: path.join(DOCS, 'Hit-or-Miss'), ot: path.join(DOCS, 'On-Tour'), nd: path.join(DOCS, 'Musik-Quiz') };
const DATA = { gr: ['songs.json', 'extra.json', 'more.json', 'years.json', 'genres.json', 'feat.json', 'billions.json', 'covers.json'],
  oon: ['songs.json', 'songs-auto.txt', 'mb-years.json', 'dz-years.json', 'covers.json'], hom: ['tracks.json'], ot: ['tour.json', 'advent.json', 'advent-doors.json'] };

const log = (...a) => console.log(...a);
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
function run(dir, script, ...a) {
  const env = typeof a[a.length - 1] === 'object' ? a.pop() : {};
  log(`\n▶ ${path.basename(dir)}: node ${script} ${a.join(' ')}`);
  const r = spawnSync(process.execPath, [script, ...a], { cwd: dir, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) { log(`⚠️  ${script} ist mit Fehler beendet (Code ${r.status}) – weiter mit dem nächsten Schritt`); return false; }
  return true;
}
const exists = f => fs.existsSync(f);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** Darf ein Spiel angefasst werden? Nein, wenn dort fremde Änderungen an den Daten offen sind. */
function clean(key) {
  if (!exists(G[key])) { log(`– ${key}: Ordner fehlt, übersprungen`); return false; }
  try { git(G[key], 'pull', '--rebase', '--autostash', '-q'); } catch (e) { log(`⚠️  ${key}: git pull ging nicht – übersprungen`); return false; }
  const dirty = git(G[key], 'status', '--porcelain', '--', 'data').split('\n').filter(Boolean);
  if (dirty.length) { log(`⚠️  ${key}: offene Änderungen in data/ (${dirty.length}) – übersprungen, damit nichts Fremdes vermischt wird`); return false; }
  return true;
}
// Songs je Spiel (für den Bericht)
const songsOf = {
  gr: () => ['songs.json', 'extra.json', 'more.json'].flatMap(f => readJson(path.join(G.gr, 'data', f))?.songs || []).map(s => ({ id: s.id, t: s.t, a: s.a, y: s.y })),
  oon: () => (readJson(path.join(G.oon, 'data', 'songs.json'))?.songs || []).map(s => ({ id: s.id, t: s.t, a: s.a, y: s.y })),
  hom: () => { const j = readJson(path.join(G.hom, 'data', 'tracks.json')); return (j?.tracks || []).map(t => ({ id: t.i, t: t.t, a: j.artists[t.a], y: t.y })); },
  ot: () => (readJson(path.join(G.ot, 'data', 'tour.json'))?.songs || []).map(([id, t, a, y]) => ({ id, t, a, y })),
};
const before = {}; for (const k in songsOf) if (exists(G[k])) before[k] = songsOf[k]();
const ok = {};

// 1. Milliarden-Liste von Needle Drop
if (want('gr') && (ok.gr = clean('gr'))) {
  try { git(G.nd, 'pull', '--rebase', '--autostash', '-q'); } catch {}
  const src = path.join(G.nd, 'data', 'billions.json'), dst = path.join(G.gr, 'data', 'billions.json');
  if (exists(src) && fs.readFileSync(src, 'utf8') !== fs.readFileSync(dst, 'utf8')) { fs.copyFileSync(src, dst); log('✓ Milliarden-Liste von Needle Drop übernommen'); }
  else log('✓ Milliarden-Liste ist aktuell');
  // 2. Gold Record
  run(G.gr, 'scripts/build-more.js') && run(G.gr, 'scripts/pick-more.js');
  run(G.gr, 'scripts/build-extra.js');
  run(G.gr, 'scripts/check-years-more.js');
  run(G.gr, 'scripts/build-genres.js');
  if (exists(path.join(G.gr, 'scripts/build-feat.js'))) run(G.gr, 'scripts/build-feat.js');
}
// 3. Older or Newer
if (want('oon') && (ok.oon = clean('oon'))) {
  run(G.oon, 'scripts/build-auto.js') && run(G.oon, 'scripts/build-songs.js');
}
// 4. Original-Cover – für die Spiele, die in diesem Lauf dran sind (ohne --only: beide)
if (want('covers')) {
  const which = [['gr', 'Gold-Record'], ['oon', 'Older-or-Newer']].filter(([k]) => !only.length || only.includes(k)).filter(([k]) => ok[k] ?? (ok[k] = clean(k)));
  if (which.length) run(HUB, 'scripts/check-covers.js', { COVER_GAMES: which.map(([, d]) => d).join(',') });
}
// 5. Hit or Miss
if (want('hom') && exists(G.hom) && (ok.hom = clean('hom'))) {
  // build-data → andere Fassungen der (neuen) Songs bei Deezer suchen → nochmal build-data mit diesen Fassungen
  run(G.hom, 'scripts/build-data.js') && exists(path.join(G.hom, 'scripts/build-versions.js')) && run(G.hom, 'scripts/build-versions.js') && run(G.hom, 'scripts/build-data.js');
}

// 6. On Tour – nach Hit or Miss (nimmt dessen Paket); Songs je Station werden fest ausgewählt
// bauen → prüfen, ob Deezer zu jedem Song einen Ausschnitt hat → nochmal bauen (ohne stumme Songs)
if (want('ot') && exists(G.ot) && (ok.ot = clean('ot'))) run(G.ot, 'scripts/build-data.js') && run(G.ot, 'scripts/check-previews.js') && run(G.ot, 'scripts/build-data.js') && run(G.ot, 'scripts/build-advent.js');

// 7. DATA_V erhöhen, wo sich Songdaten geändert haben – aber nur, wenn js/game.js sonst unverändert ist
const changed = k => ok[k] && git(G[k], 'status', '--porcelain', '--', ...DATA[k].map(f => 'data/' + f)).length > 0;
function bumpDataV(k) {
  const f = path.join(G[k], 'js', 'game.js');
  if (!exists(f)) return '';
  if (git(G[k], 'status', '--porcelain', '--', 'js/game.js')) return '⚠️  js/game.js hat fremde Änderungen – DATA_V nicht erhöht';
  const s = fs.readFileSync(f, 'utf8'), m = s.match(/const DATA_V = '([a-z]*)(\d+)';/);
  if (!m) return '';
  fs.writeFileSync(f, s.replace(m[0], `const DATA_V = '${m[1]}${+m[2] + 1}';`));
  return `DATA_V ${m[1]}${m[2]} → ${m[1]}${+m[2] + 1}`;
}

// Bericht
log('\n════════ Bericht ════════');
const result = {};
for (const k of ['gr', 'oon', 'hom', 'ot']) {
  if (!ok[k]) continue;
  const name = { gr: 'Gold Record', oon: 'Older or Newer', hom: 'Hit or Miss', ot: 'On Tour' }[k];
  const now = songsOf[k](), old = new Set((before[k] || []).map(s => s.id)), nowIds = new Set(now.map(s => s.id));
  const added = now.filter(s => !old.has(s.id)), removed = (before[k] || []).filter(s => !nowIds.has(s.id));
  const isChanged = changed(k);
  result[k] = { name, added, removed, changed: isChanged, bump: isChanged ? bumpDataV(k) : '' };
  log(`\n${name}: ${now.length} Songs (${added.length} neu, ${removed.length} weg)${isChanged ? '' : ' – keine Änderung an den Daten'}`);
  if (added.length) log('  neu: ' + added.slice(0, 25).map(s => `${s.a} – ${s.t}${s.y ? ' (' + s.y + ')' : ''}`).join(' · ') + (added.length > 25 ? ` … und ${added.length - 25} weitere` : ''));
  if (removed.length) log('  weg: ' + removed.slice(0, 15).map(s => `${s.a} – ${s.t}`).join(' · ') + (removed.length > 15 ? ' …' : ''));
  if (result[k].bump) log('  ' + result[k].bump);
}

// Einchecken und hochladen (nur Songdaten und ggf. die DATA_V-Zeile)
if (COMMIT) {
  for (const [k, r] of Object.entries(result)) {
    if (!r.changed) continue;
    const files = DATA[k].map(f => 'data/' + f).filter(f => exists(path.join(G[k], f)));
    if (r.bump.startsWith('DATA_V')) files.push('js/game.js');
    try {
      git(G[k], 'add', '--', ...files);
      git(G[k], 'commit', '-q', '-m', `Songlisten aktualisiert (${today}): ${r.added.length} neu, ${r.removed.length} weg\n\nErstellt mit Spiele-Hub/scripts/update-songs.js`);
      git(G[k], 'push', '-q');
      log(`✓ ${r.name}: eingecheckt und hochgeladen`);
    } catch (e) { log(`⚠️  ${r.name}: Hochladen ging nicht – ${e.message.split('\n')[0]}`); process.exitCode = 1; }
  }
} else if (Object.values(result).some(r => r.changed)) log('\nNichts hochgeladen. Prüfen, dann mit --commit erneut starten (geht schnell, alles ist zwischengespeichert).');
