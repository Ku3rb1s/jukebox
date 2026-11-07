/* Jukebox – Bestenliste (Server: worker/sync.js, Bereich /lb/).
   Drei Wertungen:
   - Tages-Challenge: Needle Drop und Gold Record, heute bzw. diese Woche
   - Highscores: Allzeit-Rekorde aus Older or Newer und Gold Record (nur Songauswahl „Alle“, je Stufe/Modus – sonst nicht vergleichbar)
   - Serien: laufende Serie der Tages-Challenge (Needle Drop, Gold Record)
   - Nur sichtbar mit Code („Auf allen Geräten“): der Code ist das Konto, ohne E-Mail und Passwort.
   - Mitmachen ist freiwillig. Erst dann gehen Name, Emoji und Ergebnisse an den Server – und sind öffentlich.
   - Ergebnisse werden eingetragen, wenn die Jukebox geöffnet wird (aus dem Speicher der Spiele, wie die Karten).
   - Austreten oder „Code löschen“ entfernt Name und alle Werte beim Server. */
const Board = (() => {
  const API = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && store.get('hub.lbApi')) || 'https://jukebox-sync.ku3rb1s.workers.dev/lb/';

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
    daily: { name: 'Tages-Challenge', games: ['needle-drop', 'gold-record'] },
    high: { name: 'Highscores', games: ['older-or-newer', 'gold-record'] },
    streak: { name: 'Serien', games: ['needle-drop', 'gold-record'] },
  };
  const MEDAL = ['🥇', '🥈', '🥉'];

  /* ---------- Auswahl (gemerkt) ---------- */
  const sel = Object.assign({ view: 'daily', daily: 'needle-drop', high: 'older-or-newer', streak: 'needle-drop', range: 'day', diff: {}, mode: 'show' }, store.get('hub.lbSel') || {});
  if (!VIEWS[sel.view]) sel.view = 'daily';
  for (const v in VIEWS) if (!VIEWS[v].games.includes(sel[v])) sel[v] = VIEWS[v].games[0];
  const keep = () => store.set('hub.lbSel', sel);
  const highCombo = g => {
    const c = {};
    for (const [k, vals] of HIGH[g].opts) {
      const cur = k === 'diff' ? sel.diff[g] : sel[k];
      c[k] = vals[cur] ? cur : (vals.normal ? 'normal' : Object.keys(vals)[0]);
    }
    return c;
  };

  let data = null, busy = false, msg = '', loadedAt = 0, loadedFor = '', nameTimer = 0;
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
  const mem = id => { const m = store.get('hub.lb'); return m && m.id === id ? { sent: {}, hs: {}, st: {}, ...m } : { id, on: false, sent: {}, hs: {}, st: {} }; };
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
  }

  async function load(force) {
    const key = JSON.stringify(query());
    if (busy || (!force && data && key === loadedFor && Date.now() - loadedAt < 30000)) return;
    const id = await myId();
    if (!id) return;
    busy = true;
    try {
      let m = mem(id);
      if (m.on) await sendAll(id);
      data = await post('list', { id, ...query() });
      if (data.joined !== m.on) {                       // auf einem anderen Gerät mitgemacht/ausgetreten
        m = data.joined ? { ...m, on: true } : { id, on: false, sent: {}, hs: {}, st: {} }; remember(m);
        if (data.joined) { await sendAll(id); data = await post('list', { id, ...query() }); }
      }
      loadedAt = Date.now(); loadedFor = key; msg = '';
    } catch { data = data && loadedFor === key ? data : null; msg = tx('Die Bestenliste ist gerade nicht erreichbar.'); }
    busy = false;
    draw();
  }

  async function join() {
    const id = await myId(), name = ($('#lbName')?.value || '').trim(), p = Profile.get();
    if (!id) return;
    if (name.length < 2) { msg = tx('Bitte gib einen Namen mit mindestens 2 Zeichen ein.'); return draw(); }
    if (name !== p.name) Profile.set({ name });
    busy = true; draw();
    try {
      await post('join', { id, name, emoji: p.emoji });
      remember({ ...mem(id), on: true });
      msg = ''; busy = false;
      renderProfile();
      return load(true);
    } catch (e) { msg = e.message === 'name' ? tx('Dieser Name geht leider nicht. Bitte nimm einen anderen.') : tx('Die Bestenliste ist gerade nicht erreichbar.'); }
    busy = false; draw();
  }
  async function leave() {
    const id = await myId();
    if (!id) return;
    try { await post('leave', { id }); remember({ id, on: false, sent: {}, hs: {}, st: {} }); }
    catch { msg = tx('Die Bestenliste ist gerade nicht erreichbar.'); return draw(); }
    await load(true);
    msg = tx('Du bist ausgetreten. Name und Punkte sind gelöscht.'); draw();
  }
  /** Profil geändert (hier oder auf einem anderen Gerät): Name in der Bestenliste mitziehen */
  function profileChanged() {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(async () => {
      const id = await myId(), p = Profile.get();
      if (!id || !mem(id).on || (p.name || '').trim().length < 2) return;
      try { await post('join', { id, name: p.name, emoji: p.emoji }); load(true); }
      catch (e) { if (e.message === 'name') { msg = tx('Dieser Name geht leider nicht. Bitte nimm einen anderen.'); draw(); } }
    }, 1500);
  }

  /* ---------- Anzeige ---------- */
  function draw() {
    const box = $('#lb');
    if (!Sync.status().connected || !DATA) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const app = id => DATA.apps.find(a => a.id === id) || { name: id, color: '#888' };
    const view = sel.view, g = sel[view], a = app(g), p = Profile.get(), week = view === 'daily' && sel.range === 'week';
    const joined = data ? data.joined : false;
    const fmt = n => view === 'high' ? HIGH[g].fmt(n)
      : view === 'streak' ? '🔥 ' + (n === 1 ? tx('1 Tag') : tx('{n} Tage', { n }))
      : g === 'needle-drop' ? n.toLocaleString(LANG) + ' ' + tx('Pkt.') : week ? tx('{n} Stufen', { n }) : n + '/15';
    const row = r => `<div class="lb-row${r.me ? ' me' : ''}"><span class="lb-rank">${r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</span>
      <span class="lb-name"><span class="lb-emo">${esc(r.emoji)}</span><span class="lb-n" data-no-tx>${esc(r.name)}</span>${week && r.days > 1 ? `<small>${tx('{n} Tage', { n: r.days })}</small>` : ''}</span>
      <b class="lb-score">${esc(fmt(r.score))}</b></div>`;
    const seg = (items, cur, attr) => `<div class="seg lb-seg">${Object.entries(items).map(([k, v]) => `<button class="${k === cur ? 'on' : ''}" ${attr}="${k}">${tx(v)}</button>`).join('')}</div>`;

    let opts = '';
    if (view === 'daily') opts = seg({ day: 'Heute', week: 'Diese Woche' }, sel.range, 'data-lb-range');
    if (view === 'high') { const c = highCombo(g); opts = HIGH[g].opts.map(([k, vals]) => seg(vals, c[k], 'data-lb-' + k)).join(''); }

    const empty = view === 'high' ? tx('Noch keine Rekorde in dieser Wertung.') : view === 'streak' ? tx('Gerade hat niemand eine laufende Serie.')
      : week ? tx('Diese Woche hat noch niemand gespielt.') : tx('Heute hat noch niemand gespielt.');
    const list = !data ? `<p class="lb-empty">${msg ? esc(msg) : tx('Lade …')}</p>`
      : !data.top.length ? `<p class="lb-empty">${empty}</p>`
      : data.top.map(row).join('') + (data.me ? `<div class="lb-gap">⋯</div>${row(data.me)}` : '');
    const hint = view === 'high' ? tx('Gewertet wird dein Rekord mit der Songauswahl „Alle“.')
      : view === 'streak' ? tx('Tage in Folge mit gespielter Tages-Challenge.') : '';
    const played = DAILY_RESULTS[g] && DAILY_RESULTS[g]().some(r => r.day === (g === 'needle-drop' ? dayOf('Europe/Berlin') : dayOf()));

    box.style.setProperty('--c', a.color || '#888');
    box.innerHTML = `
      <div class="lb-head"><h2>🏆 ${tx('Bestenliste')}</h2></div>
      ${seg(Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.name])), view, 'data-lb-view').replace('lb-seg', 'lb-seg lb-views')}
      <div class="lb-tabs">
        ${VIEWS[view].games.map(id => { const x = app(id); return `<button class="lb-tab${id === g ? ' on' : ''}" data-lb-game="${id}" style="--c:${esc(x.color || '#888')}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : ''}<span>${esc(x.name)}</span></button>`; }).join('')}
      </div>
      ${opts}
      ${hint ? `<p class="lb-hint">${hint}</p>` : ''}
      <div class="lb-list">${list}</div>
      ${data && joined && view === 'daily' && !week && !played ? `<a class="lb-play" href="${esc(a.url)}">▶ ${tx('Du hast heute noch nicht gespielt – jetzt spielen')}</a>` : ''}
      ${data && !joined ? `
        <div class="lb-join">
          <p>${tx('Mach mit und zeig dich in der Bestenliste. Dein Name, deine Rekorde und deine Punkte der Tages-Challenges sind dann für alle sichtbar.')}</p>
          <div class="lb-form"><span class="lb-emo big">${esc(p.emoji)}</span>
            <input id="lbName" class="lb-input" maxlength="24" placeholder="${tx('Dein Name')}" value="${esc(p.name || '')}" autocomplete="nickname" enterkeyhint="go" data-no-tx>
            <button class="sync-go" id="lbJoin" ${busy ? 'disabled' : ''}>${tx('Mitmachen')}</button></div>
        </div>` : ''}
      ${msg && data ? `<p class="lb-msg">${esc(msg)}</p>` : ''}
      <div class="lb-foot">${data ? tx('{n} Spieler', { n: data.n }) : ''}${joined ? ` · ${tx('Du spielst mit als {n}', { n: esc(p.emoji + ' ' + (p.name || '')) })} · <button class="lb-leave" id="lbLeave"><span class="lbl">${tx('Austreten')}</span></button>` : ''}</div>`;

    const pick = fn => () => { fn(); keep(); data = null; msg = ''; draw(); load(true); };
    box.querySelectorAll('[data-lb-view]').forEach(b => b.onclick = pick(() => { sel.view = b.dataset.lbView; }));
    box.querySelectorAll('[data-lb-game]').forEach(b => b.onclick = pick(() => { sel[view] = b.dataset.lbGame; }));
    box.querySelectorAll('[data-lb-range]').forEach(b => b.onclick = pick(() => { sel.range = b.dataset.lbRange; }));
    box.querySelectorAll('[data-lb-diff]').forEach(b => b.onclick = pick(() => { sel.diff[g] = b.dataset.lbDiff; }));
    box.querySelectorAll('[data-lb-mode]').forEach(b => b.onclick = pick(() => { sel.mode = b.dataset.lbMode; }));
    if ($('#lbJoin')) { $('#lbJoin').onclick = join; $('#lbName').onkeydown = e => { if (e.key === 'Enter') join(); }; }
    if ($('#lbLeave')) arm($('#lbLeave'), tx('Nochmal tippen zum Austreten'), leave);
  }

  /** Von außen: Seite neu gezeichnet, Code verbunden/getrennt, zurück aus einem Spiel */
  function refresh() {
    if (!Sync.status().connected) { data = null; idCache = null; return draw(); }
    if (document.activeElement?.id === 'lbName') return;   // nicht beim Tippen neu zeichnen
    draw(); load();
  }
  return { refresh, profileChanged, reload: () => load(true) };
})();
