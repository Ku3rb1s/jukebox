// Prüft die Sprachdateien (js/lang/*.js): Was fehlt, was ist überflüssig, stimmen die Platzhalter?
// Gemeinsame Datei aller Jukebox-Spiele (Original: Spiele-Hub/shared/scripts/check-lang.js, verteilt mit scripts/share.js).
// Spielspezifisches (Eigennamen, Tabellen mit Texten, Ausnahmen) steht in scripts/lang.config.js des Spiels.
//
// Aufruf im Spiel-Ordner:  node scripts/check-lang.js          (prüfen)
//                          node scripts/check-lang.js --keys   (alle zu übersetzenden deutschen Texte als JSON ausgeben)
// Für alle Spiele auf einmal (im Ordner Spiele-Hub): node scripts/share.js --lang
//
// Gesammelt werden: feste Texte in index.html, tx('…')-Texte im Code, Texte aus Tabellen (siehe lang.config.js).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const cfgFile = path.join(__dirname, 'lang.config.js');
const cfg = fs.existsSync(cfgFile) ? require(cfgFile) : {};

/* ---------- alle deutschen Texte sammeln ---------- */
const keys = new Set();
const add = s => { s = s.replace(/\s+/g, ' ').trim(); if (s && /\p{L}/u.test(s)) keys.add(s); };
const unq = s => s.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
const STR = String.raw`'((?:\\.|[^'\\])*)'`;

// 1) index.html: Text zwischen Tags (ohne <script>, <style>, <svg>, Kommentare) und übersetzte Attribute
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
const body = html.slice(html.indexOf('<body'));
for (const m of body.matchAll(/>([^<>]+)</g)) add(decode(m[1]));
for (const m of body.matchAll(/\s(?:placeholder|aria-label|title|data-title)="([^"]+)"/g)) add(decode(m[1]));

// 2) Code: alle Text-Literale innerhalb von tx( … ) – auch in Ternären und Objekt-Tabellen.
//    i18n.js und sync.js sind gemeinsame Technik ohne eigene Texte.
const code = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js') && !['i18n.js', 'sync.js', 'profile.js'].includes(f))
  .map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
for (const m of code.matchAll(/\btx\(/g)) {
  let i = m.index + 3, depth = 1, j = i;                       // bis zur passenden schließenden Klammer
  while (j < code.length && depth) { const c = code[j]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++; } } j++; }
  const arg = code.slice(i, j - 1).split(/,\s*\{[^']*$/)[0];
  for (const s of arg.matchAll(new RegExp(STR, 'g'))) add(unq(s[1]));
}

// 3) Texte, die erst zur Laufzeit über tx(Variable) laufen
// Farbthemen (in allen Spielen gleich): ['graphit', 'Graphit', …]
for (const m of code.matchAll(/\['(?:graphit|ozean|wald|abend|lila|oled)', '([^']+)'/g)) add(m[1]);
// Erfolge (Format aller Spiele): ['id', 'Symbol', 'Name', 'Beschreibung']
for (const s of code.matchAll(new RegExp(String.raw`\['\w+', '[^']*', ${STR}, ${STR}\]`, 'g'))) { add(unq(s[1])); add(unq(s[2])); }
// Tabellen aus lang.config.js: const NAME = { schlüssel: 'Text', … }  bzw.  const NAME = ['Text', …]
for (const tbl of cfg.tables || []) {
  const m = code.match(new RegExp('const ' + tbl + ' = \\{([\\s\\S]*?)\\};'));
  if (m) for (const s of m[1].matchAll(new RegExp(String.raw`:\s*` + STR, 'g'))) add(unq(s[1]));
}
for (const arr of cfg.arrays || []) {
  const m = code.match(new RegExp('const ' + arr + ' = \\[([\\s\\S]*?)\\];'));
  if (m) for (const s of m[1].matchAll(new RegExp(STR, 'g'))) add(unq(s[1]));
}
// Felder in Daten-Objekten, z. B. fields: ['name', 'sub'] → name: 'Text'
if (cfg.fields?.length) for (const m of code.matchAll(new RegExp(String.raw`\b(?:${cfg.fields.join('|')}): ` + STR, 'g'))) add(unq(m[1]));
// weitere Muster im Code bzw. in anderen Dateien (z. B. Fehlertexte eines Servers)
for (const re of cfg.patterns || []) for (const m of code.matchAll(re)) add(unq(m[1]));
for (const { file, pattern } of cfg.sources || []) {
  const p = path.join(root, file);
  if (fs.existsSync(p)) for (const m of fs.readFileSync(p, 'utf8').matchAll(pattern)) add(unq(m[1]));
}
(cfg.add || []).forEach(add);
// Gemeinsames Profil (js/profile.js): Avatar-Fenster – Titel t('…') und Gruppennamen ['Tiere', [ … ]]
{
  const p = path.join(root, 'js', 'profile.js');
  if (fs.existsSync(p)) { const s = fs.readFileSync(p, 'utf8'); for (const m of s.matchAll(/\bt\('([^']+)'\)/g)) add(m[1]); for (const m of s.matchAll(/\['([^']+)', \[/g)) add(m[1]); }
}

// keine Übersetzung nötig: Adressen, Code-Kürzel, Eigennamen
for (const k of [...keys]) if (/^(https?:|#)/.test(k) || (cfg.skip && cfg.skip.test(k))) keys.delete(k);
(cfg.ignore || []).forEach(k => keys.delete(k));
// Texte, die in manchen Sprachen gleich bleiben, aber trotzdem je Sprache geprüft werden sollen
(cfg.keep || []).forEach(k => keys.add(k));

if (process.argv.includes('--keys')) { console.log(JSON.stringify([...keys].sort(), null, 1)); process.exit(0); }

/* ---------- Sprachdateien prüfen ---------- */
const sandbox = { self: {} };
vm.createContext(sandbox);
const langDir = path.join(root, 'js', 'lang');
for (const f of fs.readdirSync(langDir).filter(f => f.endsWith('.js'))) vm.runInContext(fs.readFileSync(path.join(langDir, f), 'utf8'), sandbox, { filename: f });
const packs = sandbox.self.LANG_PACKS || {};
const vars = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
const runtime = new Set(cfg.runtime || []);                    // entstehen zur Laufzeit – nicht als „unbenutzt“ melden
let problems = 0;
for (const [lc, p] of Object.entries(packs)) {
  const have = Object.keys(p.dict);
  const missing = [...keys].filter(k => !Object.hasOwn(p.dict, k));
  const extra = have.filter(k => !keys.has(k) && !runtime.has(k));
  const badVars = have.filter(k => keys.has(k) && vars(p.dict[k]) !== vars(k));
  console.log(`\n${lc} (${p.flag} ${p.name}): ${have.length - extra.length} von ${keys.size} übersetzt`);
  if (missing.length) { console.log(`  fehlt (${missing.length}):`); missing.forEach(k => console.log('    - ' + JSON.stringify(k))); }
  if (extra.length) { console.log(`  nicht mehr benutzt (${extra.length}):`); extra.forEach(k => console.log('    - ' + JSON.stringify(k))); }
  if (badVars.length) { console.log('  Platzhalter passen nicht ({n} usw.):'); badVars.forEach(k => console.log('    - ' + JSON.stringify(k))); }
  problems += missing.length + badVars.length;
}
console.log(problems ? `\n${problems} Punkt(e) offen.` : `\nAlles vollständig (${Object.keys(packs).length + 1} Sprachen, ${keys.size} Texte).`);
process.exit(problems ? 1 : 0);
