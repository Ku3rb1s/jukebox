// App-Modus: Zwischenspeicher (sw.js) anmelden und „Als App installieren“ anbieten (Knopf #btnInstall in den Einstellungen).
// Gleiche Datei in Musik-Bingo, Needle Drop und Jukebox.
// Wie eine App: kein Hineinzoomen durch Spreizen mit zwei Fingern (gesturestart = iPhone/iPad).
// Doppeltippen-Zoom verhindert touch-action:manipulation im CSS, ohne schnelle Doppel-Klicks auf Knöpfe zu verschlucken.
(() => {
  const stop = e => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
})();

// iPhone/iPad als App vom Home-Bildschirm: Die Statusleiste (Uhr, Akku) liegt über der Seite, der Abstand kommt aus
// env(safe-area-inset-top). iOS meldet ihn manchmal als 0 – vor allem nach einem Wechsel zu einem anderen Spiel
// innerhalb der App. Dann rutscht die Kopfzeile unter die Statusleiste. Nur in diesem Fall einen Ersatzwert setzen.
(() => {
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios || !(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches)) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
  const fix = () => {
    const root = document.documentElement;
    root.style.removeProperty('--sat');
    document.body.appendChild(probe);
    const env = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    if (env > 0) return;                                            // iOS meldet den Abstand richtig
    const phone = /iP(hone|od)/.test(navigator.userAgent);
    if (phone && innerWidth > innerHeight) return;                  // iPhone quer: keine Statusleiste
    const h = Math.max(screen.height, screen.width);
    // Höhe der Statusleiste: Dynamic Island 59, Notch 47, ältere iPhones 20, iPad 24
    root.style.setProperty('--sat', (!phone ? 24 : h >= 852 ? 59 : h >= 812 ? 47 : 20) + 'px');
  };
  fix();
  addEventListener('load', fix);
  addEventListener('pageshow', fix);
  addEventListener('resize', () => setTimeout(fix, 60));
})();

(() => {
  // Lokal (Testserver) kein Zwischenspeicher – sonst sieht man beim Entwickeln alte Dateien. Zum Testen: localStorage pwa.test = 1
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let test = false; try { test = localStorage.getItem('pwa.test') === '1'; } catch {}
  if ('serviceWorker' in navigator) {
    if (!local || test) navigator.serviceWorker.register('sw.js').catch(() => {});
    else {   // lokal: Reste früherer Tests entfernen
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
    }
  }

  const btn = document.getElementById('btnInstall'); if (!btn) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let prompt = null;   // Android/Chrome/Edge: Installations-Fenster des Browsers
  const show = on => btn.classList.toggle('hidden', standalone || !on);
  show(ios);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; show(true); });
  addEventListener('appinstalled', () => { prompt = null; show(false); });
  btn.addEventListener('click', async () => {
    if (prompt) {
      const p = prompt; prompt = null;
      try { await p.prompt(); await p.userChoice; } catch {}
      show(ios);   // abgelehnt: der Browser bietet es später von selbst wieder an
    } else if (ios) iosHelp();
  });

  // iPhone/iPad: Installieren geht nur über „Teilen“ → „Zum Home-Bildschirm“
  function iosHelp() {
    if (!document.getElementById('pwaCss')) document.head.insertAdjacentHTML('beforeend', `<style id="pwaCss">
      .pwa-help{background:rgba(var(--surf),.97);color:var(--text);border:0;border-radius:22px;padding:22px 20px 18px;width:min(340px,calc(100vw - 32px));box-shadow:0 30px 60px -10px #000}
      .pwa-help::backdrop{background:rgba(0,0,0,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
      .pwa-help h3{margin:0 0 12px;font-size:1.15rem;text-align:center}
      .pwa-help ol{margin:0;padding-left:1.3em;display:grid;gap:9px;line-height:1.35}
      .pwa-help .ic{width:1.15em;height:1.15em;vertical-align:-.2em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .pwa-help p{margin:14px 0 0;font-size:.85rem;color:var(--muted);line-height:1.35}
      .pwa-help button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:14px;font:inherit;font-weight:700;background:var(--accent,#1ed760);color:#000;cursor:pointer}
    </style>`);
    const share = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';
    const d = document.createElement('dialog');
    d.className = 'pwa-help';
    d.innerHTML = `<form method="dialog">
      <h3>${tx('Als App installieren')}</h3>
      <ol><li>${tx('Tippe auf „Teilen“')} ${share}</li><li>${tx('Wähle „Zum Home-Bildschirm“ – eventuell etwas nach unten scrollen.')}</li><li>${tx('Tippe auf „Hinzufügen“.')}</li></ol>
      <p>${tx('Die App speichert getrennt vom Browser: Einstellungen und Anmeldungen gibst du dort einmal neu ein.')}</p>
      <button>${tx('Verstanden')}</button></form>`;
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    document.body.appendChild(d);
    d.showModal();
  }
})();
