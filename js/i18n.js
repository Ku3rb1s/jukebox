// Sprachen – gemeinsame Datei aller Jukebox-Spiele (Original: Spiele-Hub/shared/js/i18n.js, verteilt mit scripts/share.js)
// Alle Texte stehen im Code auf Deutsch. tx('Text') liefert die Übersetzung der gewählten Sprache (fehlt sie, bleibt es deutsch).
// Platzhalter: tx('Song {a} / {b}', { a: 1, b: 10 }). Feste Texte in index.html übersetzt translatePage() beim Laden.
//
// Alle Spiele liegen unter ku3rb1s.github.io und teilen sich den Browser-Speicher. Die Sprache gilt darum für alle:
// gespeichert wird sie unter mq.lang (Needle Drop und die neueren Spiele), hub.lang (Jukebox) und mb_lang (Musik-Bingo).
//
// Neue Sprache hinzufügen:
//   1. js/lang/en.js kopieren, z. B. nach js/lang/it.js, oben Kürzel, Name und Flagge ändern, die rechten Texte übersetzen
//   2. in index.html vor js/i18n.js eintragen: <script src="js/lang/it.js?v=…"></script>
//   3. prüfen, ob etwas fehlt (falls das Spiel es hat): node scripts/check-lang.js
// Neue Texte im Code: mit tx('Deutscher Text') schreiben und in jeder Sprachdatei ergänzen.
'use strict';

// Sprachdateien (js/lang/*.js) tragen sich hier ein: LANG_PACKS.en = { name, flag, dict }
const LANG_PACKS = self.LANG_PACKS || {};
const LANGS = { de: { name: 'Deutsch', flag: '🇩🇪' }, ...Object.fromEntries(Object.entries(LANG_PACKS).map(([k, p]) => [k, { name: p.name, flag: p.flag }])) };
const LANG_KEYS = ['mq.lang', 'hub.lang', 'mb_lang'];

// Gewählte Sprache (aus irgendeinem Spiel), sonst die des Geräts, sonst Englisch
let LANG = (() => {
  for (const k of LANG_KEYS) { try { const v = JSON.parse(localStorage.getItem(k)); if (LANGS[v]) return v; } catch {} }
  // Norwegisch: Geräte melden „nb“, „no“ oder „nn“ – alle bekommen die Bokmål-Übersetzung
  for (const l of navigator.languages || [navigator.language || '']) { let k = String(l).slice(0, 2).toLowerCase(); if (k === 'no' || k === 'nn') k = 'nb'; if (LANGS[k]) return k; }
  return LANGS.en ? 'en' : 'de';
})();
let curLang = LANG;
document.documentElement.lang = LANG;

// Sprache wechseln (für alle Spiele) – ohne Neuladen, wenn das Spiel self.liveLang anbietet (zeichnet alles neu)
function setLang(l) {
  if (!LANGS[l]) return;
  for (const k of LANG_KEYS) try { localStorage.setItem(k, JSON.stringify(l)); } catch {}
  LANG = curLang = l;
  document.documentElement.lang = l;
  translatePage();
  if (typeof self.liveLang === 'function') self.liveLang(); else location.reload();
}

function tx(s, vars) {
  const d = curLang !== 'de' && LANG_PACKS[curLang]?.dict;
  let r = d && Object.hasOwn(d, s) ? d[s] : s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return r;
}

// Auswahlliste der Sprachen (Einstellungen)
const langOptions = () => Object.entries(LANGS).map(([k, l]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${l.flag} ${l.name}</option>`).join('');

// Feste Texte und Attribute der Seite übersetzen. Der deutsche Originaltext wird beim ersten Übersetzen
// am Element gemerkt (__de) – so geht ein späterer Wechsel in jede Sprache (auch zurück).
function translatePage(root = document.body) {
  const d = LANG_PACKS[LANG]?.dict || {};
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.parentElement?.closest('script,style,[data-no-tx]')) continue;
    const de = n.__de ?? n.nodeValue, s = de.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const out = Object.hasOwn(d, s) ? de.match(/^\s*/)[0] + d[s] + de.match(/\s*$/)[0] : de;
    if (out !== n.nodeValue) { n.__de ??= de; n.nodeValue = out; }
  }
  for (const a of ['placeholder', 'aria-label', 'title', 'data-title']) {
    root.querySelectorAll('[' + a + ']').forEach(el => {
      el.__deAttr ??= {};
      const de = el.__deAttr[a] ?? el.getAttribute(a), out = Object.hasOwn(d, de) ? d[de] : de;
      if (out !== el.getAttribute(a)) { el.__deAttr[a] ??= de; el.setAttribute(a, out); }
    });
  }
}
translatePage();
