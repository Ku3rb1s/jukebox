/* Jukebox – Bestenliste (Server: worker/sync.js, Bereich /lb/). Eigenes Fenster, geöffnet über den Knopf oben (oder #bestenliste).
   Drei Wertungen:
   - Tages-Challenge: Needle Drop und Gold Record, heute bzw. diese Woche
   - Highscores: Allzeit-Rekorde aus Older or Newer und Gold Record (nur Songauswahl „Alle“, je Stufe/Modus – sonst nicht vergleichbar)
   - Serien: laufende Serie der Tages-Challenge (Needle Drop, Gold Record)
   - Anschauen kann jeder. Mitmachen ist freiwillig und braucht einen Code („Auf allen Geräten“) – fehlt er, wird er beim
     Mitmachen automatisch erstellt. Der Code ist das Konto, ohne E-Mail und Passwort.
   - Erst beim Mitmachen gehen Name, Emoji und Ergebnisse an den Server – und sind öffentlich.
   - Ergebnisse werden eingetragen, wenn die Jukebox geöffnet wird (aus dem Speicher der Spiele, wie die Karten).
   - Austreten oder „Code löschen“ entfernt Name und alle Werte beim Server. */
const Board = (() => {
  const API = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && store.get('hub.lbApi')) || 'https://jukebox-sync.ku3rb1s.workers.dev/lb/';
  const sheet = $('#lbSheet');

  /* ---------- Was aus den Spielen gelesen wird ---------- */
  // Tages-Challenge: Ergebnisse von heute und gestern (am Tag selbst gespielt, nicht nachgespielt)
  const DAILY_RESULTS = {
    'needle-drop': () => {
      const L = store.get('mq.daily') || {}, t = dayOf('Europe/Berlin');
      return [t, prevDay(t)].filter(d => L[d] && !L[d].late && Number.isInteger(L[d].score)).map(d => ({ day: d, score: L[d].score }));
    },
    'gold-record': () => {
      const t = dayOf();
      return [t, prevDay(t)].map(d => [d, store.get('gr.daily.' + d)]).filter(([, r]) => r?.done && !r.late && Number.isInteger(r.final))
        .map(([d, r]) => ({ day: d, score: r.final }));
    },
  };
  const todayOf = g => g === 'needle-drop' ? dayOf('Europe/Berlin') : dayOf();
  // Highscores: Kategorien je Spiel und woher der Rekord kommt
  const HIGH = {
    'older-or-newer': {
      opts: [['diff', { easy: 'Leicht', normal: 'Normal', hard: 'Schwer', pro: 'Profi' }], ['mode', { show: 'Mit Titel', blind: 'Nur hören' }]],
      key: c => `oon.best2.all.${c.diff}.${c.mode}`, cat: c => `${c.diff}.${c.mode}`,
      fmt: n => tx('{n} in Folge', { n: n.toLocaleString(LANG) }),
    },
    'gold-record': {
      opts: [['diff', { easy: 'Leicht', normal: 'Normal', hard: 'Schwer' }]],
      key: c => `gr.best.all.${c.diff}`, cat: c => c.diff,
      fmt: n => n + '/15',
    },
  };
  const combos = g => HIGH[g].opts.reduce((acc, [k, vals]) => acc.flatMap(c => Object.keys(vals).map(v => ({ ...c, [k]: v }))), [{}]);

  const VIEWS = {
    daily: { name: 'Tages-Challenge', icon: '📅', games: ['needle-drop', 'gold-record'] },
    high: { name: 'Highscores', icon: '🏆', games: ['older-or-newer', 'gold-record'] },
    streak: { name: 'Serien', icon: '🔥', games: ['needle-drop', 'gold-record'] },
  };
  const MEDAL = ['🥇', '🥈', '🥉'];

  /* ---------- Auswahl (gemerkt) ---------- */
  const sel = Object.assign({ view: 'daily', daily: 'needle-drop', high: 'older-or-newer', streak: 'needle-drop', range: 'day', diff: {}, mode: 'show' }, store.get('hub.lbSel') || {});
  if (!VIEWS[sel.view]) sel.view = 'daily';
  for (const v in VIEWS) if (!VIEWS[v].games.includes(sel[v])) sel[v] = VIEWS[v].games[0];
  if (!sel.diff || typeof sel.diff !== 'object') sel.diff = {};
  const keep = () => store.set('hub.lbSel', sel);
  const highCombo = g => {
    const c = {};
    for (const [k, vals] of HIGH[g].opts) {
      const cur = k === 'diff' ? sel.diff[g] : sel[k];
      c[k] = vals[cur] ? cur : (vals.normal ? 'normal' : Object.keys(vals)[0]);
    }
    return c;
  };

  let data = null, busy = false, joining = false, msg = '', fresh = false, loadedAt = 0, loadedFor = '', nameTimer = 0, sentAt = 0;
  const query = () => {
    const g = sel[sel.view];
    if (sel.view === 'high') return { game: g, kind: 'high', cat: HIGH[g].cat(highCombo(g)) };
    if (sel.view === 'streak') return { game: g, kind: 'streak' };
    return { game: g, range: sel.range };
  };

  /** Dieselbe Prüfsumme wie in sync.js – der Code selbst geht nie zum Server */
  let idCache = null;
  async function myId() {
    const s = Sync.status();
    if (!s.connected) return null;
    if (idCache?.code === s.code) return idCache.id;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('jukebox-sync-id|' + s.code));
    const id = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    idCache = { code: s.code, id };
    return id;
  }
  async function post(path, body) {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'http'), { status: r.status });
    return j;
  }
  // Lokal gemerkt (pro Code): mitgemacht? was schon gesendet wurde (sent: Tage, hs: Highscores, st: Serien)
  const blank = id => ({ id, on: false, sent: {}, hs: {}, st: {} });
  const mem = id => { const m = store.get('hub.lb'); return m && m.id === id ? { sent: {}, hs: {}, st: {}, ...m } : blank(id); };
  const remember = m => store.set('hub.lb', m);

  /** Alles Neue an den Server: Tagesergebnisse, höhere Rekorde, Serien (täglich, damit sie als „laufend“ gilt) */
  async function sendAll(id) {
    const m = mem(id), jobs = [];
    const scores = [];
    for (const [g, f] of Object.entries(DAILY_RESULTS)) for (const r of f()) if (m.sent[g + '|' + r.day] !== r.score) scores.push({ game: g, ...r });
    if (scores.length) jobs.push(post('score', { id, scores }).then(() => {
      for (const s of scores) m.sent[s.game + '|' + s.day] = s.score;
      m.sent = Object.fromEntries(Object.entries(m.sent).sort((a, b) => b[0].slice(-10).localeCompare(a[0].slice(-10))).slice(0, 12));
    }));
    const highs = [];
    for (const g in HIGH) for (const c of combos(g)) {
      const v = store.get(HIGH[g].key(c)), cat = HIGH[g].cat(c);
      if (Number.isInteger(v) && v > 0 && v > (m.hs[g + '|' + cat] || 0)) highs.push({ game: g, cat, score: v });
    }
    if (highs.length) jobs.push(post('high', { id, scores: highs }).then(() => { for (const h of highs) m.hs[h.game + '|' + h.cat] = h.score; }));
    const streaks = [], today = dayOf('Europe/Berlin');
    for (const g of VIEWS.streak.games) {
      const d = dailyOf(g); if (!d) continue;
      const last = m.st[g];
      if (!last || last[0] !== d.streak || last[1] !== today) streaks.push({ game: g, score: d.streak });
    }
    if (streaks.length) jobs.push(post('streak', { id, scores: streaks }).then(() => { for (const s of streaks) m.st[s.game] = [s.score, today]; }));
    await Promise.allSettled(jobs);
    remember(m);
    sentAt = Date.now();
  }

  async function load(force) {
    const key = JSON.stringify(query());
    if (busy || (!force && data && key === loadedFor && Date.now() - loadedAt < 30000)) return;
    const id = await myId();
    busy = true;
    try {
      let m = id ? mem(id) : null;
      if (m?.on) await sendAll(id);
      data = await post('list', id ? { id, ...query() } : query());
      if (id && data.joined !== m.on) {                 // auf einem anderen Gerät mitgemacht/ausgetreten
        m = data.joined ? { ...m, on: true } : blank(id); remember(m);
        if (data.joined) { await sendAll(id); data = await post('list', { id, ...query() }); }
      }
      loadedAt = Date.now(); loadedFor = key; if (!fresh) msg = '';
    } catch { if (loadedFor !== key) data = null; msg = tx('Die Bestenliste ist gerade nicht erreichbar.'); }
    busy = false;
    draw();
  }

  /** Mitmachen – ohne Code wird zuerst einer erstellt (ein Schritt für alle) */
  async function join() {
    const name = ($('#lbName')?.value || '').trim(), p = Profile.get();
    if (name.length < 2) { msg = tx('Bitte gib einen Namen mit mindestens 2 Zeichen ein.'); return draw(); }
    if (name !== p.name) { Profile.set({ name }); renderProfile(); }
    joining = true; msg = ''; draw();
    let created = false;
    try {
      if (!Sync.status().connected) { await Sync.create(); created = true; }
      const id = await myId();
      await post('join', { id, name, emoji: p.emoji });
      remember({ ...mem(id), on: true });
      fresh = created;
      msg = created ? tx('Du bist dabei! Dafür wurde dir ein persönlicher Code erstellt. Sichere ihn, damit du auf anderen Geräten weiterspielen kannst.') : tx('Du bist dabei!');
    } catch (e) {
      msg = e.message === 'limit' ? tx('Heute wurden über diesen Internetanschluss schon 3 Codes erstellt. Morgen geht es wieder – oder verbinde dich mit einem vorhandenen Code.')
        : e.message === 'name' ? tx('Dieser Name geht leider nicht. Bitte nimm einen anderen.') : tx('Die Bestenliste ist gerade nicht erreichbar.');
    }
    joining = false;
    renderSync();
    await load(true);
  }
  async function leave() {
    const id = await myId();
    if (!id) return;
    try { await post('leave', { id }); remember(blank(id)); }
    catch { msg = tx('Die Bestenliste ist gerade nicht erreichbar.'); return draw(); }
    fresh = false;
    await load(true);
    msg = tx('Du bist ausgetreten. Name und Punkte sind gelöscht.'); draw();
  }
  /** Profil geändert (hier oder auf einem anderen Gerät): Name in der Bestenliste mitziehen */
  function profileChanged() {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(async () => {
      const id = await myId(), p = Profile.get();
      if (!id || !mem(id).on || (p.name || '').trim().length < 2) return;
      try { await post('join', { id, name: p.name, emoji: p.emoji }); if (sheet.open) load(true); }
      catch (e) { if (e.message === 'name') { msg = tx('Dieser Name geht leider nicht. Bitte nimm einen anderen.'); draw(); } }
    }, 1500);
  }

  /* ---------- Anzeige ---------- */
  function draw() {
    const box = $('#lb');
    if (!DATA) return;
    const app = id => DATA.apps.find(a => a.id === id) || { name: id, color: '#888' };
    const view = sel.view, g = sel[view], a = app(g), p = Profile.get(), week = view === 'daily' && sel.range === 'week';
    const joined = !!data?.joined, st = Sync.status();
    const needSave = joined && st.connected && !codeSaved(st.code);   // Erinnerung bleibt, bis der Code gesichert ist
    const fmt = n => view === 'high' ? HIGH[g].fmt(n)
      : view === 'streak' ? (n === 1 ? tx('1 Tag') : tx('{n} Tage', { n }))
      : g === 'needle-drop' ? n.toLocaleString(LANG) + ' ' + tx('Pkt.') : week ? tx('{n} Stufen', { n }) : n + '/15';
    const seg = (items, cur, attr, cls = '') => `<div class="seg lb-seg ${cls}">${Object.entries(items).map(([k, v]) => `<button class="${k === cur ? 'on' : ''}" ${attr}="${k}">${v}</button>`).join('')}</div>`;

    // Kopf: Wertung, Spiel, Optionen
    let opts = '';
    if (view === 'daily') opts = seg({ day: tx('Heute'), week: tx('Diese Woche') }, sel.range, 'data-lb-range');
    if (view === 'high') { const c = highCombo(g); opts = HIGH[g].opts.map(([k, vals]) => seg(Object.fromEntries(Object.entries(vals).map(([x, y]) => [x, tx(y)])), c[k], 'data-lb-' + k)).join(''); }
    const hint = view === 'high' ? tx('Gewertet wird dein Rekord mit der Songauswahl „Alle“.')
      : view === 'streak' ? tx('Tage in Folge mit gespielter Tages-Challenge.') : '';

    // Liste: Treppchen für die ersten drei, danach Zeilen
    const top = data?.top || [];
    const pod = (r, place) => r ? `<div class="pod p${place}${r.me ? ' me' : ''}">
        <div class="pod-emo">${esc(r.emoji)}<span class="pod-medal">${MEDAL[r.rank - 1] || r.rank}</span></div>
        <div class="pod-name" data-no-tx>${esc(r.name)}</div><div class="pod-score">${esc(fmt(r.score))}</div>
        <div class="pod-step"><span>${r.rank}</span></div></div>` : `<div class="pod p${place} empty"><div class="pod-step"></div></div>`;
    const row = r => `<div class="lb-row${r.me ? ' me' : ''}"><span class="lb-rank">${r.rank}</span>
      <span class="lb-emo">${esc(r.emoji)}</span>
      <span class="lb-name"><span class="lb-n" data-no-tx>${esc(r.name)}</span>${week && r.days > 1 ? `<small>${tx('{n} Tage', { n: r.days })}</small>` : ''}</span>
      <b class="lb-score">${esc(fmt(r.score))}</b></div>`;
    const empty = view === 'high' ? tx('Noch keine Rekorde in dieser Wertung.') : view === 'streak' ? tx('Gerade hat niemand eine laufende Serie.')
      : week ? tx('Diese Woche hat noch niemand gespielt.') : tx('Heute hat noch niemand gespielt.');
    let body;
    if (!data) body = `<div class="lb-empty">${busy || !msg ? `<span class="lb-spin"></span>${tx('Lade …')}` : esc(msg)}</div>`;
    else if (!top.length) body = `<div class="lb-empty"><span class="lb-big">${VIEWS[view].icon}</span>${empty}<br><a class="lb-link" href="${esc(a.url)}">${tx('Jetzt {g} spielen', { g: esc(a.name) })} →</a></div>`;
    else body = `<div class="lb-podium">${pod(top[1], 2)}${pod(top[0], 1)}${pod(top[2], 3)}</div>`
      + (top.length > 3 || data.me ? `<div class="lb-list">${top.slice(3).map(row).join('')}${data.me ? `<div class="lb-gap">⋯</div>${row(data.me)}` : ''}</div>` : '');

    // Unten fest: dein Platz – oder Mitmachen
    let bar = '';
    if (data && joined) {
      const mine = top.find(r => r.me) || data.me;
      const where = mine ? `<b>${tx('Platz {r}', { r: mine.rank })}</b> <span>${tx('von {n}', { n: data.n })}</span>`
        : view === 'daily' ? `<span>${week ? tx('Diese Woche noch kein Ergebnis') : tx('Heute noch kein Ergebnis')}</span>`
        : view === 'high' ? `<span>${tx('Noch kein Rekord in dieser Wertung')}</span>` : `<span>${tx('Gerade keine laufende Serie')}</span>`;
      const go = !mine || (view === 'daily' && !week && !DAILY_RESULTS[g]?.().some(r => r.day === todayOf(g)));
      bar = `<div class="lb-me"><span class="lb-emo big">${esc(p.emoji)}</span>
        <span class="lb-me-t"><span class="lb-me-n" data-no-tx>${esc(p.name || '')}</span><span class="lb-me-w">${where}</span></span>
        ${mine ? `<b class="lb-me-s">${esc(fmt(mine.score))}</b>` : ''}${go ? `<a class="lb-me-go" href="${esc(a.url)}">▶ ${tx('Spielen')}</a>` : ''}</div>`;
    } else if (data) {
      bar = `<div class="lb-me join"><p>${tx('Mach mit! Dein Name, deine Rekorde und deine Punkte der Tages-Challenges sind dann für alle sichtbar – ohne E-Mail und Passwort.')}</p>
        <div class="lb-form"><button class="lb-emo big lb-emo-btn" id="lbEmoji" type="button" aria-label="${tx('Avatar wechseln')}">${esc(p.emoji)}</button>
          <input id="lbName" class="lb-input" maxlength="24" placeholder="${tx('Dein Name')}" value="${esc(p.name || '')}" autocomplete="nickname" enterkeyhint="go" data-no-tx>
          <button class="sync-go" id="lbJoin" ${joining ? 'disabled' : ''}>${joining ? '…' : tx('Mitmachen')}</button></div></div>`;
    }

    const views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, `<span class="lb-vi">${v.icon}</span>${tx(v.name)}`]));
    box.style.setProperty('--c', a.color || '#888');
    sheet.style.setProperty('--c', a.color || '#888');
    box.innerHTML = `
      <div class="lb-top">
        ${seg(views, view, 'data-lb-view', 'lb-views')}
        <div class="lb-games">${VIEWS[view].games.map(id => { const x = app(id); return `<button class="lb-game${id === g ? ' on' : ''}" data-lb-game="${id}" style="--c:${esc(x.color || '#888')}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : ''}<span>${esc(x.name)}</span></button>`; }).join('')}</div>
        ${opts}
        ${hint ? `<p class="lb-hint">${hint}</p>` : ''}
      </div>
      ${msg && data && !(fresh && needSave) ? `<div class="lb-msg${fresh ? ' ok' : ''}">${esc(msg)}</div>` : ''}
      ${needSave ? `<div class="lb-msg ok">${esc(fresh ? msg : tx('Dein Code ist noch nicht gesichert. Ohne ihn kommst du auf einem neuen Gerät nicht mehr an deine Daten.'))}<button class="lb-save" id="lbSave">${tx('Code sichern')} →</button></div>` : ''}
      <div class="lb-board">${body}</div>
      ${data ? `<div class="lb-foot">${tx('{n} Spieler', { n: data.n })}${joined ? ` · <button class="lb-leave" id="lbLeave"><span class="lbl">${tx('Austreten')}</span></button>` : ''}</div>` : ''}
      ${bar}`;

    const pick = fn => () => { fn(); keep(); data = null; msg = ''; fresh = false; draw(); load(true); };
    box.querySelectorAll('[data-lb-view]').forEach(b => b.onclick = pick(() => { sel.view = b.dataset.lbView; }));
    box.querySelectorAll('[data-lb-game]').forEach(b => b.onclick = pick(() => { sel[view] = b.dataset.lbGame; }));
    box.querySelectorAll('[data-lb-range]').forEach(b => b.onclick = pick(() => { sel.range = b.dataset.lbRange; }));
    box.querySelectorAll('[data-lb-diff]').forEach(b => b.onclick = pick(() => { sel.diff[g] = b.dataset.lbDiff; }));
    box.querySelectorAll('[data-lb-mode]').forEach(b => b.onclick = pick(() => { sel.mode = b.dataset.lbMode; }));
    if ($('#lbJoin')) {
      // Ohne Namen geht es nicht: Knopf erst aktiv, wenn mindestens 2 Zeichen eingetragen sind
      const ready = () => { $('#lbJoin').disabled = joining || $('#lbName').value.trim().length < 2; };
      $('#lbJoin').onclick = join; $('#lbName').oninput = ready; ready();
      $('#lbName').onkeydown = e => { if (e.key === 'Enter' && !$('#lbJoin').disabled) join(); };
    }
    if ($('#lbEmoji')) $('#lbEmoji').onclick = () => { const v = $('#lbName').value; Profile.pick(() => { renderProfile(); draw(); if ($('#lbName')) { $('#lbName').value = v; $('#lbName').dispatchEvent(new Event('input')); } }); };
    if ($('#lbLeave')) arm($('#lbLeave'), tx('Nochmal tippen zum Austreten'), leave);
    if ($('#lbSave')) $('#lbSave').onclick = () => { sheet.close(); fresh = false; msg = ''; $('#syncCta').click(); };
  }

  /* ---------- Fenster ---------- */
  function open() { if (!sheet.open) sheet.showModal(); draw(); load(); }
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

  /** Von außen: Seite neu gezeichnet, Code verbunden/getrennt, zurück aus einem Spiel.
      Fenster offen → neu zeichnen und laden; sonst nur neue Ergebnisse im Hintergrund eintragen. */
  async function refresh() {
    if (!Sync.status().connected) idCache = null;
    if (sheet.open) { if (document.activeElement?.id !== 'lbName') { draw(); load(); } return; }
    if (Date.now() - sentAt < 30000) return;
    const id = await myId();
    if (id && mem(id).on) sendAll(id).catch(() => {});
  }
  return { open, refresh, profileChanged };
})();
