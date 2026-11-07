// Spieleabend – Sprachen (gleiches System wie Musik-Bingo und Needle Drop)
// Texte stehen auf Deutsch; tx('Text') liefert die Übersetzung, feste Texte in index.html übersetzt translatePage().
// Alle Spiele liegen unter ku3rb1s.github.io und teilen sich den Browser-Speicher – die Sprache wird darum
// für alle gesetzt: hub.lang (hier), mq.lang (Needle Drop), mb_lang (Musik-Bingo).
'use strict';
const LANG_PACKS = self.LANG_PACKS || {};
const LANGS = { de: { name: 'Deutsch', flag: '🇩🇪' }, ...Object.fromEntries(Object.entries(LANG_PACKS).map(([k, p]) => [k, { name: p.name, flag: p.flag }])) };
const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

let LANG = (() => {
  for (const k of ['hub.lang', 'mq.lang', 'mb_lang']) { const v = readJSON(k); if (LANGS[v]) return v; }
  for (const l of navigator.languages || [navigator.language || '']) { let k = String(l).slice(0, 2).toLowerCase(); if (k === 'no' || k === 'nn') k = 'nb'; if (LANGS[k]) return k; }
  return 'en';
})();
document.documentElement.lang = LANG;

function setLang(l) {
  if (!LANGS[l]) return;
  for (const k of ['hub.lang', 'mq.lang', 'mb_lang']) try { localStorage.setItem(k, JSON.stringify(l)); } catch {}
  LANG = l;
  document.documentElement.lang = l;
  translatePage();
  if (typeof self.liveLang === 'function') self.liveLang();
}

function tx(s, vars) {
  const d = LANG !== 'de' && LANG_PACKS[LANG]?.dict;
  let r = d && Object.hasOwn(d, s) ? d[s] : s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return r;
}
const langOptions = () => Object.entries(LANGS).map(([k, l]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${l.flag} ${l.name}</option>`).join('');

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
  for (const a of ['placeholder', 'aria-label', 'title']) {
    root.querySelectorAll('[' + a + ']').forEach(el => {
      el.__deAttr ??= {};
      const de = el.__deAttr[a] ?? el.getAttribute(a), out = Object.hasOwn(d, de) ? d[de] : de;
      if (out !== el.getAttribute(a)) { el.__deAttr[a] ??= de; el.setAttribute(a, out); }
    });
  }
}
translatePage();
