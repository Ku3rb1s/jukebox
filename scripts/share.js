#!/usr/bin/env node
/* Gemeinsame Dateien aller Jukebox-Spiele verteilen.
 *
 * Die Originale liegen in Spiele-Hub/shared/ (Design-Basis, Schrift, Sprachen, Profil, Abgleich, App-Modus).
 * Welche Spiele welche Dateien bekommen, steht in shared/games.json.
 *
 *   node scripts/share.js                 prüfen: welche Kopie weicht vom Original ab?
 *   node scripts/share.js --write         Originale in alle Spiele kopieren und dort ?v= in index.html erhöhen
 *   node scripts/share.js --lang          Übersetzungen aller Spiele prüfen (--lang -v: mit Details)
 *   node scripts/share.js --pull <Ordner> <Datei>
 *                                         eine in einem Spiel geänderte Datei zum neuen Original machen
 *                                         (z. B. --pull Musik-Quiz js/sync.js), danach --write für alle anderen
 *
 * sw.js: Im Original steht __PREFIX__, beim Kopieren wird das Kürzel des Spiels eingesetzt (Feld "sw" in games.json),
 * damit sich die Zwischenspeicher der Spiele nicht gegenseitig löschen.
 * Danach in jedem geänderten Spiel testen, einchecken und hochladen (siehe JUKEBOX.md).
 */
const fs = require('fs'), path = require('path');
const HUB = path.resolve(__dirname, '..');
const ROOT = path.resolve(HUB, '..');                        // Documents/Claude
const SHARED = path.join(HUB, 'shared');
const cfg = JSON.parse(fs.readFileSync(path.join(SHARED, 'games.json'), 'utf8'));
const args = process.argv.slice(2);
const isText = f => !/\.(woff2?|png|jpe?g|ico)$/.test(f);

/** Inhalt des Originals für ein bestimmtes Spiel (bei sw.js mit eingesetztem Kürzel) */
function wanted(file, game) {
  const src = path.join(SHARED, file);
  if (!isText(file)) return fs.readFileSync(src);
  let s = fs.readFileSync(src, 'utf8');
  if (file === 'sw.js') s = s.replace(/__PREFIX__-', CACHE = PREFIX \+ '1';\s*\/\/[^\n]*/, `${game.sw}-', CACHE = PREFIX + '1';`).replace(/__PREFIX__/g, game.sw);
  return s;
}
const same = (a, b) => Buffer.isBuffer(a) ? Buffer.compare(a, b) === 0 : a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
const read = (p, bin) => fs.existsSync(p) ? (bin ? fs.readFileSync(p) : fs.readFileSync(p, 'utf8')) : null;

/** ?v= der Datei in index.html erhöhen (auch Musik-Bingo-Stil 4.27.2 → 4.27.3) */
function bump(dir, file) {
  const idx = path.join(dir, 'index.html');
  if (!fs.existsSync(idx)) return false;
  let h = fs.readFileSync(idx, 'utf8');
  const re = new RegExp(`(["'(]${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=)([0-9.]+)`, 'g');
  let hit = false;
  h = h.replace(re, (m, pre, v) => { hit = true; const parts = v.split('.'); parts[parts.length - 1] = String(+parts[parts.length - 1] + 1); return pre + parts.join('.'); });
  if (hit) fs.writeFileSync(idx, h);
  return hit;
}

/* --lang: Übersetzungen aller Spiele prüfen (scripts/check-lang.js im jeweiligen Spiel) */
if (args[0] === '--lang') {
  const { spawnSync } = require('child_process');
  let bad = 0;
  for (const game of cfg.games) {
    const dir = path.join(ROOT, game.dir), script = path.join(dir, 'scripts', 'check-lang.js');
    if (!fs.existsSync(script)) { console.log(`– ${game.name}: kein scripts/check-lang.js`); continue; }
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    const last = (r.stdout || '').trim().split('\n').pop();
    console.log(`${r.status ? '✗' : '✓'} ${game.name}: ${last}`);
    if (r.status) { bad++; if (args.includes('-v')) console.log(r.stdout); }
  }
  console.log(bad ? '\nDetails: im Spiel-Ordner node scripts/check-lang.js (oder hier --lang -v)' : '\nAlle Übersetzungen vollständig.');
  process.exit(bad ? 1 : 0);
}

/* --pull: eine geänderte Kopie zum Original machen */
if (args[0] === '--pull') {
  const [, dirName, file] = args;
  const game = cfg.games.find(g => g.dir === dirName || g.name === dirName);
  if (!game || !file) { console.log('Aufruf: node scripts/share.js --pull <Ordner> <Datei>'); process.exit(1); }
  let s = read(path.join(ROOT, game.dir, file), !isText(file));
  if (s == null) { console.log('Datei fehlt: ' + path.join(game.dir, file)); process.exit(1); }
  if (file === 'sw.js') s = s.replace(new RegExp(`'${game.sw}-', CACHE = PREFIX \\+ '1';`), `'__PREFIX__-', CACHE = PREFIX + '1';   // __PREFIX__ setzt scripts/share.js je Spiel ein`);
  fs.writeFileSync(path.join(SHARED, file), s);
  console.log(`✓ shared/${file} übernommen aus ${game.name}. Jetzt verteilen: node scripts/share.js --write`);
  process.exit(0);
}

/* Prüfen bzw. verteilen */
const write = args.includes('--write');
let diffs = 0;
for (const game of cfg.games) {
  const dir = path.join(ROOT, game.dir);
  if (!fs.existsSync(dir)) { console.log(`⚠️  ${game.name}: Ordner ${game.dir} fehlt`); continue; }
  const changed = [];
  for (const file of cfg.sets[game.set]) {
    const want = wanted(file, game), target = path.join(dir, file), have = read(target, !isText(file));
    if (have != null && same(want, have)) continue;
    diffs++;
    changed.push(file + (have == null ? ' (neu)' : ''));
    if (write) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, want);
      bump(dir, file);
    }
  }
  console.log(changed.length ? `${write ? '✎' : '≠'} ${game.name}: ${changed.join(', ')}` : `✓ ${game.name}: alles gleich`);
}
if (!diffs) console.log('\nAlle Spiele haben die aktuellen gemeinsamen Dateien.');
else if (!write) console.log(`\n${diffs} Abweichung(en). Verteilen mit: node scripts/share.js --write\n(Wurde eine Kopie absichtlich geändert? Erst übernehmen: node scripts/share.js --pull <Ordner> <Datei>)`);
else console.log('\nVerteilt und ?v= erhöht. Jetzt jedes geänderte Spiel kurz testen, dann einchecken und hochladen.');
