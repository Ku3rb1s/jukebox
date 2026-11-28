/* Passkeys (freiwillig): ein Passkey schließt den Code auf – Face ID / Fingerabdruck statt Code eintippen.
   Der Code bleibt der Schlüssel zu den Daten. Der Passkey liefert über die WebAuthn-Erweiterung PRF ein Geheimnis, mit dem der Code
   hier im Browser verschlüsselt wird; beim Server (worker/sync.js, /pk/) liegen nur dieser Block und der öffentliche Schlüssel.
   Plan: docs/passkey-plan.md. In der iOS-App (noch) nicht: dafür braucht die App die Domain-Verknüpfung (bezahlter Apple-Account).

   Ablauf beim Sichern:
   1. register(code): Passkey anlegen. Liefert der Browser das Geheimnis gleich mit (Chrome), ist alles fertig.
   2. Sonst (Safari) steht der Passkey beim Server als „ausstehend“ (list → pending). complete(code, cred) holt das Geheimnis
      mit einer Anmeldung – die braucht einen eigenen Tipp („Jetzt bestätigen“), sonst bricht Safari still ab.
      Weil der Server den ausstehenden Passkey kennt, geht das auch nach Neuladen oder später noch.

   Fehler werfen immer einen Error mit einem Namen, den Passkey.message() in einen Text für den Nutzer übersetzt. */
