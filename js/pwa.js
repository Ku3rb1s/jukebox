// App-Modus: Zwischenspeicher (sw.js) anmelden und „Als App installieren“ anbieten (Knopf #btnInstall in den Einstellungen).
// Gleiche Datei in Musik-Bingo, Needle Drop und Jukebox.
// Wie eine App: kein Hineinzoomen durch Spreizen mit zwei Fingern (gesturestart = iPhone/iPad).
// Doppeltippen-Zoom verhindert touch-action:manipulation im CSS, ohne schnelle Doppel-Klicks auf Knöpfe zu verschlucken.
(() => {
  const stop = e => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
})();

// Fenster offen (dialog mit showModal) → Seite dahinter festhalten. Auf dem iPhone reicht overflow:hidden nicht: Safari scrollt
// sonst die Seite mit, wenn man über dem Fenster, am Rand oder auf dem abgedunkelten Hintergrund wischt.
// Darum wird body fest positioniert und beim Schließen wieder an dieselbe Stelle gescrollt. Gilt für alle Fenster, auch neue.
(() => {
  let y = null, pad = '';
  const anyOpen = () => { try { return !!document.querySelector('dialog:modal'); } catch { return !!document.querySelector('dialog[open]'); } };
  const update = () => {
    const b = document.body, open = anyOpen();
    if (!b) return;
    if (open && y === null) {
      y = scrollY; pad = b.style.paddingRight;
      const bar = innerWidth - document.documentElement.clientWidth;          // Bildlaufleiste am Computer: Platz halten, sonst springt die Seite
      if (bar > 0) b.style.paddingRight = (parseFloat(getComputedStyle(b).paddingRight) || 0) + bar + 'px';
      Object.assign(b.style, { position: 'fixed', top: -y + 'px', left: '0', right: '0', width: '100%' });
    } else if (!open && y !== null) {
      Object.assign(b.style, { position: '', top: '', left: '', right: '', width: '', paddingRight: pad });
      const to = y; y = null;
      scrollTo({ top: to, behavior: 'instant' });
    }
  };
  new MutationObserver(update).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
})();

