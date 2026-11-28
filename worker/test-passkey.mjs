// Test der Passkey-Schnittstelle (/pk/) gegen einen lokal laufenden Worker – nie gegen den echten Server.
//   cd worker && npx wrangler d1 execute jukebox-sync --local --file schema.sql && npx wrangler dev --local
//   node test-passkey.mjs            (anderer Port: PK_TEST_API=http://localhost:8788 node test-passkey.mjs)
// Die Bremse (30 Fehlversuche pro Anschluss und Tag) zählt auch lokal: nach einigen Läufen am selben Tag
//   npx wrangler d1 execute jukebox-sync --local --command "DELETE FROM limits"
// Ein Passkey wird mit einem selbst erzeugten P-256-Schlüssel nachgebildet (authenticatorData, clientDataJSON, Signatur wie im Browser).
import crypto from 'node:crypto';

const API = process.env.PK_TEST_API || 'http://localhost:8787', ORIGIN = 'http://localhost:8891';
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(API)) { console.error('Nur gegen einen lokalen Worker testen.'); process.exit(1); }
const b64u = b => Buffer.from(b).toString('base64url');
const post = async (p, b, origin = ORIGIN) => {
  const r = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(b) });
  return [r.status, await r.json().catch(() => ({}))];
};
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); if (!ok) failed++; };

// Code beim Server anlegen
const id = crypto.randomBytes(16).toString('hex');
const put = await fetch(`${API}/sync/${id}`, { method: 'PUT', headers: { Origin: ORIGIN }, body: JSON.stringify({ rev: 0, data: 'QUJD' }) });
check('Code anlegen', put.status === 200, put.status);

// Nachgebildeter Passkey
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const rpHash = crypto.createHash('sha256').update('localhost').digest();
const credBytes = crypto.randomBytes(32), cred = b64u(credBytes);
const authGet = (flags = 5) => Buffer.concat([rpHash, Buffer.from([flags]), Buffer.from([0, 0, 0, 1])]);
// beim Anlegen: + AAGUID (16) + Länge der Kennung (2) + Kennung (+ öffentlicher Schlüssel als COSE – wird hier nicht gelesen)
const authCreate = (credId = credBytes, flags = 0x45) => Buffer.concat([authGet(flags), Buffer.alloc(16), Buffer.from([credId.length >> 8, credId.length & 255]), credId, Buffer.from([0xa0])]);
const clientData = (type, ch, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge: b64u(Buffer.from(ch)), origin }));
const wrapped = Buffer.concat([Buffer.from([1]), crypto.randomBytes(40)]).toString('base64');
const options = async (body = {}) => (await post('/pk/options', body))[1].challenge;
const register = async (over = {}) => {
  const ch = over.challenge || await options({ id });
  return post('/pk/register', { id, challenge: ch, cred, clientData: b64u(clientData('webauthn.create', ch)), authData: b64u(authCreate()),
    publicKey: spki, alg: -7, label: 'Test', ...over });
};
const assertion = (ch, { flags = 5, key = privateKey, origin = ORIGIN } = {}) => {
  const ad = authGet(flags), cd = clientData('webauthn.get', ch, origin);
  const sig = crypto.sign('sha256', Buffer.concat([ad, crypto.createHash('sha256').update(cd).digest()]), key);
  return { challenge: ch, cred, clientData: b64u(cd), authData: b64u(ad), signature: b64u(sig) };
};

// Anlegen: falsche Kennung in authenticatorData, falsche Herausforderung, dann richtig (ohne wrapped → ausstehend)
let [s, o] = await register({ authData: b64u(authCreate(crypto.randomBytes(32))) });
check('Anlegen mit fremder Kennung abgelehnt', s === 400, o);
[s, o] = await register({ challenge: (await options({ id })) + 'x' });
check('Anlegen mit gefälschter Herausforderung abgelehnt', s === 400, o);
const ch0 = await options({});   // nicht an den Code gebunden
[s, o] = await register({ challenge: ch0 });
check('Anlegen mit Herausforderung ohne Code abgelehnt', s === 400, o);
const chReg = await options({ id });
[s, o] = await register({ challenge: chReg });
check('Anlegen ohne Geheimnis → ausstehend', s === 200 && o.pending === true, o);
[s, o] = await register({ challenge: chReg });
check('Herausforderung nur einmal verwendbar', s === 400 && o.error === 'challenge', o);
[s, o] = await register();
check('Gleichen Passkey nicht doppelt anlegen', s === 409 && o.error === 'exists', o);

[s, o] = await post('/pk/list', { id });
check('Liste zeigt ausstehenden Passkey', s === 200 && o.keys.length === 1 && o.keys[0].pending === true, o);

// Anmelden mit ausstehendem Passkey → pending
[s, o] = await post('/pk/login', assertion(await options()));
check('Anmelden mit ausstehendem Passkey → pending', s === 409 && o.error === 'pending', o);

// Fertig verbinden: falsche Signatur, fremder Code, dann richtig
const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
[s, o] = await post('/pk/complete', { ...assertion(await options({ id }), { key: other }), id, wrapped });
check('Verbinden mit falscher Signatur abgelehnt', s === 401, o);
[s, o] = await post('/pk/complete', { ...assertion(await options({ id })), id, wrapped: 'kurz' });
check('Verbinden ohne gültigen Block abgelehnt', s === 400, o);
const chDone = await options({ id });
[s, o] = await post('/pk/complete', { ...assertion(chDone), id, wrapped });
check('Verbinden mit Passkey', s === 200 && o.ok, o);
[s, o] = await post('/pk/complete', { ...assertion(chDone), id, wrapped });
check('Verbinden: Herausforderung nicht wiederverwendbar', s === 400, o);
[s, o] = await post('/pk/list', { id });
check('Liste: jetzt fertig', o.keys?.[0]?.pending === false, o);

// Anmelden
const chLogin = await options();
const good = assertion(chLogin);
[s, o] = await post('/pk/login', good);
check('Anmelden gibt verschlüsselten Code', s === 200 && o.wrapped === wrapped, o);
[s, o] = await post('/pk/login', good);
check('Anmeldung nicht wiederholbar (Replay)', s === 400 && o.error === 'challenge', o);
[s, o] = await post('/pk/login', assertion(await options(), { key: other }));
check('Anmelden mit falscher Signatur abgelehnt', s === 401, o);
[s, o] = await post('/pk/login', assertion(await options(), { flags: 1 }));
check('Anmelden ohne Face ID / Fingerabdruck (UV) abgelehnt', s === 401, o);
const chEvil = await options();
[s, o] = await post('/pk/login', assertion(chEvil, { origin: 'https://evil.example' }), 'https://evil.example');
check('Anmelden von fremder Website abgelehnt', s === 401, o);
[s, o] = await post('/pk/login', assertion(await options({ id })));
check('Anmelden mit an Code gebundener Herausforderung abgelehnt', s === 400, o);

// Löschen
[s, o] = await post('/pk/delete', { id, cred });
check('Passkey entfernen', s === 200, o);
[s, o] = await post('/pk/list', { id });
check('Liste danach leer', o.keys?.length === 0, o);
[s, o] = await post('/pk/login', assertion(await options()));
check('Entfernter Passkey → unknown', s === 404 && o.error === 'unknown', o);

await fetch(`${API}/sync/${id}`, { method: 'DELETE', headers: { Origin: ORIGIN } });
console.log(failed ? `\n${failed} Test(s) fehlgeschlagen.` : '\nAlle Tests bestanden.');
process.exit(failed ? 1 : 0);
