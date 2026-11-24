// Umzug auf die eigene Domain (jukeboxquiz.de) – gemeinsame Datei aller Jukebox-Spiele (Original: Spiele-Hub/shared/js/umzug.js)
// Der Browser-Speicher (Profil, Rekorde, Einstellungen) gehört zur Adresse. Beim Umzug von ku3rb1s.github.io auf die neue
// Domain schickt der Service Worker der alten Adresse (sw.js, umzugSeite) den alten Speicher einmalig im #umzug=… mit.
// Diese Datei übernimmt ihn hier – sie muss als ERSTES Skript laden, bevor ein Spiel etwas in den Speicher schreibt.
// War der Speicher hier noch leer, wird alles übernommen; sonst nur, was hier noch fehlt (nichts Neueres überschreiben).
'use strict';
(() => {
  const m = /^#umzug=([uz])([\w-]*)(?:&h=(.*))?$/.exec(location.hash);
  if (!m) return;
  let fresh = true;
  try { fresh = localStorage.length === 0; } catch { return; }
  // Adresse sofort aufräumen (die Daten gehören nicht in Verlauf oder Lesezeichen), ursprüngliches #… wiederherstellen
  const hash = m[3] ? '#' + decodeURIComponent(m[3]) : '';
  history.replaceState(history.state, '', location.pathname + location.search + hash);
  const bytes = () => { const s = atob(m[2].replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  const take = json => {
    try {
      const d = JSON.parse(json);
      for (const k in d) if (typeof d[k] === 'string' && (fresh || localStorage.getItem(k) == null)) localStorage.setItem(k, d[k]);
      localStorage.setItem('jb.umzugIn', String(Date.now()));
      return true;
    } catch { return false; }
  };
  let b; try { b = bytes(); } catch { return; }                           // beschädigter Link: einfach ohne Umzug weiter
  if (m[1] === 'u') { take(new TextDecoder().decode(b)); return; }        // unkomprimiert: sofort, kein Neuladen nötig
  // komprimiert: Entpacken geht nur asynchron – danach neu laden, damit das Spiel mit dem übernommenen Stand startet
  self.UMZUG = new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
    .then(t => { if (take(t)) location.reload(); })
    .catch(() => {});
})();
