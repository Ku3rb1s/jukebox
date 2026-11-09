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
        ${capSvg(n, WIDE.has(n) || n === FINAL ? 2 : 1)}${n === FINAL && !played ? '<i class="door-bow" aria-hidden="true">🎀</i>' : ''}<span class="flap"><b>${n}</b>${!played && AVATARS[n] ? '<i class="door-av" aria-hidden="true">🎁</i>' : ''}</span></button>`;
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
  /* ---------- Musik: ruhige Weihnachtslieder am Klavier (echte Aufnahmen, 30-s-Ausschnitte von Deezer wie in den Spielen) ----------
     Auswahl aus der Deezer-Playlist „Christmas Calm Piano“ (Deezer-Redaktion, 6777052164): nur bekannte Weihnachtslieder.
     Los geht es mit „Jingle Bells“, danach gemischt; jeder Ausschnitt wird weich ein- und ausgeblendet. Leise (VOL).
     Läuft nur, solange der Kalender offen ist; Knopf oben links schaltet sie aus (gemerkt in hub.adventMusic, nur dieses Gerät).
     Ohne Tipp (zurück aus On Tour über #advent) darf der Browser noch keinen Ton spielen – dann startet sie beim ersten Tipp.
     Fehlt ein Stück bei Deezer, kommt einfach das nächste. */
  const music = (() => {
    const LIST = [
      [1132561982, 'Jingle Bells', 'Martèn LeGrand'], [1125777882, 'The Christmas Song', 'Stephan Moccio'],
      [22345441, 'It’s the Most Wonderful Time of the Year', 'Chad Lawson'], [2470078035, 'O Tannenbaum', 'Alexis Ffrench'],
      [1978028367, 'Last Christmas', 'Fabrizio Paterlini'], [1509354402, 'Deck the Halls', 'Belle Chen'],
      [1824043897, 'We Wish You a Merry Christmas', 'Belle Chen'], [425478032, 'White Christmas', 'Michael Forster'],
      [425478062, 'Let It Snow', 'Michael Forster'], [1129177012, 'Happy Xmas (War Is Over)', 'Alexis Ffrench'],
      [1922157607, 'Silent Night', 'John Crome'], [2944169791, 'Driving Home for Christmas', 'Lucas Johansson'],
      [1913087377, 'Silver Bells', 'Maurice Hofer'], [1125777982, 'O Holy Night', 'Stephan Moccio'],
      [1509475932, 'The Christmas Waltz', 'Chad Lawson'], [66597759, 'Tanz der Zuckerfee (Der Nussknacker)', 'Martha Argerich'],
      [1501979772, 'It’s Beginning to Look a Lot Like Christmas', 'Mila Crowell'],
    ];
    // Lautstärke: Regler 0–100 (hub.adventVol, nur dieses Gerät), 50 = leise Grundeinstellung
    const KEY = 'hub.adventMusic', VKEY = 'hub.adventVol', MAX = .44;
    const level = () => { const v = get(VKEY); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50; };
    const VOL = () => MAX * level() / 100;
    let order = [], k = -1, playing = false, run = 0, cbn = 0;
    const on = () => get(KEY) !== false;
    // Deezer-API ohne CORS → JSONP (wie js/deezer.js der Spiele); liefert jedes Mal einen frischen Vorschau-Link (laufen nach ca. 15 Minuten ab)
    const track = id => new Promise((res, rej) => {
      const cb = `__advdz${++cbn}`, s = document.createElement('script'), to = setTimeout(() => end(new Error('timeout')), 10000);
      const end = (err, d) => { clearTimeout(to); window[cb] = () => {}; s.remove(); err ? rej(err) : res(d); };
      window[cb] = d => d && !d.error && d.preview ? end(null, d) : end(new Error('dz'));
      s.onerror = () => end(new Error('net'));
      s.src = `https://api.deezer.com/track/${id}?output=jsonp&callback=${cb}`;
      document.head.appendChild(s);
    });
    function nowLine(s) { const b = $('#advNow'); if (!b) return; b.textContent = s ? `♪ ${s[1]} · ${s[2]}` : ''; b.classList.toggle('hidden', !s); }
    /* Zwei Spuren im Wechsel: Gegen Ende eines Ausschnitts setzt das nächste Stück auf der anderen Spur ein, beide werden
       XF Sekunden lang überblendet – gleich laut (Sinus/Kosinus, kein Loch in der Mitte) und wie im Radio: Das alte Stück
       wird beim Leiserwerden dumpfer (Tiefpass schließt), das neue öffnet sich von dumpf zu klar. Das nächste Stück wird
       vorab geladen (prep), damit die Überblendung ohne Wartezeit beginnt. Gesamtlautstärke über master (Regler).
       Ohne Web Audio: dieselben Lautstärke-Kurven über audio.volume (ohne Klangfilter). */
    const XF = 6, FIRST = 4, OUT = 1.2;   // Überblenden / erstes Einblenden / Ausblenden beim Schließen (Sekunden)
    const OPEN = 18000, DULL = 650;      // Tiefpass: offen / dumpf (Hz)
    let ctx = null, master = null, P = [], cur = 0;
    function mk() {
      const el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto';
      const p = { el, g: null, f: null, v: 0, iv: 0, out: false, ready: null };
      if (ctx) {
        p.g = ctx.createGain(); p.g.gain.value = 0;
        p.f = ctx.createBiquadFilter(); p.f.type = 'lowpass'; p.f.frequency.value = OPEN; p.f.Q.value = .5;
        ctx.createMediaElementSource(el).connect(p.f).connect(p.g).connect(master);
      }
      const done = () => { if (playing && p === P[cur] && !p.out) { p.out = true; next(); } };
      el.addEventListener('timeupdate', () => { if (el.duration && el.duration - el.currentTime < XF + .1) done(); });
      el.addEventListener('ended', done);
      el.addEventListener('error', () => { if (el.src && p === P[cur]) done(); });
      return p;
    }
    function setup() {
      if (P.length) return;
      // Web Audio: auf dem iPhone lässt sich audio.volume nicht ändern (die Vorschauen erlauben CORS)
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); } catch { ctx = master = null; }
      P = [mk(), mk()];
    }
    // Spur auf „to“ (0…1) blenden: hoch mit Sinus-, runter mit Kosinus-Kurve; dazu der Klang (hoch: öffnet, runter: wird dumpf)
    function ramp(p, to, sec) {
      clearInterval(p.iv);
      const shape = (from, x) => from + (to - from) * (to > from ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2));
      if (p.g) {
        const g = p.g.gain, t = ctx.currentTime, from = g.value, c = new Float32Array(48);
        for (let i = 0; i < 48; i++) c[i] = shape(from, i / 47);
        g.cancelScheduledValues(t);
        try { g.setValueCurveAtTime(c, t, sec); } catch { g.setValueAtTime(from, t); g.linearRampToValueAtTime(to, t + sec); }
        const fr = p.f.frequency; fr.cancelScheduledValues(t); fr.setValueAtTime(Math.max(60, fr.value), t);
        fr.exponentialRampToValueAtTime(to > from ? OPEN : DULL, t + sec * (to > from ? .85 : 1));
        p.v = to; return;
      }
      const from = p.v, t0 = performance.now();
      p.iv = setInterval(() => { const x = Math.min(1, (performance.now() - t0) / (sec * 1000)); p.v = shape(from, x); p.el.volume = Math.min(1, p.v * VOL()); if (x >= 1) clearInterval(p.iv); }, 50);
    }
    function setMaster(sec) {
      if (!master) return P.forEach(p => { p.el.volume = Math.min(1, p.v * VOL()); });
      const g = master.gain, t = ctx.currentTime, to = playing ? VOL() : 0;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      if (!sec) return g.setValueAtTime(to, t);
      // weich (S-Kurve) statt gerade
      const c = new Float32Array(32), from = g.value;
      for (let i = 0; i < 32; i++) c[i] = from + (to - from) * (1 - Math.cos(i / 31 * Math.PI)) / 2;
      try { g.setValueCurveAtTime(c, t, sec); } catch { g.linearRampToValueAtTime(to, t + sec); }
    }
    // nächstes Stück schon laden (auf der freien Spur), damit die nächste Überblendung sofort beginnt
    async function prep() {
      const my = run, s = order[(k + 1) % order.length], p = P[1 - cur];
      try {
        const t = await track(s[0]);
        if (my !== run || !playing || P[1 - cur] !== p || !p.el.paused) return;
        p.el.src = t.preview; p.el.load(); p.ready = s[0];
      } catch {}
    }
    async function next() {
      const my = ++run, old = P[cur], nx = P[1 - cur], first = !old.el.src || old.el.paused;
      k = (k + 1) % order.length;
      const s = order[k];
      try {
        if (nx.ready !== s[0]) { const t = await track(s[0]); if (my !== run || !playing) return; nx.el.src = t.preview; }
        nx.ready = null; nx.out = false; nx.el.currentTime = 0;
        if (nx.g) { nx.g.gain.cancelScheduledValues(0); nx.g.gain.value = 0; nx.f.frequency.cancelScheduledValues(0); nx.f.frequency.value = first ? 2500 : 1200; } else nx.el.volume = 0;
        nx.v = 0; cur = 1 - cur; nowLine(s);
        await nx.el.play();
        ramp(nx, 1, first ? FIRST : XF);
        if (!first) ramp(old, 0, XF);
        setTimeout(() => { if (my !== run || !playing) return; if (!first) old.el.pause(); prep(); }, (first ? 1 : XF) * 1000 + 300);
      } catch (e) {
        if (my !== run || !playing) return;
        if (e?.name === 'NotAllowedError') return;   // noch kein Tipp – unlock() startet beim ersten Tipp
        setTimeout(() => my === run && playing && next(), 400);   // Stück fehlt bei Deezer: das nächste
      }
    }
    function start() {
      if (!on() || playing) return;
      try { setup(); } catch { return; }
      ctx?.resume?.().catch(() => {});
      if (!order.length) order = [LIST[0], ...LIST.slice(1).map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1])];
      playing = true; setMaster(1);
      next();   // beim ersten Öffnen „Jingle Bells“, danach jeweils das nächste Stück
    }
    function stop() {
      if (!playing) return;
      playing = false; run++; nowLine(null);
      if (master) setMaster(OUT); else P.forEach(p => ramp(p, 0, OUT));
      setTimeout(() => { if (playing) return; P.forEach(p => { p.el.pause(); p.out = false; p.ready = null; }); ctx?.suspend?.().catch(() => {}); }, OUT * 1000 + 150);
    }
    // erster Tipp im Kalender: Ton freigeben, falls der Browser vorher nicht durfte
    function unlock() {
      if (!playing || !P.length) return;
      ctx?.resume?.().catch(() => {});
      const p = P[cur];
      if (p.el.paused && p.el.src) p.el.play().then(() => ramp(p, 1, FIRST)).catch(() => {});
    }
    function paint() {
      const b = $('#advMusic'); if (!b) return;
      b.textContent = on() ? '🔔' : '🔕';
      b.setAttribute('aria-pressed', String(on()));
      b.setAttribute('aria-label', on() ? tx('Musik ausschalten') : tx('Musik einschalten'));
      b.title = b.getAttribute('aria-label');
      const r = $('#advVol'); if (!r) return;
      r.value = level(); r.style.setProperty('--p', level() + '%'); r.setAttribute('aria-label', tx('Lautstärke')); r.title = tx('Lautstärke');
      r.closest('.adv-vol')?.classList.toggle('off', !on());
    }
    // Regler bewegt: sofort lauter/leiser (ohne Einblenden); bei ausgeschalteter Musik schaltet er sie wieder ein
    function setLevel(v) {
      try { localStorage.setItem(VKEY, JSON.stringify(+v)); } catch {}
      if (!on()) return toggle();
      paint();
      if (playing) setMaster(0);
    }
    function toggle() { try { localStorage.setItem(KEY, JSON.stringify(!on())); } catch {} paint(); on() ? start() : stop(); }
    return { start, stop, unlock, paint, toggle, setLevel };
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
    toNow(); setTimeout(toNow, 350);
    drawLights(); setTimeout(drawLights, 350);   // nach dem Hereinfahren hat die Kette ihre echte Breite   // nochmal nach dem Hereinfahren
  }

  /* ---------- Deko: Lichterkette und Schneehauben (SVG, aus festen Startwerten – sieht jedes Mal gleich aus) ---------- */
  const seeded = n => { let a = n * 2654435761 >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  /** Lichterkette als ein Stück: Kabel hängt zwischen Haken in Bögen durch, die Lämpchen sitzen mit Fassung auf dem Kabel
      und hängen passend zur Neigung. Neu gezeichnet bei jeder Breite (render, resize). */
  const BULBS = [['#ff4d4d', '#ffd0d0'], ['#ffc53d', '#fff1c2'], ['#3ddc84', '#d2ffe6'], ['#4dabff', '#d6ecff'], ['#ff7ad9', '#ffe0f6']];
  function drawLights() {
    const box = $('#advLights'); if (!box) return;
    const W = Math.round(box.clientWidth); if (!W || box.dataset.w === String(W)) return;
    box.dataset.w = W;
    const H = 44, top = 4, sag = 13, segs = Math.max(3, Math.round(W / 92)), sw = W / segs, per = 3;
    let wire = '', bulbs = '', defs = '', i = 0;
    BULBS.forEach(([c, hi], k) => { defs += `<radialGradient id="ab${k}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".85"/></radialGradient>`
      + `<radialGradient id="ag${k}"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset=".4" stop-color="${c}" stop-opacity=".25"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`; });
    for (let s = 0; s < segs; s++) {
      const x0 = s * sw, x1 = x0 + sw, cx = x0 + sw / 2, cy = top + 2 * sag;
      wire += `M${x0.toFixed(1)} ${top} Q${cx.toFixed(1)} ${cy} ${x1.toFixed(1)} ${top} `;
      for (let j = 1; j <= per; j++) {
        const t = j / (per + 1), x = x0 + t * sw, y = (1 - t) ** 2 * top + 2 * (1 - t) * t * cy + t * t * top;
        const ang = Math.atan2(4 * sag * (1 - 2 * t), sw) * 180 / Math.PI * .6;   // hängt etwas der Neigung nach
        const k = i % BULBS.length, d = (((i * 7) % 11) * .27).toFixed(2);
        bulbs += `<g transform="translate(${x.toFixed(1)} ${(y - .5).toFixed(1)}) rotate(${ang.toFixed(1)})">`
          + `<circle class="al-glow" style="animation-delay:${d}s" cx="0" cy="12" r="13" fill="url(#ag${k})"/>`
          + `<rect x="-2.7" y="-.6" width="5.4" height="5.8" rx="1.3" fill="#6f8a7b"/><rect x="-2.7" y="3.6" width="5.4" height="1.1" fill="#4d6457"/><rect x="-1.6" y="0" width="1.1" height="3.4" rx=".5" fill="#a9c0b3" opacity=".6"/>`
          + `<path class="al-bulb" style="animation-delay:${d}s" d="M0 5 C4.6 5 5 9.5 4.4 12.5 C3.8 15.8 1.8 18 0 18 C-1.8 18 -3.8 15.8 -4.4 12.5 C-5 9.5 -4.6 5 0 5Z" fill="url(#ab${k})"/></g>`;
        i++;
      }
    }
    const hooks = Array.from({ length: segs + 1 }, (_, s) => `<circle cx="${(s * sw).toFixed(1)}" cy="${top}" r="1.8" fill="#6f8a7b"/>`).join('');
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>${defs}</defs>`
      + `<path d="${wire}" fill="none" stroke="#587566" stroke-width="1.9" stroke-linecap="round"/>${hooks}${bulbs}</svg>`;
  }
  /** Schneehaube für ein Türchen: unregelmäßige, weiche Schneeschicht mit ein, zwei kleinen Nasen nach unten */
  function capSvg(n, span) {
    const R = seeded(n + 11), W = 100 * span, pts = [];
    const steps = 4 * span;
    for (let i = 0; i <= steps; i++) pts.push([i / steps * W, i === 0 || i === steps ? 7.5 : 1 + R() * 4.5]);
    let d = `M0 ${pts[0][1] + 4} `;
    for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; d += `Q${x0.toFixed(1)} ${(y0 - 3).toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2 - 1).toFixed(1)} `; }
    d += `L${W} ${pts[pts.length - 1][1] + 3} `;
    // Unterkante von rechts nach links, mit Nasen
    const drips = new Set(Array.from({ length: span === 2 ? 2 : 1 }, () => 0.15 + R() * .7));
    let x = W;
    const bottom = 11;
    d += `L${W - 2} ${bottom} `;
    for (const p of [...drips].sort((a, b) => b - a)) {
      const dx = p * W, wdt = 7 + R() * 5, depth = 4 + R() * 3.5;
      d += `L${(dx + wdt).toFixed(1)} ${bottom} C${(dx + wdt * .7).toFixed(1)} ${bottom} ${(dx + wdt * .75).toFixed(1)} ${(bottom + depth).toFixed(1)} ${dx.toFixed(1)} ${(bottom + depth).toFixed(1)} C${(dx - wdt * .75).toFixed(1)} ${(bottom + depth).toFixed(1)} ${(dx - wdt * .7).toFixed(1)} ${bottom} ${(dx - wdt).toFixed(1)} ${bottom} `;
      x = dx - wdt;
    }
    d += `L2 ${bottom} Z`;
    return `<svg class="cap" viewBox="-2 0 ${W + 4} 18" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="url(#capFill)"/><path d="${d}" fill="none" stroke="rgba(160,190,220,.55)" stroke-width=".8" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* ---------- Schneefall (aus bei „Bewegung reduzieren“) ----------
     Wie bei echtem Schnee vor einer Kamera: viele kleine, langsame Flocken hinten (scharf, blass), mittlere, und wenige große
     ganz vorne – unscharf und durchscheinend, weil sie außerhalb der Schärfe liegen. Tempo in Pixeln pro Sekunde (vorn schneller:
     Tiefe), jede Flocke schaukelt sanft für sich, dazu ein leichter, langsam wechselnder Wind. */
  const snow = (() => {
    let raf = 0, flakes = [], cv, x, w, h, sharp, soft, t0 = 0, last = 0;
    const LAYERS = [
      { n: .55, r: [.9, 1.6], v: [14, 24], a: [.4, .7], amp: [4, 9], img: 'sharp' },
      { n: .34, r: [1.6, 2.6], v: [26, 42], a: [.65, .95], amp: [8, 16], img: 'sharp' },
      { n: .11, r: [4, 8], v: [50, 72], a: [.22, .38], amp: [14, 26], img: 'soft' },
    ];
    const rnd = ([a, b]) => a + Math.random() * (b - a);
    // Flocke als weiche Scheibe: „sharp“ mit kurzem Rand, „soft“ (vorne, unscharf) mit langem Verlauf
    function disc(stops) {
      const c = document.createElement('canvas'), s = 64; c.width = c.height = s;
      const g = c.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
      g.fillStyle = gr; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 7); g.fill(); return c;
    }
    function size() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const flake = (L, y) => ({ L, x: Math.random() * w, y: y ?? Math.random() * h, r: rnd(L.r), v: rnd(L.v), a: rnd(L.a), amp: rnd(L.amp), fr: .5 + Math.random() * .9, p: Math.random() * 6.3 });
    function frame(now) {
      const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      const t = (now - t0) / 1000, wind = 6 * Math.sin(t / 9) + 3 * Math.sin(t / 3.7 + 1);   // px/s, langsame Böen
      x.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.v * dt;
        f.x += (wind * f.v / 40 + Math.cos(t * f.fr + f.p) * f.amp * .5) * dt;
        if (f.y > h + 10) Object.assign(f, flake(f.L, -10));
        if (f.x > w + 10) f.x = -10; else if (f.x < -10) f.x = w + 10;
        const d = f.r * 2;
        x.globalAlpha = f.a; x.drawImage(f.L.img === 'soft' ? soft : sharp, f.x - d / 2, f.y - d / 2, d, d);
      }
      x.globalAlpha = 1;
      raf = sheet().open ? requestAnimationFrame(frame) : 0;
    }
    return {
      start() {
        cv = $('#advSnow'); if (!cv || raf) return;
        if (reduced()) { cv.classList.add('hidden'); return; }
        cv.classList.remove('hidden'); x = cv.getContext('2d'); size();
        sharp ||= disc([[0, 1], [.55, .95], [.8, .45], [1, 0]]);
        soft ||= disc([[0, .7], [.35, .55], [.7, .2], [1, 0]]);
        const total = Math.round(Math.min(220, w * h / 2600));
        flakes = LAYERS.flatMap(L => Array.from({ length: Math.round(total * L.n) }, () => flake(L)));
        t0 = performance.now(); last = 0;
        raf = requestAnimationFrame(frame);
      },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      size() { if (cv && raf) size(); },
    };
  })();

  function init() {
    const d = sheet(); if (!d) return;
    d.addEventListener('pointerdown', () => music.unlock());
    $('#advVol')?.addEventListener('input', ev => music.setLevel(ev.target.value));   // Ton erst nach einem Tipp (Browser-Regel)
    d.addEventListener('click', ev => {
      if (ev.target.closest('#advMusic')) return music.toggle();
      const b = ev.target.closest('.door'); if (b) return tapDoor(b);
      // direkt aufräumen: das „close“-Ereignis kommt in manchen Browsern verzögert (wie in js/profile.js)
      if (ev.target === d || ev.target.closest('[data-close]')) { snow.stop(); music.stop(); d.close(); }
    });
    // Seite verlassen (Türchen öffnet On Tour, App im Hintergrund): Musik aus; zurück: wieder an
    document.addEventListener('visibilitychange', () => { if (document.hidden) music.stop(); else if (d.open) music.start(); });
    addEventListener('pagehide', () => music.stop());
    d.addEventListener('close', () => { snow.stop(); music.stop(); if (location.hash === '#advent') history.replaceState(null, '', location.pathname + location.search); });
    addEventListener('resize', () => { snow.size(); drawLights(); });
    $('#advCard').onclick = ev => { ev.preventDefault(); open(); };
    // zurück aus On Tour (…/jukebox/#advent): gleich den Kalender zeigen
    if (location.hash === '#advent') setTimeout(open, 120);
    // aus dem Zwischenspeicher des Browsers zurück: neu zeichnen
    addEventListener('pageshow', ev => { if (ev.persisted && d.open) { $$('.door.opening').forEach(b => b.classList.remove('opening')); render(); } });
  }
  return { init, renderCard, render, open, season, state };
})();