// Fenster wie in iOS (Klasse .sheet, Rückfragen .alert/.ask):
// - Schließen mit Bewegung: auf dem Handy gleitet ein Fenster nach unten weg (es kam ja auch von unten), sonst blendet es kurz aus.
//   dialog.close() bleibt für die Spiele wie gewohnt: .open meldet sofort false, das echte Schließen (und das close-Ereignis)
//   folgt nach der Animation. Wird das Fenster währenddessen wieder geöffnet, bleibt es einfach offen.
//   Escape und <form method="dialog"> laufen ebenfalls über close().
// - Wegwischen: Fenster am Kopf – oder im Inhalt, wenn der ganz oben ist – nach unten ziehen. Es folgt dem Finger 1:1;
//   loslassen nach genug Weg oder mit Schwung schließt, sonst schnappt es zurück. Nach oben gibt es nur leicht nach (Gummiband).
// Bei „Bewegung reduzieren“ nur kurzes Ausblenden.
(() => {
  if (typeof HTMLDialogElement === 'undefined') return;
  const P = HTMLDialogElement.prototype, nativeClose = P.close, nativeModal = P.showModal;
  const mobile = () => matchMedia('(max-width:640px)').matches;
  const calm = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  const animated = d => d.matches('.sheet,.alert,.ask');
  const EASE = 'cubic-bezier(.32,.72,0,1)';                                         // iOS-Kurve für Fenster
  const closing = new WeakMap();                                                     // Fenster → laufende Schließ-Animation
  const now = new Map();                                                             // Fenster, das gerade wegfährt → sofort fertig schließen

  const finish = (d, value) => {
    closing.delete(d); now.delete(d); delete d.open;                                 // eigener open-Getter weg → wieder der echte
    d.classList.remove('closing'); d.style.transform = '';
    nativeClose.call(d, value);
  };
  P.close = function (value) {
    if (!this.open || closing.has(this) || !animated(this) || !this.isConnected) return closing.has(this) ? undefined : nativeClose.call(this, value);
    const slide = mobile() && this.classList.contains('sheet') && !calm();
    const from = this.style.transform || 'translateY(0)';
    const frames = slide ? [{ transform: from }, { transform: 'translateY(100%)' }]
      : calm() ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.97)' }];
    const dur = slide ? (this._flick || 280) : 160;
    const anim = this.animate(frames, { duration: dur, easing: slide ? EASE : 'ease-out', fill: 'forwards' });
    this._flick = 0;
    closing.set(this, anim);
    Object.defineProperty(this, 'open', { get: () => false, configurable: true });   // für die Spiele ist es schon zu
    this.classList.add('closing');
    const done = () => { if (closing.get(this) === anim) { finish(this, value); anim.cancel(); } };
    now.set(this, Object.assign(done, { t0: performance.now() }));
    anim.onfinish = done;
    setTimeout(done, dur + 120);              // falls die Animation ruht (Seite im Hintergrund)
  };
  P.showModal = function () {
    const anim = closing.get(this);
    if (anim) { closing.delete(this); now.delete(this); anim.cancel(); delete this.open; this.classList.remove('closing'); this.style.transform = ''; return; }
    return nativeModal.call(this);
  };
  // Tipp, während ein Fenster noch wegfährt: Bis zum Ende der Animation ist es technisch noch offen und sperrt die Seite
  // dahinter – der Tipp (z. B. auf die nächste Station) ginge verloren. Darum: Fenster sofort fertig schließen und den
  // Tipp an die Stelle weitergeben, auf die getippt wurde.
  document.addEventListener('click', e => {
    if (!now.size || !e.isTrusted || e.target.closest?.('dialog[open]:not(.closing)')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    // ganz kurz nach dem Schließen (Doppeltipp auf „Fertig“): nur schlucken – sonst träfe der zweite Tipp, was darunter liegt
    if ([...now.values()].some(done => performance.now() - done.t0 < 150)) return;
    for (const done of [...now.values()]) done();
    const { clientX: x, clientY: y } = e;
    setTimeout(() => document.elementFromPoint(x, y)?.click(), 0);              // nach dem Freigeben der Seite (Scroll-Position)
  }, true);
  // Escape: statt hartem Schließen dieselbe Animation
  document.addEventListener('cancel', e => { const d = e.target; if (d instanceof HTMLDialogElement && animated(d)) { e.preventDefault(); d.close(); } }, true);
  // <form method="dialog">: der Knopf schließt sonst ohne close()
  document.addEventListener('submit', e => {
    const f = e.target, d = f.closest?.('dialog');
    if (!d || !animated(d) || (e.submitter?.getAttribute('formmethod') || f.getAttribute('method') || '').toLowerCase() !== 'dialog') return;
    e.preventDefault(); d.close(e.submitter?.value ?? '');
  }, true);

  // ---- Wegwischen (nur Handy, nur .sheet) ----
  let g = null;
  const scroller = (el, sheet) => {                                                  // nächster scrollbarer Bereich im Fenster
    for (; el && el !== sheet; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
  };
  const rubber = (x, dim) => (x * dim * .55) / (dim + .55 * Math.abs(x));         // Gummiband: je weiter, desto weniger
  document.addEventListener('touchstart', e => {
    const sheet = e.target.closest?.('dialog.sheet');
    if (!sheet || e.touches.length > 1 || !mobile() || closing.has(sheet) || e.target.closest('input[type=range],[data-nodrag]')) { g = null; return; }
    const t = e.touches[0];
    g = { sheet, x0: t.clientX, y0: t.clientY, dy: 0, on: false, scr: scroller(e.target, sheet), hist: [[t.clientY, e.timeStamp]] };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!g) return;
    if (e.touches.length > 1) { reset(); return; }
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.on) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { g = null; return; }   // seitlich: nicht unseres
      if (dy < -10) { g = null; return; }                                           // nach oben: normal scrollen
      if (dy > 10) {
        if (g.scr && g.scr.scrollTop > 0) { g = null; return; }                     // Inhalt ist nicht oben: scrollen
        g.on = true; g.y0 = t.clientY;                                              // ab hier 1:1, ohne Sprung
        g.sheet.style.transition = 'none';
        document.activeElement?.blur?.();
      } else return;
    }
    e.preventDefault();
    const d = t.clientY - g.y0;
    g.dy = d > 0 ? d : rubber(d, g.sheet.offsetHeight);
    g.sheet.style.transform = `translateY(${g.dy}px)`;
    g.hist.push([t.clientY, e.timeStamp]); if (g.hist.length > 6) g.hist.shift();
  }, { passive: false });
  const reset = () => { if (g?.on) back(g.sheet); g = null; };
  const back = sheet => {
    const a = sheet.animate([{ transform: sheet.style.transform || 'none' }, { transform: 'translateY(0)' }], { duration: 300, easing: EASE });
    sheet.style.transform = '';
    a.onfinish = () => a.cancel();
  };
  const end = e => {
    if (!g) return;
    const { sheet, on, dy, hist } = g; g = null;
    if (!on) return;
    sheet.style.transition = '';
    const [y1, t1] = hist[0], [y2, t2] = hist[hist.length - 1];
    const v = t2 > t1 ? (y2 - y1) / (t2 - t1) : 0;                                   // px pro ms, positiv = nach unten
    // Schwung nach unten oder mehr als ein Viertel weg → schließen; Schwung nach oben bricht immer ab
    if (v > -0.1 && (dy > sheet.offsetHeight * .25 || v > 0.45)) {
      const rest = sheet.offsetHeight - dy;
      sheet._flick = Math.max(140, Math.min(300, v > 0 ? rest / (v * 1.6) : 280)); // mit Schwung schneller weg
      sheet.close();
    } else back(sheet);
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();

// Zahl hochzählen (Punkte am Rundenende): countUp(el, 1234, fmtN). Schnell am Anfang, sanft zum Schluss (unter 1 s).
// Ziffern bleiben gleich breit (tabular-nums), damit nichts wackelt. Bei „Bewegung reduzieren“ oder kleinen Zahlen sofort.
window.countUp = (el, to, fmt = String) => {
  if (!el) return;
  cancelAnimationFrame(el._cu || 0); clearTimeout(el._cuT);
  to = Math.round(+to || 0);
  el.style.fontVariantNumeric = 'tabular-nums';
  if (to <= 1 || matchMedia('(prefers-reduced-motion:reduce)').matches) { el.textContent = fmt(to); return; }
  const dur = Math.min(900, 350 + to * 40), t0 = performance.now();               // kleine Zahlen kürzer
  const step = now => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);          // ease-out
    el.textContent = fmt(Math.round(to * e));
    if (p < 1) el._cu = requestAnimationFrame(step);
  };
  el.textContent = fmt(0);
  el._cu = requestAnimationFrame(step);
  el._cuT = setTimeout(() => { cancelAnimationFrame(el._cu); el.textContent = fmt(to); }, dur + 150);   // falls rAF ruht (Seite im Hintergrund)
};

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

