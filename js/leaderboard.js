/* Jukebox – Bestenliste der Tages-Challenges (Server: worker/sync.js, Bereich /lb/).
   - Nur sichtbar mit Code („Auf allen Geräten“): der Code ist das Konto, ohne E-Mail und Passwort.
   - Mitmachen ist freiwillig. Erst dann gehen Name, Emoji und Tagesergebnisse an den Server – und sind öffentlich.
   - Ergebnisse werden eingetragen, wenn die Jukebox geöffnet wird (aus dem Speicher der Spiele, wie die Karten).
   - Austreten oder „Code löschen“ entfernt Name und alle Punkte beim Server. */
const Board = (() => {
  const API = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && store.get('hub.lbApi')) || 'https://jukebox-sync.ku3rb1s.workers.dev/lb/';
  // Spiele mit Tages-Challenge: Ergebnisse von heute und gestern (am Tag selbst gespielt, nicht nachgespielt)
  const GAMES = {
    'needle-drop': {
      results() {
        const L = store.get('mq.daily') || {}, t = dayOf('Europe/Berlin');
        return [t, prevDay(t)].filter(d => L[d] && !L[d].late && Number.isInteger(L[d].score)).map(d => ({ day: d, score: L[d].score }));
      },
      fmt: (n, week) => n.toLocaleString(LANG) + ' ' + tx('Pkt.'),
    },
    'gold-record': {
      results() {
        const t = dayOf();
        return [t, prevDay(t)].map(d => [d, store.get('gr.daily.' + d)]).filter(([, r]) => r?.done && !r.late && Number.isInteger(r.final))
          .map(([d, r]) => ({ day: d, score: r.final }));
      },
      fmt: (n, week) => week ? tx('{n} Stufen', { n }) : n + '/15',
    },
  };
  const MEDAL = ['🥇', '🥈', '🥉'];
  let game = store.get('hub.lbGame'), range = 'day', data = null, busy = false, msg = '', loadedAt = 0, nameTimer = 0;
  if (!GAMES[game]) game = Object.keys(GAMES)[0];

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
  // Lokal gemerkt (pro Code): mitgemacht? welche Ergebnisse schon gesendet?
  const mem = id => { const m = store.get('hub.lb'); return m && m.id === id ? m : { id, on: false, sent: {} }; };
  const remember = m => store.set('hub.lb', m);

  async function sendScores(id) {
    const m = mem(id), scores = [];
    for (const [g, G] of Object.entries(GAMES)) for (const r of G.results()) if (m.sent[g + '|' + r.day] !== r.score) scores.push({ game: g, ...r });
    if (!scores.length) return;
    await post('score', { id, scores });
    for (const s of scores) m.sent[s.game + '|' + s.day] = s.score;
    m.sent = Object.fromEntries(Object.entries(m.sent).sort((a, b) => b[0].slice(-10).localeCompare(a[0].slice(-10))).slice(0, 12));
    remember(m);
  }

  async function load(force) {
    if (busy || (!force && data && Date.now() - loadedAt < 30000)) return;
    const id = await myId();
    if (!id) return;
    busy = true;
    try {
      let m = mem(id);
      if (m.on) await sendScores(id).catch(() => {});
      data = await post('list', { id, game, range });
      if (data.joined !== m.on) {                       // auf einem anderen Gerät mitgemacht/ausgetreten
        m = { ...m, on: data.joined, sent: data.joined ? m.sent : {} }; remember(m);
        if (data.joined) { await sendScores(id).catch(() => {}); data = await post('list', { id, game, range }); }
      }
      loadedAt = Date.now(); msg = '';
    } catch { msg = tx('Die Bestenliste ist gerade nicht erreichbar.'); }
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
    let done = false;
    try { await post('leave', { id }); remember({ id, on: false, sent: {} }); done = true; }
    catch { msg = tx('Die Bestenliste ist gerade nicht erreichbar.'); return draw(); }
    await load(true);
    if (done) { msg = tx('Du bist ausgetreten. Name und Punkte sind gelöscht.'); draw(); }
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

  function draw() {
    const box = $('#lb');
    if (!Sync.status().connected || !DATA) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const app = id => DATA.apps.find(a => a.id === id) || { name: id, color: '#888' };
    const a = app(game), G = GAMES[game], week = range === 'week', p = Profile.get();
    const joined = data ? data.joined : false;
    const row = r => `<div class="lb-row${r.me ? ' me' : ''}"><span class="lb-rank">${r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</span>
      <span class="lb-name"><span class="lb-emo">${esc(r.emoji)}</span><span class="lb-n" data-no-tx>${esc(r.name)}</span>${week && r.days > 1 ? `<small>${tx('{n} Tage', { n: r.days })}</small>` : ''}</span>
      <b class="lb-score">${esc(G.fmt(r.score, week))}</b></div>`;
    const played = G.results().some(r => r.day === (game === 'needle-drop' ? dayOf('Europe/Berlin') : dayOf()));
    let list;
    if (!data) list = `<p class="lb-empty">${msg ? esc(msg) : tx('Lade …')}</p>`;
    else if (!data.top.length) list = `<p class="lb-empty">${week ? tx('Diese Woche hat noch niemand gespielt.') : tx('Heute hat noch niemand gespielt.')}</p>`;
    else list = data.top.map(row).join('') + (data.me ? `<div class="lb-gap">⋯</div>${row(data.me)}` : '');

    box.style.setProperty('--c', a.color || '#888');
    box.innerHTML = `
      <div class="lb-head"><h2>🏆 ${tx('Bestenliste')}</h2><span class="lb-sub">${tx('Tägliche Challenge')}</span></div>
      <div class="lb-tabs">
        ${Object.keys(GAMES).map(g => { const x = app(g); return `<button class="lb-tab${g === game ? ' on' : ''}" data-lb-game="${g}" style="--c:${esc(x.color || '#888')}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : ''}${esc(x.name)}</button>`; }).join('')}
      </div>
      <div class="seg lb-range"><button class="${week ? '' : 'on'}" data-lb-range="day">${tx('Heute')}</button><button class="${week ? 'on' : ''}" data-lb-range="week">${tx('Diese Woche')}</button></div>
      <div class="lb-list">${list}</div>
      ${data && joined && !played && !week ? `<a class="lb-play" href="${esc(a.url)}">▶ ${tx('Du hast heute noch nicht gespielt – jetzt spielen')}</a>` : ''}
      ${data && !joined ? `
        <div class="lb-join">
          <p>${tx('Mach mit und zeig dich in der Bestenliste. Dein Name und deine Punkte der Tages-Challenges sind dann für alle sichtbar.')}</p>
          <div class="lb-form"><span class="lb-emo big">${esc(p.emoji)}</span>
            <input id="lbName" class="lb-input" maxlength="24" placeholder="${tx('Dein Name')}" value="${esc(p.name || '')}" autocomplete="nickname" enterkeyhint="go" data-no-tx>
            <button class="sync-go" id="lbJoin" ${busy ? 'disabled' : ''}>${tx('Mitmachen')}</button></div>
        </div>` : ''}
      ${msg && data ? `<p class="lb-msg">${esc(msg)}</p>` : ''}
      <div class="lb-foot">${data ? tx('{n} Spieler', { n: data.n }) : ''}${joined ? ` · ${tx('Du spielst mit als {n}', { n: esc(p.emoji + ' ' + (p.name || '')) })} · <button class="lb-leave" id="lbLeave"><span class="lbl">${tx('Austreten')}</span></button>` : ''}</div>`;

    box.querySelectorAll('[data-lb-game]').forEach(b => b.onclick = () => { game = b.dataset.lbGame; store.set('hub.lbGame', game); data = null; draw(); load(true); });
    box.querySelectorAll('[data-lb-range]').forEach(b => b.onclick = () => { range = b.dataset.lbRange; data = null; draw(); load(true); });
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