const Passkey = (() => {
  const API = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('hub.pkApi')) || 'https://jukebox-sync.ku3rb1s.workers.dev/pk/';
  const SALT = new TextEncoder().encode('jukebox-code-wrap-v1');   // PRF-Eingabe – nie ändern, sonst passen gespeicherte Passkeys nicht mehr
  const VERSION = 1;                                                // erstes Byte des verschlüsselten Blocks
  const enc = s => new TextEncoder().encode(s);
  const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const rpId = () => location.hostname.replace(/^www\./, '');
  const fail = (name, extra) => Object.assign(new Error(name), { name: 'PasskeyError', code: name, ...extra });

  const inApp = !!window.webkit?.messageHandlers?.jbNative;
  let supported = !inApp && !!window.PublicKeyCredential && window.isSecureContext;
  const ready = supported && PublicKeyCredential.getClientCapabilities
    ? PublicKeyCredential.getClientCapabilities().then(c => { if (c && c['extension:prf'] === false) supported = false; }).catch(() => {})
    : Promise.resolve();

  async function post(path, body) {
    let r;
    try { r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }); }
    catch { throw fail('offline'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(j.error || 'offline');
    return j;
  }
  // Prüfsumme des Codes wie in shared/js/sync.js
  async function idOf(code) {
    const buf = await crypto.subtle.digest('SHA-256', enc('jukebox-sync-id|' + code));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  async function keyOf(prf) {
    const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc('jukebox'), info: enc('code-wrap-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // Block = Version (1 Byte) + IV (12) + AES-GCM; an die Passkey-Kennung gebunden (additionalData)
  async function wrap(prf, code, cred) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc('jukebox-code|' + cred) }, await keyOf(prf), enc(code)));
    return b64([VERSION, ...iv, ...ct]);
  }
  async function unwrap(prf, blob, cred) {
    const u = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    if (u[0] !== VERSION) throw fail('format');
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(1, 13), additionalData: enc('jukebox-code|' + cred) }, await keyOf(prf), u.subarray(13))); }
    catch { throw fail('format'); }
  }
  // Browser-Fehler vereinheitlichen: Abbruch, schon vorhanden, Rest
  async function webauthn(fn) {
    try { return await fn(); }
    catch (e) {
      if (e?.name === 'InvalidStateError') throw fail('exists');
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') throw fail('cancelled');
      throw fail('browser');
    }
  }
  const forget = cred => { try { PublicKeyCredential.signalUnknownCredential?.({ rpId: rpId(), credentialId: cred }); } catch {} };
  const label = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Mac/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Passkey'; };
  // Anmeldung mit PRF; cred = nur diesen Passkey erlauben
  async function assert(challenge, cred) {
    const a = await webauthn(() => navigator.credentials.get({ publicKey: { rpId: rpId(), challenge: enc(challenge), userVerification: 'required', timeout: 120000,
      ...(cred ? { allowCredentials: [{ type: 'public-key', id: unb64u(cred) }] } : {}), extensions: { prf: { eval: { first: SALT } } } } }));
    const prf = a.getClientExtensionResults().prf?.results?.first;
    if (!prf) throw fail('prf', { hybrid: a.authenticatorAttachment === 'cross-platform' });
    return { prf, cred: b64u(a.rawId), body: { challenge, cred: b64u(a.rawId), clientData: b64u(a.response.clientDataJSON),
      authData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature) } };
  }

  return {
    get ok() { return supported; },
    ready,
    /** Passkeys dieses Codes: [{ cred, label, created, used, pending }] */
    async list(code) { return (await post('list', { id: await idOf(code) })).keys || []; },
    async remove(code, cred) { await post('delete', { id: await idOf(code), cred }); },
    /** Neuen Passkey anlegen. → { pending: true, cred } wenn noch „Jetzt bestätigen“ (complete) nötig ist. */
    async register(code, profile = {}, existing = []) {
      const id = await idOf(code), { challenge } = await post('options', { id });
      const c = await webauthn(() => navigator.credentials.create({ publicKey: {
        rp: { id: rpId(), name: 'Jukebox' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: profile.name || 'Jukebox', displayName: profile.name ? `${profile.emoji || ''} ${profile.name}`.trim() : 'Jukebox' },
        challenge: enc(challenge), timeout: 120000,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: existing.map(k => ({ type: 'public-key', id: unb64u(k.cred) })),   // derselbe Schlüsselbund hat schon einen → Browser meldet das
        extensions: { prf: { eval: { first: SALT } } } } }));
      const cred = b64u(c.rawId), ext = c.getClientExtensionResults().prf;
      // Kein PRF: Passkey wäre nutzlos – gar nicht erst beim Server anlegen und dem Passwortmanager sagen, dass er weg kann
      if (!ext || (!ext.enabled && !ext.results)) { forget(cred); throw fail('prf'); }
      const prf = ext.results?.first;
      const res = await post('register', { id, challenge, cred, clientData: b64u(c.response.clientDataJSON), authData: b64u(c.response.getAuthenticatorData()),
        publicKey: b64(c.response.getPublicKey()), alg: c.response.getPublicKeyAlgorithm(), label: label(), ...(prf ? { wrapped: await wrap(prf, code, cred) } : {}) });
      return { pending: !!res.pending, cred };
    },
    /** Ausstehenden Passkey fertig verbinden (zweiter Tipp) */
    async complete(code, cred) {
      const id = await idOf(code), { challenge } = await post('options', { id });
      const a = await assert(challenge, cred);
      await post('complete', { ...a.body, id, wrapped: await wrap(a.prf, code, a.cred) });
    },
    /** Mit Passkey anmelden → Code (noch nicht verbunden) */
    async login() {
      const { challenge } = await post('options', {});
      const a = await assert(challenge);
      let wrapped;
      try { ({ wrapped } = await post('login', a.body)); }
      catch (e) { if (e.code === 'unknown') forget(a.cred); throw e; }   // Passkey ohne Eintrag beim Server → Passwortmanager darf ihn löschen
      const code = Sync.normCode(await unwrap(a.prf, wrapped, a.cred));
      if (!code) throw fail('format');
      return code;
    },
    /** Text zum Fehler für den Nutzer – nie leer */
    message(e) {
      switch (e?.code) {
        case 'cancelled': return tx('Abgebrochen.');
        case 'exists': return tx('Auf diesem Gerät ist dein Code schon mit einem Passkey gesichert.');
        case 'prf': return e.hybrid ? tx('Mit einem Passkey von einem anderen Gerät (per QR-Code) geht das hier leider noch nicht – gib den Code ein.')
          : tx('Dein Browser kann das mit Passkeys leider noch nicht – nutze den Code.');
        case 'unknown': return tx('Dieser Passkey ist mit keinem Code verbunden (das Einrichten wurde nicht abgeschlossen). Du kannst ihn in deinen Passwörtern löschen.');
        case 'pending': return tx('Dieser Passkey ist noch nicht fertig eingerichtet. Öffne auf dem Gerät mit deinem Code „Dein Code“ und tippe dort auf „Jetzt bestätigen“.');
        case 'gone': return tx('Zu diesem Passkey gibt es keinen Code mehr.');
        case 'limit': return tx('Gerade zu viele Versuche – bitte später nochmal.');
        case 'max': return tx('Mehr Passkeys gehen für diesen Code nicht.');
        case 'format': case 'signature': case 'challenge': case 'client': case 'key': case 'wrapped': case 'browser':
          return tx('Das hat nicht geklappt – versuch es nochmal oder nutze den Code.');
        default: return tx('Keine Verbindung – versuch es gleich nochmal.');
      }
    },
  };
})();
