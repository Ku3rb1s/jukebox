// Zwischenspeicher fürs Öffnen als App (schneller Start, öffnet auch ohne Netz).
// Regeln, damit nach einem Update nie eine alte Version hängen bleibt:
// - Seiten (index.html): immer zuerst frisch aus dem Netz, der Speicher nur, wenn kein Netz da ist
// - Dateien mit ?v= und Schriften: sofort aus dem Speicher, im Hintergrund trotzdem nachgeladen
//   (wurde beim Update einmal vergessen, ?v= zu erhöhen, ist spätestens beim nächsten Öffnen alles aktuell)
// - alles andere: zuerst Netz, Speicher nur als Ersatz ohne Netz
// Fremde Server (Spotify, Firebase, Deezer, …) und Dateien anderer Spiele bleiben unberührt.
// Alle Spiele liegen auf derselben Adresse (ku3rb1s.github.io) – darum trägt jeder Speicher das Kürzel des Spiels.
const PREFIX = '__PREFIX__-', CACHE = PREFIX + '1';   // __PREFIX__ setzt scripts/share.js je Spiel ein
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(SCOPE) || r.headers.has('range')) return;
  if (r.mode === 'navigate') e.respondWith(page(r, u));
  else if (u.searchParams.has('v') || u.pathname.endsWith('.woff2')) e.respondWith(fixed(e, r, u));
  else e.respondWith(fresh(r));
});

const keep = res => res.ok && res.type === 'basic';

// Seite: Netz zuerst; gespeichert ohne ?… (Lobby-Code, Spotify-Anmeldung usw. gehören nicht in den Speicher)
async function page(r, u) {
  const key = u.origin + u.pathname;
  try {
    const res = await fetch(r);
    if (keep(res)) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(key, c)).catch(() => {}); }
    return res;
  } catch (err) {
    const hit = await caches.match(key) || await caches.match(u.origin + SCOPE);
    if (hit) return hit;
    throw err;
  }
}

// Dateien mit Version: aus dem Speicher und im Hintergrund auffrischen; ältere Versionen derselben Datei fliegen raus
async function fixed(e, r, u) {
  const hit = await caches.match(r);
  const net = fetch(r).then(res => {
    if (keep(res)) {
      const c = res.clone();
      e.waitUntil(caches.open(CACHE).then(async ca => {
        for (const old of await ca.keys()) { const o = new URL(old.url); if (o.pathname === u.pathname && o.search !== u.search) await ca.delete(old); }
        await ca.put(r, c);
      }).catch(() => {}));
    }
    return res;
  });
  if (!hit) return net.catch(async err => await caches.match(r, { ignoreSearch: true }) || Promise.reject(err));   // ohne Netz: notfalls eine andere Version
  e.waitUntil(net.catch(() => {}));
  return hit;
}

// Übrige Dateien: Netz zuerst, Speicher nur ohne Netz
async function fresh(r) {
  try {
    const res = await fetch(r);
    if (keep(res)) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)).catch(() => {}); }
    return res;
  } catch (err) {
    const hit = await caches.match(r);
    if (hit) return hit;
    throw err;
  }
}