// Spiele-Menü: Logo (bzw. Spielname) oben lange gedrückt halten – oder Rechtsklick / Kontextmenü-Taste – öffnet ein kleines
// Menü: zurück zur Jukebox oder direkt in ein anderes Spiel. Ein normaler Tipp aufs Logo bleibt wie bisher (Startseite).
// Einmalig erscheint ein Hinweis darauf. Gilt in allen Spielen; in der Jukebox selbst nicht (dort ist man ja schon).
(() => {
  const HOME = 'https://ku3rb1s.github.io/';
  const GAMES = [
    ['Needle Drop', 'needle-drop/', 'icon-192.png?v=5'],
    ['Older or Newer', 'older-or-newer/', 'icon-192.png?v=4'],
    ['Gold Record', 'gold-record/', 'icon-192.png?v=2'],
    ['Hit or Miss', 'hit-or-miss/', 'icon-192.png?v=1'],
    ['On Tour', 'on-tour/', 'icon-192.png?v=2'],
    ['Musik-Bingo', 'musik-bingo-lobby/', 'icon-192.png'],
  ];
  const start = () => {
    if (document.getElementById('hubTitle')) return;                            // Jukebox selbst
    const logo = document.getElementById('logoBtn') || document.querySelector('header .logo');
    if (!logo) return;
    const here = GAMES.find(([name, path]) => location.pathname.includes('/' + path) || document.title.trim() === name)?.[0];
    const css = document.createElement('style');
    css.textContent = `
      #logoBtn,header .logo,#logoBtn img,header .logo img{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
      .jb-menu{position:fixed;z-index:9999;min-width:220px;padding:6px;border-radius:16px;background:rgba(24,24,30,.97);color:#fff;
        border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px -12px rgba(0,0,0,.7);font:600 .95rem/1.2 Outfit,system-ui,sans-serif;
        animation:jbIn .16s ease-out;transform-origin:top left}
      @keyframes jbIn{from{opacity:0;transform:scale(.94) translateY(-4px)}}
      .jb-menu a{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:11px;color:inherit;text-decoration:none}
      .jb-menu a:active,.jb-menu a:focus-visible{background:rgba(255,255,255,.1);outline:none}
      @media (hover:hover){.jb-menu a:hover{background:rgba(255,255,255,.08)}}
      .jb-menu img{width:26px;height:26px;border-radius:8px;flex:none}
      .jb-menu .jb-home{font-weight:800}
      .jb-menu .jb-home svg{width:26px;height:26px;flex:none}
      .jb-menu hr{border:0;border-top:1px solid rgba(255,255,255,.1);margin:5px 4px}
      .jb-menu .jb-here{opacity:.5;pointer-events:none}
      .jb-menu .jb-here::after{content:"✓";margin-left:auto}
      .jb-hint{position:fixed;z-index:9998;max-width:min(300px,calc(100vw - 24px));padding:10px 12px;border-radius:14px;background:rgba(24,24,30,.97);
        color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px -12px rgba(0,0,0,.7);font:500 .88rem/1.35 Outfit,system-ui,sans-serif;
        animation:jbIn .2s ease-out;transform-origin:top left}
      .jb-hint b{font-weight:800}`;
    document.head.appendChild(css);
    logo.querySelectorAll('img').forEach(i => i.draggable = false);

    let menu = null, hint = null;
    const close = () => { menu?.remove(); menu = null; removeEventListener('scroll', close, true); };
    const place = el => {                                                          // unter dem Logo, innerhalb des Bildschirms
      const r = logo.getBoundingClientRect();
      el.style.top = Math.round(r.bottom + 8) + 'px';
      el.style.left = Math.round(Math.max(12, Math.min(r.left, innerWidth - el.offsetWidth - 12))) + 'px';
    };
    function open() {
      if (menu) return close();
      hint?.remove(); hint = null;
      menu = document.createElement('nav');
      menu.className = 'jb-menu';
      menu.setAttribute('aria-label', tx('Spiele'));
      menu.innerHTML = `<a class="jb-home" href="${HOME}jukebox/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg>${tx('Zur Jukebox')}</a><hr>`
        + GAMES.map(([name, path, icon]) => `<a href="${HOME}${path}"${name === here ? ' class="jb-here" aria-current="page"' : ''}><img src="${HOME}${path}${icon}" alt="">${name}</a>`).join('');
      document.body.appendChild(menu);
      place(menu);
      menu.querySelector('a').focus({ preventScroll: true });
      setTimeout(() => addEventListener('scroll', close, true), 0);
      try { navigator.vibrate?.(12); } catch {}
    }
    // Lange drücken (Handy): nach 450 ms öffnen, den folgenden Tipp (Startseite) dann verschlucken
    let timer = 0, x0 = 0, y0 = 0, opened = false;
    logo.addEventListener('pointerdown', e => {
      if (e.button) return;
      x0 = e.clientX; y0 = e.clientY; opened = false;
      clearTimeout(timer); timer = setTimeout(() => { opened = true; open(); }, 450);
    });
    logo.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clearTimeout(timer); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) logo.addEventListener(ev, () => clearTimeout(timer));
    // Tipp nach langem Drücken verschlucken; ist das Menü offen, schließt ein Tipp aufs Logo nur das Menü
    logo.addEventListener('click', e => {
      if (opened || menu) { e.preventDefault(); e.stopImmediatePropagation(); if (!opened) close(); opened = false; }
    }, true);
    // Rechtsklick (Computer), langes Drücken unter Android, Kontextmenü-Taste
    logo.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(timer); if (!menu) { opened = true; open(); } });
    logo.addEventListener('keydown', e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); open(); } });
    document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target) && !logo.contains(e.target)) close(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu) { close(); logo.focus(); } });
    addEventListener('resize', close);

    // Einmaliger Hinweis (gilt für alle Spiele zusammen)
    let seen = false; try { seen = !!localStorage.getItem('jb.logoHint'); } catch {}
    if (!seen) setTimeout(() => {
      if (menu || document.querySelector('dialog[open]')) return;
      try { localStorage.setItem('jb.logoHint', '1'); } catch {}
      hint = document.createElement('div');
      hint.className = 'jb-hint'; hint.setAttribute('role', 'status');
      hint.innerHTML = tx('<b>Tipp:</b> Logo gedrückt halten – zur Jukebox und zu den anderen Spielen.');
      document.body.appendChild(hint); place(hint);
      const off = () => { hint?.remove(); hint = null; };
      setTimeout(off, 6000); document.addEventListener('pointerdown', off, { once: true, capture: true });
    }, 2500);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
