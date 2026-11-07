// Jukebox – Abgleich der Spielstände zwischen Geräten (Cloudflare Worker + D1)
//
// Datenschutz: Der Browser verschlüsselt alles mit dem persönlichen Code (AES-GCM), bevor es hierher kommt.
// Der Server bekommt nur eine Prüfsumme des Codes als Schlüssel (id) und einen unlesbaren Datenblock.
// Er kennt weder Code noch Name noch Punkte. Keine Logs, keine Cookies.
//
//   GET    /sync/<id>          → { rev, data }  (404, wenn es den Code nicht gibt)
//   PUT    /sync/<id>          ← { rev, data }  rev = Version, auf der die Änderung beruht; passt sie nicht → 409 mit dem aktuellen Stand
//                                               rev 0 = neuen Code anlegen (höchstens NEW_PER_DAY pro Anschluss und Tag, sonst 429)
//   DELETE /sync/<id>          → Eintrag löschen
//
// Aufräumen (täglicher Zeitplan):
//   - Codes, die 6 Monate nicht benutzt wurden
//   - Codes, die nach dem Erstellen nie wieder abgeglichen wurden (rev 1), nach 14 Tagen
//   - die Zähler für neue Codes vom Vortag
//
// Begrenzung neuer Codes: gezählt wird pro Internetanschluss, aber ohne die IP-Adresse zu speichern – nur eine
// Prüfsumme aus IP + geheimem Schlüssel (SALT) + Datum. Sie wechselt täglich und wird am nächsten Tag gelöscht.

const ALLOWED = ['https://ku3rb1s.github.io', 'http://127.0.0.1:8890', 'http://127.0.0.1:8891', 'http://127.0.0.1:8892', 'http://127.0.0.1:8893',
  'http://localhost:8890', 'http://localhost:8891', 'http://localhost:8892', 'http://localhost:8893'];
const MAX = 300_000;                         // höchstens ~300 KB pro Code (normal sind 10–50 KB)
const KEEP = 180 * 864e5;                    // 6 Monate ohne Benutzung → löschen
const KEEP_UNUSED = 14 * 864e5;              // nie wieder abgeglichen → nach 14 Tagen löschen
const NEW_PER_DAY = 3;                       // neue Codes pro Anschluss und Tag

const day = () => new Date().toISOString().slice(0, 10);
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
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

    const m = new URL(request.url).pathname.match(/^\/sync\/([0-9a-f]{32})$/);
    if (!m) return json({ error: 'not found' }, 404);
    const id = m[1];

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT rev, data FROM sync WHERE id = ?').bind(id).first();
      return row ? json(row) : json({ error: 'unknown' }, 404);
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM sync WHERE id = ?').bind(id).run();
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
    ]);
  },
};
