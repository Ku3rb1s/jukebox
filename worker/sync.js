// Jukebox – Abgleich der Spielstände zwischen Geräten (Cloudflare Worker + D1)
//
// Datenschutz: Der Browser verschlüsselt alles mit dem persönlichen Code (AES-GCM), bevor es hierher kommt.
// Der Server bekommt nur eine Prüfsumme des Codes als Schlüssel (id) und einen unlesbaren Datenblock.
// Er kennt weder Code noch Name noch Punkte. Keine Logs, keine Cookies.
//
//   GET    /sync/<id>          → { rev, data }  (404, wenn es den Code nicht gibt)
//   PUT    /sync/<id>          ← { rev, data }  rev = Version, auf der die Änderung beruht; passt sie nicht → 409 mit dem aktuellen Stand
//                                               rev 0 = neuen Code anlegen (höchstens NEW_PER_DAY pro Anschluss und Tag, sonst 429)
//   DELETE /sync/<id>          → Eintrag löschen (auch die Einträge in der Bestenliste)
//
// Bestenliste der Tages-Challenges (freiwillig, nur mit Code). Öffentlich: Name, Emoji und Punkte sieht jeder.
// Alles per POST mit JSON, damit die id nicht in Adresszeilen landet. id = Prüfsumme des Codes wie oben (wird nie herausgegeben).
//   POST /lb/join   ← { id, name, emoji }   mitmachen bzw. Name ändern (nur mit gültigem Code, Name wird geprüft)
//   POST /lb/leave  ← { id }                austreten: Name und alle Punkte werden gelöscht
//   POST /lb/score  ← { id, scores: [{ game, day, score }] }   Tagesergebnisse; pro Spiel und Tag zählt das erste
//   POST /lb/high   ← { id, scores: [{ game, cat, score }] }      Highscores (Allzeit); nur höhere Werte werden übernommen
//   POST /lb/streak ← { id, scores: [{ game, score }] }            aktuelle Serie der Tages-Challenge
//   POST /lb/list   ← { id?, game, kind?, cat?, range? }  kind 'high' (cat) oder 'streak', sonst Tages-Challenge: range 'day' (heute) oder 'week' (seit Montag) → { joined, n, top, me }
//
// Aufräumen (täglicher Zeitplan):
//   - Codes, die 6 Monate nicht benutzt wurden
//   - Codes, die nach dem Erstellen nie wieder abgeglichen wurden (rev 1), nach 14 Tagen
//   - die Zähler für neue Codes vom Vortag
//
// Begrenzung neuer Codes: gezählt wird pro Internetanschluss, aber ohne die IP-Adresse zu speichern – nur eine
// Prüfsumme aus IP + geheimem Schlüssel (SALT) + Datum. Sie wechselt täglich und wird am nächsten Tag gelöscht.

const ALLOWED = ['https://ku3rb1s.github.io', 'http://127.0.0.1:8890', 'http://127.0.0.1:8891', 'http://127.0.0.1:8892', 'http://127.0.0.1:8893', 'http://127.0.0.1:8894',
  'http://localhost:8890', 'http://localhost:8891', 'http://localhost:8892', 'http://localhost:8893', 'http://localhost:8894'];
const MAX = 300_000;                         // höchstens ~300 KB pro Code (normal sind 10–50 KB)
const KEEP = 180 * 864e5;                    // 6 Monate ohne Benutzung → löschen
const KEEP_UNUSED = 14 * 864e5;              // nie wieder abgeglichen → nach 14 Tagen löschen
const NEW_PER_DAY = 3;                       // neue Codes pro Anschluss und Tag

const day = () => new Date().toISOString().slice(0, 10);

