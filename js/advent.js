/* Jukebox – Adventskalender: Karte auf der Startseite (1.11.–6.1., vor dem 1.12. mit Countdown) und Kalender mit 24 Türchen.
   Gespielt wird in On Tour (on-tour/?advent=7, Code in On-Tour/js/advent.js); zurück kommt man hierher (#advent).
   Stand aus dem Speicher von On Tour (gleiche Adresse ku3rb1s.github.io, abgeglichen über js/sync.js):
     ot.advent { "<Jahr>.<Tür>": Sterne } (0 = geöffnet ohne Stern) · ot.adventDay { "<Jahr>.<Tür>": 1 } (am Tag selbst – Serie)
   Symbol, Thema und Cover je Türchen: on-tour/data/advent-doors.json (On-Tour/scripts/build-advent.js).
   Test-Datum nur lokal: ?date=2026-12-07. Konzept: Konzepte/Adventskalender.md */
const AdventCal = (() => {
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const q = new URLSearchParams(location.search);
  const testDate = LOCAL && /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : null;
  const OT = '../on-tour/';
  const DOORS = 24, FINAL = 24, AVATARS = { 6: '🎅🏻', 12: '☃️', 18: '🧑‍🎄', 24: '🌠' };
  // Reihenfolge im Kalender: wild verteilt wie bei einem echten Adventskalender (4 Spalten; 24 = 2×2, wide = 2×1, tall = 1×2)
  const ORDER = [7, 15, 2, 19, 6, 11, 22, 9, 13, 1, 17, 24, 4, 20, 3, 14, 10, 23, 5, 18, 8, 12, 16, 21];
  const WIDE = new Set([6, 13, 20]), TALL = new Set([10, 17]);
  const COLORS = ['#b91c1c', '#15803d', '#b45309', '#1e3a8a', '#9d174d', '#0f766e'];
  const pad = n => String(n).padStart(2, '0');
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const today = () => testDate || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  // Saison (Jahr des Dezembers): 1.11.–6.1. – sonst null; lastYear: ohne Saison die letzte (für den Kalender über #advent)
  function season(d = today()) { const [y, m, day] = d.split('-').map(Number); return m >= 11 ? y : m === 1 && day <= 6 ? y - 1 : null; }
  const lastYear = () => season() ?? +today().slice(0, 4) - 1;
  const doorDate = (Y, n) => `${Y}-12-${pad(n)}`;
  const isOpen = (Y, n, d = today()) => d >= doorDate(Y, n) && d <= `${Y + 1}-01-06`;
  const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const withDate = u => testDate ? u + (u.includes('?') ? '&' : '?') + 'date=' + testDate : u;
  const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Stand einer Saison: Sterne je Tür (null = nicht geöffnet), Summe, Serie (läuft bis heute/gestern) und längste Serie */
  function state(Y) {
    const m = get('ot.advent') || {}, dm = get('ot.adventDay') || {}, d = today();
    const stars = Array.from({ length: DOORS + 1 }, (_, n) => n && m[`${Y}.${n}`] != null ? +m[`${Y}.${n}`] || 0 : null);
    const on = n => !!dm[`${Y}.${n}`];
    const dn = d.slice(0, 7) === `${Y}-12` ? Math.min(+d.slice(8), DOORS) : d > `${Y}-12-24` ? DOORS : 0;
    let cur = 0, n = on(dn) ? dn : dn - 1;
    if (d <= `${Y}-12-24` || on(dn)) while (n >= 1 && on(n)) { cur++; n--; }
    let best = 0, run = 0; for (let k = 1; k <= DOORS; k++) { run = on(k) ? run + 1 : 0; best = Math.max(best, run); }
    const done = stars.filter(x => x != null).length;
    return { stars, done, total: stars.reduce((a, b) => a + (b || 0), 0), cur, best, todayDoor: dn && d.slice(0, 7) === `${Y}-12` && +d.slice(8) <= DOORS ? dn : 0 };
  }
  let META = null;
  const loadMeta = () => META ||= fetch(OT + 'data/advent-doors.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => j?.doors || {}).catch(() => (META = null, {}));
  const cover = (c, size = 250) => !c ? '' : c.startsWith('mb:') ? `https://coverartarchive.org/release-group/${c.slice(3)}/front-250` : `https://e-cdns-images.dzcdn.net/images/cover/${c}/${size}x${size}-000000-80-0-0.jpg`;

  /* ---------- Karte auf der Startseite ---------- */
  function renderCard() {
    const box = $('#advCard'), Y = season();
    if (!box) return;
    box.classList.toggle('hidden', Y == null);
    if (Y == null) return;
    const d = today(), s = state(Y), n = s.todayDoor;
    let title = tx('Adventskalender'), sub;
    if (d < `${Y}-12-01`) { const k = daysTo(d, `${Y}-12-01`); sub = k === 1 ? tx('Morgen öffnet sich das erste Türchen') : tx('Noch {n} Tage bis zum ersten Türchen', { n: k }); }
    else if (n && s.stars[n] == null) sub = tx('Türchen {n} ist offen', { n });
    else if (n && n < DOORS) sub = tx('Morgen wartet Türchen {n}', { n: n + 1 });
    else if (s.done >= DOORS) sub = tx('Alle 24 Türchen geöffnet – frohe Weihnachten!');
    else if (n === DOORS) sub = tx('Frohe Weihnachten! Verpasste Türchen kannst du bis 6. Januar nachholen.');
    else sub = tx('Verpasste Türchen nachholen – noch bis 6. Januar ({n} offen)', { n: DOORS - s.done });
    const due = d >= `${Y}-12-01` && n && s.stars[n] == null;
    box.classList.toggle('due', !!due);
    box.innerHTML = `<span class="adv-card-ic" aria-hidden="true">🎄</span><span class="grow"><b>${e(title)}</b><span class="sub">${e(sub)}</span></span>
      <span class="adv-card-st">${s.total ? `<span class="pill">⭐ ${s.total}</span>` : ''}${s.cur >= 2 ? `<span class="pill">🔥 ${s.cur}</span>` : ''}</span><svg class="ic chev"><use href="#i-chev"/></svg>`;
  }

  /* ---------- Kalender ---------- */
  const sheet = () => $('#advSheet');
  async function render() {
    const Y = lastYear(), s = state(Y), d = today(), meta = await loadMeta();
    $('#advHead').innerHTML = `<div class="adv-h-k">${e(tx('Adventskalender {y}', { y: Y }))}</div>
      <div class="adv-h-st"><span class="pill">⭐ ${e(tx('{n} Sterne', { n: s.total }))}</span><span class="pill">🚪 ${e(tx('{n} von 24 Türchen', { n: s.done }))}</span>${s.cur ? `<span class="pill">🔥 ${e(tx('Serie {n}', { n: s.cur }))}</span>` : ''}</div>`;
    $('#advGrid').innerHTML = ORDER.map((n, k) => {
      const st = s.stars[n], open = isOpen(Y, n, d), played = st != null, isToday = n === s.todayDoor;
      const m = meta[n] || {}, img = played ? cover(m.c, n === FINAL ? 500 : 250) : '';
      const cls = ['door', played ? 'played' : open ? 'open' : 'shut', isToday && !played ? 'now' : '', n === FINAL ? 'big' : '', WIDE.has(n) ? 'wide' : '', TALL.has(n) ? 'tall' : '', open && !played && !isToday ? 'late' : ''].filter(Boolean).join(' ');
      const rot = ((n * 37) % 7 - 3) * .5;
      const starsHtml = played ? Array.from({ length: n === FINAL ? 4 : 3 }, (_, i) => `<i class="${i < st ? 'on' : ''}${i === 3 ? ' bonus' : ''}">★</i>`).join('') : '';
      const label = tx('Türchen {n}', { n }) + (played ? ' · ' + tx('{n} Sterne', { n: st }) : open ? '' : ' · ' + tx('noch zu'));
      return `<button class="${cls}" data-n="${n}" style="--c:${COLORS[(n * 5) % COLORS.length]};--r:${rot}deg" aria-label="${e(label)}">
        <span class="door-in">${img ? `<img src="${e(img)}" alt="" loading="lazy">` : ''}${played ? `<span class="door-no">${n}</span><span class="door-st">${starsHtml}</span>` : `<span class="door-gift">${e(m.i || '🎁')}</span>`}</span>
        <span class="flap"><b>${n}</b>${!played && AVATARS[n] ? '<i class="door-av" aria-hidden="true">🎁</i>' : ''}</span></button>`;
    }).join('');
    const avs = Object.entries(AVATARS).filter(([n]) => s.stars[n] == null).map(([, a]) => a);
    $('#advFoot').innerHTML = [
      d < `${Y}-12-01` ? tx('Ab dem 1. Dezember öffnet sich jeden Tag ein Türchen: eine kurze Musikrunde rund um Weihnachten und Winter – für alle dieselbe.') : '',
      tx('Sterne: 1 ab 3 richtigen, 2 ab 5, 3 bei allen 6. Verpasste Türchen lassen sich bis 6. Januar nachholen – dann zählen die Sterne, aber nicht die Serie.'),
      avs.length ? tx('Hinter den Türchen 6, 12, 18 und 24 warten Avatare, die es nur hier gibt.') : '',
    ].filter(Boolean).map(t => `<p>${e(t)}</p>`).join('');
  }
  let msgT = 0;
  function msg(t) { const m = $('#advMsg'); m.textContent = t; m.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => m.classList.remove('on'), 2600); }
  function tapDoor(btn) {
    const n = +btn.dataset.n, Y = lastYear();
    if (!isOpen(Y, n)) {
      const k = daysTo(today(), doorDate(Y, n));
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      return msg(k > 0 ? (k === 1 ? tx('Noch 1 Tag Geduld') : tx('Noch {n} Tage Geduld', { n: k })) : tx('Der Adventskalender ist vorbei.'));
    }
    const go = () => { location.href = withDate(OT + '?advent=' + n); };
    music.stop();
    if (reduced() || btn.classList.contains('played')) return go();
    btn.classList.add('opening');
    setTimeout(go, 650);
  }
  /* ---------- Spieluhr: „Jingle Bells“ (James Lord Pierpont, 1857 – gemeinfrei), im Browser erzeugt (Web Audio) ----------
     Läuft leise, solange der Kalender offen ist; Knopf oben links schaltet sie aus (gemerkt in hub.adventMusic, nur dieses Gerät).
     Ohne Tipp (zurück aus On Tour über #advent) darf der Browser noch keinen Ton spielen – dann startet sie beim ersten Tipp. */
  const music = (() => {
    // Noten „Name+Oktave:Länge“, Länge in Achteln (Viertel = 2): Strophe, dann Refrain
    const VERSE = 'G4:2 E5:2 D5:2 C5:2 G4:6 G4:1 G4:1 G4:2 E5:2 D5:2 C5:2 A4:8 A4:2 F5:2 E5:2 D5:2 B4:8 G5:2 G5:2 F5:2 D5:2 E5:8 '
      + 'G4:2 E5:2 D5:2 C5:2 G4:8 G4:2 E5:2 D5:2 C5:2 A4:6 A4:2 A4:2 F5:2 E5:2 D5:2 G5:2 G5:2 G5:2 G5:2 A5:2 G5:2 F5:2 D5:2 C5:4 G5:4';
    const CHORUS = 'E5:2 E5:2 E5:4 E5:2 E5:2 E5:4 E5:2 G5:2 C5:3 D5:1 E5:8 F5:2 F5:2 F5:3 F5:1 F5:2 E5:2 E5:2 E5:1 E5:1 E5:2 D5:2 D5:2 E5:2 D5:4 G5:4 '
      + 'E5:2 E5:2 E5:4 E5:2 E5:2 E5:4 E5:2 G5:2 C5:3 D5:1 E5:8 F5:2 F5:2 F5:3 F5:1 F5:2 E5:2 E5:2 E5:1 E5:1 G5:2 G5:2 F5:2 D5:2 C5:8';
    const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const NOTES = `${VERSE} ${CHORUS} ${CHORUS}`.trim().split(/\s+/).map(t => { const [n, l] = t.split(':'); return [12 * (+n[1] + 1) + SEMI[n[0]], +l]; });
    const EIGHTH = .24, PAUSE = 2.5;   // ruhiges Tempo; Pause zwischen den Durchgängen
    const KEY = 'hub.adventMusic';
    let ctx = null, out = null, timer = 0, at = 0, i = 0, playing = false;
    const on = () => get(KEY) !== false;
    function setup() {
      if (ctx) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain(); out.gain.value = 0;
      // leises Echo wie in einem Raum
      const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
      dl.delayTime.value = .27; fb.gain.value = .28; lp.type = 'lowpass'; lp.frequency.value = 2600;
      out.connect(ctx.destination); out.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(ctx.destination);
    }
    // ein Spieluhr-Ton: Grundton + leise Obertöne, kurzer Anschlag, langes Ausklingen
    function bell(midi, t) {
      const f = 440 * 2 ** ((midi - 69) / 12);
      for (const [mul, vol, dec] of [[1, .55, 1.4], [2, .18, .7], [3.01, .07, .35]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * mul;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dec);
        o.connect(g).connect(out); o.start(t); o.stop(t + dec + .05);
      }
    }
    function tick() {
      while (at < ctx.currentTime + 1.2) {   // immer gut eine Sekunde im Voraus planen
        const [m, l] = NOTES[i];
        bell(m, at); at += l * EIGHTH;
        if (++i >= NOTES.length) { i = 0; at += PAUSE; }
      }
      timer = setTimeout(tick, 250);
    }
    function start() {
      if (!on() || playing) return;
      try { setup(); } catch { return; }
      ctx.resume?.().catch(() => {});
      playing = true; i = 0; at = ctx.currentTime + .15;
      out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setValueAtTime(out.gain.value, ctx.currentTime); out.gain.linearRampToValueAtTime(.09, ctx.currentTime + .6);
      clearTimeout(timer); tick();
    }
    function stop() {
      if (!playing) return;
      playing = false; clearTimeout(timer);
      const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + .4);
      setTimeout(() => { if (!playing) ctx.suspend?.().catch(() => {}); }, 600);
    }
    const unlock = () => { if (playing && ctx?.state === 'suspended') ctx.resume().catch(() => {}); };
    function paint() {
      const b = $('#advMusic'); if (!b) return;
      b.textContent = on() ? '🔔' : '🔕';
      b.setAttribute('aria-pressed', String(on()));
      b.setAttribute('aria-label', on() ? tx('Musik ausschalten') : tx('Musik einschalten'));
      b.title = b.getAttribute('aria-label');
    }
    function toggle() { try { localStorage.setItem(KEY, JSON.stringify(!on())); } catch {} paint(); on() ? start() : stop(); }
    return { start, stop, unlock, paint, toggle };
  })();

  async function open() {
    const d = sheet();
    if (!d.open) d.showModal();
    snow.start();
    music.paint(); music.start();
    await render();   // Raster entsteht erst nach dem Laden von advent-doors.json
    // heutiges Türchen sichtbar machen
    // im Fenster selbst rechnen: es fährt beim Öffnen noch herein (scrollIntoView würde die Zwischenposition nehmen)
    const toNow = () => {
      const b = d.querySelector('.door.now'), body = d.querySelector('.sheet-body'); if (!b || body.scrollTop) return;
      const off = b.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTop = Math.max(0, off - body.clientHeight / 2 + b.offsetHeight / 2);
    };
    toNow(); setTimeout(toNow, 350);   // nochmal nach dem Hereinfahren
  }

  /* ---------- Schneefall (aus bei „Bewegung reduzieren“) ---------- */
  const snow = (() => {
    let raf = 0, flakes = [], cv, x, w, h;
    function size() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function frame() {
      x.clearRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,.75)';
      for (const f of flakes) {
        f.y += f.v; f.x += Math.sin((f.y + f.p) / 40) * .35;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        x.globalAlpha = f.a; x.beginPath(); x.arc(f.x, f.y, f.r, 0, 7); x.fill();
      }
      x.globalAlpha = 1;
      raf = sheet().open ? requestAnimationFrame(frame) : 0;
    }
    return {
      start() {
        cv = $('#advSnow'); if (!cv || raf) return;
        if (reduced()) { cv.classList.add('hidden'); return; }
        cv.classList.remove('hidden'); x = cv.getContext('2d'); size();
        flakes = Array.from({ length: Math.round(Math.min(90, w * h / 9000)) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: .8 + Math.random() * 2.2, v: .25 + Math.random() * .8, a: .35 + Math.random() * .6, p: Math.random() * 300 }));
        raf = requestAnimationFrame(frame);
      },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      size() { if (cv && raf) size(); },
    };
  })();

  function init() {
    const d = sheet(); if (!d) return;
    d.addEventListener('pointerdown', () => music.unlock());   // Ton erst nach einem Tipp (Browser-Regel)
    d.addEventListener('click', ev => {
      if (ev.target.closest('#advMusic')) return music.toggle();
      const b = ev.target.closest('.door'); if (b) return tapDoor(b);
      if (ev.target === d || ev.target.closest('[data-close]')) d.close();
    });
    // Seite verlassen (Türchen öffnet On Tour, App im Hintergrund): Musik aus; zurück: wieder an
    document.addEventListener('visibilitychange', () => { if (document.hidden) music.stop(); else if (d.open) music.start(); });
    addEventListener('pagehide', () => music.stop());
    d.addEventListener('close', () => { snow.stop(); music.stop(); if (location.hash === '#advent') history.replaceState(null, '', location.pathname + location.search); });
    addEventListener('resize', () => snow.size());
    $('#advCard').onclick = ev => { ev.preventDefault(); open(); };
    // zurück aus On Tour (…/jukebox/#advent): gleich den Kalender zeigen
    if (location.hash === '#advent') setTimeout(open, 120);
    // aus dem Zwischenspeicher des Browsers zurück: neu zeichnen
    addEventListener('pageshow', ev => { if (ev.persisted && d.open) { $$('.door.opening').forEach(b => b.classList.remove('opening')); render(); } });
  }
  return { init, renderCard, render, open, season, state };
})();