/* ---------- Bestenliste ---------- */
const LB_GAMES = {                           // gültige Punkte je Spiel (Plausibilität – mehr geht im Spiel nicht)
  'needle-drop': v => v >= 0 && v <= 3000 && v % 100 === 0,   // 5 Songs × höchstens 600
  'gold-record': v => v >= 0 && v <= 15,                      // erreichte Stufe
  'hit-or-miss': v => v >= 0 && v <= 8000 && v % 10 === 0,   // Punkte in 60 s: höchstens ~200 Karten × 40
};
// Highscores (Allzeit-Rekorde): nur vergleichbare Einstellungen, je Spiel eine Kategorie (cat) pro Stufe und Modus
const LB_HIGH = {
  'older-or-newer': { cat: /^(easy|normal|hard|pro)\.(show|blind)$/, ok: v => v >= 1 && v <= 3000 },   // längste Serie (Songauswahl „Alle“)
  'gold-record': { cat: /^dia\.(easy|normal|hard)$/, ok: v => v >= 1 && v <= 100000 },             // wie oft Diamant (15/15) je Schwierigkeit
  'hit-or-miss': { cat: /^(60s|sd)\.(easy|normal|hard)$/, ok: v => v >= 1 && v <= 8000 },                                 // Punkte (60 s) bzw. richtig in Folge (Sudden Death)
};
// Serien der Tages-Challenge: aktuelle Serie in Tagen. Sie kann auch sinken (verpasster Tag), darum immer übernommen.
// Gezeigt wird sie nur, wenn sie zuletzt gestern oder heute gemeldet wurde – sonst ist sie wahrscheinlich gerissen.
const LB_STREAK = { 'needle-drop': true, 'gold-record': true, 'hit-or-miss': true };
const STREAK_MAX = 3650;
const LB_TOP = 25;
const LB_KEEP = 60 * 864e5;                  // Tagesergebnisse 60 Tage aufheben (die Woche braucht nur 7)
const TZ = 'Europe/Berlin';                  // Tageswechsel wie in den Spielen
const berlinDay = (off = 0) => new Date(Date.now() + off * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ });
function weekStart() {                       // Montag dieser Woche (deutsche Zeit)
  const noon = Date.parse(berlinDay() + 'T12:00:00Z'), wd = (new Date(noon).getUTCDay() + 6) % 7;
  return new Date(noon - wd * 864e5).toISOString().slice(0, 10);
}
// Namen: unsichtbare Zeichen raus, Länge begrenzen, grobe Beleidigungen und Links ablehnen
const BAD = ['nazi', 'hitler', 'siegheil', 'fick', 'fotze', 'hure', 'schlampe', 'wichser', 'missgeburt', 'spast', 'schwuchtel',
  'neger', 'nigg', 'kanake', 'fuck', 'cunt', 'bitch', 'whore', 'faggot', 'retard', 'penis', 'vagina', 'porn', 'http', 'www'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', '$': 's' };
function cleanName(n) {
  const s = String(n || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').replace(/\s+/g, ' ').trim();
  const len = [...s].length;
  if (len < 2 || len > 24) return null;
  const flat = s.toLowerCase().replace(/[0134578@$]/g, c => LEET[c]).replace(/[^a-zäöüß]/g, '');
  return BAD.some(b => flat.includes(b)) ? null : s;
}
const cleanEmoji = e => { const s = [...String(e || '')].slice(0, 8).join(''); return /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️]+$/u.test(s) ? s : '🎧'; };

async function leaderboard(action, body, env, json) {
  const id = typeof body.id === 'string' && /^[0-9a-f]{32}$/.test(body.id) ? body.id : null;
  const known = async () => !!id && !!await env.DB.prepare('SELECT 1 FROM sync WHERE id = ?').bind(id).first();
  const player = async () => !!id && !!await env.DB.prepare('SELECT 1 FROM lb_player WHERE id = ?').bind(id).first();

  if (action === 'join') {
    if (!await known()) return json({ error: 'unknown' }, 404);
    const name = cleanName(body.name);
    if (!name) return json({ error: 'name' }, 400);
    await env.DB.prepare('INSERT INTO lb_player (id, name, emoji, updated) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji, updated = excluded.updated')
      .bind(id, name, cleanEmoji(body.emoji), Date.now()).run();
    return json({ ok: true, name });
  }
  if (action === 'leave') {
    if (!id) return json({ error: 'bad id' }, 400);
    await env.DB.batch([env.DB.prepare('DELETE FROM lb_score WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM lb_high WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM lb_streak WHERE id = ?').bind(id),
      env.DB.prepare('DELETE FROM lb_player WHERE id = ?').bind(id)]);
    return json({ ok: true });
  }
  if (action === 'high') {
    if (!await player()) return json({ error: 'not joined' }, 403);
    const list = (Array.isArray(body.scores) ? body.scores : []).slice(0, 40)   // alle Highscore-Kategorien aller Spiele (derzeit 17)
      .filter(x => x && LB_HIGH[x.game] && typeof x.cat === 'string' && LB_HIGH[x.game].cat.test(x.cat) && Number.isInteger(x.score) && LB_HIGH[x.game].ok(x.score));
    // Nur höher wird übernommen; der Zeitpunkt zählt bei Gleichstand (wer den Wert zuerst hatte, steht vorne)
    if (list.length) await env.DB.batch(list.map(x => env.DB.prepare(
      'INSERT INTO lb_high (id, game, cat, score, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, game, cat) DO UPDATE SET score = excluded.score, at = excluded.at WHERE excluded.score > lb_high.score')
      .bind(id, x.game, x.cat, x.score, Date.now())));
    return json({ ok: true, saved: list.length });
  }
  if (action === 'score') {
    if (!await player()) return json({ error: 'not joined' }, 403);
    const days = [berlinDay(-1), berlinDay(), berlinDay(1)];      // gestern bis morgen (andere Zeitzonen, spät am Abend gespielt)
    const list = (Array.isArray(body.scores) ? body.scores : []).slice(0, 6)
      .filter(x => x && LB_GAMES[x.game] && days.includes(x.day) && Number.isInteger(x.score) && LB_GAMES[x.game](x.score));
    if (list.length) await env.DB.batch(list.map(x =>
      env.DB.prepare('INSERT INTO lb_score (id, game, day, score, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, game, day) DO NOTHING').bind(id, x.game, x.day, x.score, Date.now())));
    return json({ ok: true, saved: list.length });
  }
  if (action === 'streak') {
    if (!await player()) return json({ error: 'not joined' }, 403);
    const list = (Array.isArray(body.scores) ? body.scores : []).slice(0, 4)
      .filter(x => x && LB_STREAK[x.game] && Number.isInteger(x.score) && x.score >= 0 && x.score <= STREAK_MAX);
    // at = seit wann die Serie diesen Wert hat (bei Gleichstand steht vorne, wer ihn zuerst erreicht hat)
    if (list.length) await env.DB.batch(list.map(x => env.DB.prepare(
      'INSERT INTO lb_streak (id, game, streak, day, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id, game) DO UPDATE SET day = ?4,'
      + ' at = CASE WHEN lb_streak.streak = ?3 THEN lb_streak.at ELSE ?5 END, streak = ?3').bind(id, x.game, x.score, berlinDay(), Date.now())));
    return json({ ok: true, saved: list.length });
  }
  if (action === 'list' && body.kind === 'streak') {
    if (!LB_STREAK[body.game]) return json({ error: 'game' }, 400);
    const { results } = await env.DB.prepare('WITH r AS (SELECT s.id, p.name, p.emoji, s.streak AS score, s.at FROM lb_streak s JOIN lb_player p ON p.id = s.id'
      + ' WHERE s.game = ?1 AND s.day >= ?2 AND s.streak > 0)'
      + ' SELECT id, name, emoji, score, at, (SELECT COUNT(*) FROM r r2 WHERE r2.score > r.score) + 1 AS rank FROM r ORDER BY score DESC, at ASC').bind(body.game, berlinDay(-1)).all();
    const pub = x => ({ rank: x.rank, name: x.name, emoji: x.emoji, score: x.score, me: !!id && x.id === id });
    const mine = id ? results.findIndex(x => x.id === id) : -1;
    return json({ joined: await player(), n: results.length, top: results.slice(0, LB_TOP).map(pub), me: mine >= LB_TOP ? pub(results[mine]) : null });
  }
  if (action === 'list' && body.kind === 'high') {
    const H = LB_HIGH[body.game];
    if (!H || typeof body.cat !== 'string' || !H.cat.test(body.cat)) return json({ error: 'game' }, 400);
    const { results } = await env.DB.prepare('WITH r AS (SELECT h.id, p.name, p.emoji, h.score, h.at FROM lb_high h JOIN lb_player p ON p.id = h.id WHERE h.game = ?1 AND h.cat = ?2)'
      + ' SELECT id, name, emoji, score, at, (SELECT COUNT(*) FROM r r2 WHERE r2.score > r.score) + 1 AS rank FROM r ORDER BY score DESC, at ASC').bind(body.game, body.cat).all();
    const pub = x => ({ rank: x.rank, name: x.name, emoji: x.emoji, score: x.score, me: !!id && x.id === id });
    const mine = id ? results.findIndex(x => x.id === id) : -1;
    return json({ joined: await player(), n: results.length, top: results.slice(0, LB_TOP).map(pub), me: mine >= LB_TOP ? pub(results[mine]) : null });
  }
  if (action === 'list') {
    const game = LB_GAMES[body.game] ? body.game : null;
    if (!game) return json({ error: 'game' }, 400);
    const week = body.range === 'week', from = week ? weekStart() : berlinDay(), to = berlinDay();
    // Je Spieler: Punkte (heute bzw. Summe der Woche); bei Gleichstand steht vorne, wer früher fertig war
    const rows = 'SELECT s.id, p.name, p.emoji, SUM(s.score) AS score, COUNT(*) AS days, MAX(s.at) AS at FROM lb_score s JOIN lb_player p ON p.id = s.id'
      + ' WHERE s.game = ?1 AND s.day >= ?2 AND s.day <= ?3 GROUP BY s.id';
    const { results } = await env.DB.prepare('WITH r AS (' + rows + ') SELECT id, name, emoji, score, days, at, (SELECT COUNT(*) FROM r r2 WHERE r2.score > r.score) + 1 AS rank FROM r ORDER BY score DESC, at ASC')
      .bind(game, from, to).all();
    const pub = x => ({ rank: x.rank, name: x.name, emoji: x.emoji, score: x.score, days: x.days, me: !!id && x.id === id });
    const mine = id ? results.findIndex(x => x.id === id) : -1;
    return json({ joined: await player(), n: results.length, from, to, top: results.slice(0, LB_TOP).map(pub), me: mine >= LB_TOP ? pub(results[mine]) : null });
  }
  return json({ error: 'not found' }, 404);
}
async function ipKey(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.SALT || 'jukebox'}|${day()}|${ip}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

    const path = new URL(request.url).pathname;
    const lb = path.match(/^\/lb\/(join|leave|score|high|streak|list)$/);
    if (lb) {
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      const text = await request.text();
      if (text.length > 4000) return json({ error: 'too large' }, 413);
      let body; try { body = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
      return leaderboard(lb[1], body && typeof body === 'object' ? body : {}, env, json);
    }
    const m = path.match(/^\/sync\/([0-9a-f]{32})$/);
    if (!m) return json({ error: 'not found' }, 404);
    const id = m[1];

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT rev, data FROM sync WHERE id = ?').bind(id).first();
      return row ? json(row) : json({ error: 'unknown' }, 404);
    }
    if (request.method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM sync WHERE id = ?').bind(id),
        env.DB.prepare('DELETE FROM lb_score WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM lb_high WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM lb_streak WHERE id = ?').bind(id),
        env.DB.prepare('DELETE FROM lb_player WHERE id = ?').bind(id)]);
      return json({ ok: true });
    }
    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX + 100) return json({ error: 'too large' }, 413);
      let rev, data;
      try { ({ rev, data } = JSON.parse(body)); } catch { return json({ error: 'bad json' }, 400); }
      if (!Number.isInteger(rev) || rev < 0 || typeof data !== 'string' || !data || data.length > MAX || !/^[A-Za-z0-9+/=]+$/.test(data))
        return json({ error: 'bad data' }, 400);
      const now = Date.now();

      if (rev === 0) {
        // Gibt es den Code schon (zwei Geräte legen gleichzeitig an)? → normaler Konflikt, zählt nicht als neuer Code
        const row = await env.DB.prepare('SELECT rev, data FROM sync WHERE id = ?').bind(id).first();
        if (row) return json(row, 409);
        // Neue Codes pro Anschluss und Tag begrenzen
        const k = await ipKey(request, env);
        const lim = await env.DB.prepare(
          'INSERT INTO limits (k, n, day) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n').bind(k, day()).first();
        if ((lim?.n || 0) > NEW_PER_DAY) return json({ error: 'limit' }, 429);
        const res = await env.DB.prepare('INSERT INTO sync (id, rev, data, updated) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, data, now).run();
        if (res.meta.changes === 1) return json({ rev: 1 });
      } else {
        // Nur schreiben, wenn sich seit dem Lesen niemand dazwischengedrängt hat (sonst 409 → Browser führt zusammen und versucht es erneut)
        const res = await env.DB.prepare('UPDATE sync SET rev = rev + 1, data = ?, updated = ? WHERE id = ? AND rev = ?').bind(data, now, id, rev).run();
        if (res.meta.changes === 1) return json({ rev: rev + 1 });
      }
      const row = await env.DB.prepare('SELECT rev, data FROM sync WHERE id = ?').bind(id).first();
      return row ? json(row, 409) : json({ error: 'unknown' }, 404);
    }
    return json({ error: 'method' }, 405);
  },

  async scheduled(event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sync WHERE updated < ?').bind(now - KEEP),
      env.DB.prepare('DELETE FROM sync WHERE rev <= 1 AND updated < ?').bind(now - KEEP_UNUSED),
      env.DB.prepare('DELETE FROM limits WHERE day < ?').bind(day()),
      // Bestenliste: alte Tage weg, und alles von Codes, die es nicht mehr gibt
      env.DB.prepare('DELETE FROM lb_score WHERE at < ?').bind(now - LB_KEEP),
      env.DB.prepare('DELETE FROM lb_player WHERE id NOT IN (SELECT id FROM sync)'),
      env.DB.prepare('DELETE FROM lb_score WHERE id NOT IN (SELECT id FROM lb_player)'),
      env.DB.prepare('DELETE FROM lb_high WHERE id NOT IN (SELECT id FROM lb_player)'),
      env.DB.prepare('DELETE FROM lb_streak WHERE id NOT IN (SELECT id FROM lb_player)'),
    ]);
  },
};
