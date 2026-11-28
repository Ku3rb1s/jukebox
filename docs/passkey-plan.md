# Plan: Passkey statt Code (Abgleich und Bestenliste)

Stand: 28.11.2026 · Website gebaut (siehe „Wie es gebaut ist“), App folgt mit dem bezahlten Apple-Account

## Kurz

Der persönliche Code bleibt **im Hintergrund der Schlüssel** zu allen Daten – nichts an der Verschlüsselung,
am Server-Speicher oder an der Bestenliste ändert sich. Neu: Ein **Passkey schließt den Code auf.**
Man muss ihn sich also nicht mehr merken oder als Bild sichern: Auf einem neuen Gerät reicht „Mit Passkey anmelden“
und Face ID / Touch ID / Fingerabdruck. Wer keinen Passkey nutzen kann oder will, nimmt weiter den Code.

## Wie es heute ist

- Code (12 Zeichen) → **Prüfsumme** (SHA-256, „id“) für den Server und die Bestenliste,
  → **Schlüssel** (PBKDF2, AES-GCM) zum Ver- und Entschlüsseln im Browser (`shared/js/sync.js`, `keys()`).
- Der Server (Worker `jukebox-sync`) sieht nur die Prüfsumme und unlesbare Daten. Ohne Code ist nichts wiederherstellbar.
- Schwachstelle für Nutzer: Code verloren = Daten weg. Darum die ständige Erinnerung „Code sichern“.

## Wie es mit Passkey funktioniert

Passkeys können über die WebAuthn-Erweiterung **PRF** ein Geheimnis liefern, das nur mit diesem Passkey
und nur auf dieser Website (jukeboxquiz.de) entsteht. Damit wird der Code verschlossen:

1. **Passkey anlegen** (auf einem Gerät, das schon einen Code hat): „Mit Passkey sichern“ → Face ID →
   der Passkey liefert sein PRF-Geheimnis → daraus (HKDF) ein Schlüssel → damit wird der **Code verschlüsselt** →
   der Server speichert nur: Passkey-Kennung, öffentlichen Schlüssel des Passkeys, den verschlüsselten Code.
2. **Anmelden auf neuem Gerät:** „Mit Passkey anmelden“ → Passkey auswählen (kommt über iCloud-Schlüsselbund bzw.
   Google-Passwortmanager automatisch auf alle eigenen Geräte) → Server prüft die Anmeldung und gibt den verschlüsselten
   Code heraus → das PRF-Geheimnis entschlüsselt ihn **im Gerät** → ab da läuft alles wie heute mit `Sync.join(code)`.
3. Der Server sieht weder den Code noch das PRF-Geheimnis. Der verschlüsselte Code ist ohne den Passkey wertlos.

Vorteile dieses Wegs:
- **Keine Umstellung der Daten:** Bestehende Codes, Verschlüsselung und Bestenliste bleiben, wie sie sind.
- **Code bleibt Rettungsanker** für Geräte ohne Passkey-Unterstützung.
- Mehrere Passkeys pro Code möglich (z. B. Apple und Android).

Verworfene Alternative: den Code direkt im Passkey speichern (WebAuthn „largeBlob“) – wird schlechter unterstützt als PRF.

## Im Browser (Website) – ohne App

- **Geht ohne den bezahlten Apple-Entwickler-Account** – die Website selbst ist „Eigentümerin“ der Passkeys (jukeboxquiz.de).
- Funktioniert in den gängigen Browsern mit Passkey-PRF (Stand Recherche Nov. 2026, vor dem Bau nochmal prüfen):
  - **iPhone/iPad, Safari, iOS 18+** mit Apple-Passwörtern: ja.
  - **Chrome** auf Desktop (ab ca. 136) und Android (ab ca. 142) mit Google-Passwortmanager: ja.
  - **Windows Hello:** erst mit aktuellem Windows-Update (Feb. 2026) und neuem Chrome/Firefox.
  - **Mac-Safari** und **Firefox**: noch unsicher bzw. lückenhaft.
  - Fremde Passwortmanager (1Password, Bitwarden …): teils ja, teils nein.
- Wo PRF fehlt: Der Knopf „Mit Passkey …“ wird gar nicht erst gezeigt (vorher prüfen), es bleibt beim Code.
- Ein Passkey, den man im Browser auf dem iPhone anlegt, funktioniert später auch in der App (gleiche Domain, gleicher Schlüsselbund) –
  sobald die App die Domain-Verknüpfung hat (siehe unten).

## In der iOS-App

- Braucht den **bezahlten Apple-Entwickler-Account**: Die App muss mit jukeboxquiz.de verknüpft sein
  (Entitlement `webcredentials:jukeboxquiz.de` + Datei `/.well-known/apple-app-site-association` auf der Website mit der Team-ID).
- Danach nativ mit `ASAuthorizationPlatformPublicKeyCredentialProvider` und PRF (iOS 18+): echtes iOS-Passkey-Fenster,
  „Mit Passkey anmelden“ auch direkt beim ersten App-Start.
- Bis dahin: In der App bleibt es beim Code (alles andere funktioniert wie heute).

## Wie es gebaut ist (Website)

- Logik: `js/passkey.js` (Objekt `Passkey`), Anzeige im Fenster „Dein Code“ in `js/hub.js`. Server: `/pk/` in `worker/sync.js`.
- **Anlegen in zwei Schritten, aber nie verwaist:** `register` legt den Passkey sofort an. Liefert der Browser das PRF-Geheimnis
  schon beim Anlegen (Chrome), wird der verschlüsselte Code gleich mitgeschickt. Sonst (Safari) ist er „ausstehend“ und steht so in der
  Liste – „Jetzt bestätigen“ (eigener Tipp, sonst bricht Safari ab) macht eine Anmeldung, und `complete` speichert den Code. Das geht
  auch nach Neuladen. Ausstehende Passkeys, die nie bestätigt werden, löscht der Server nach 30 Tagen.
- **Herausforderungen** sind signiert, 5 Minuten gültig und nur **einmal** verwendbar (Tabelle `pk_challenge`) – keine Wiederholung
  einer mitgeschnittenen Anmeldung.
- **Bremsen** pro Anschluss und Tag: 300 Herausforderungen, 30 fehlgeschlagene Anmeldungen (Tabelle `limits`).
- Beim Anlegen muss die Passkey-Kennung in den Daten des Authentifikators stehen; Anmeldung nur mit Face ID / Fingerabdruck (UV).
- Verschlüsselter Block = Versionsbyte (1) + IV + AES-GCM, an die Passkey-Kennung gebunden.
- Ohne PRF wird nichts angelegt (und der Passkey dem Passwortmanager als unbekannt gemeldet). Jeder Fehler zeigt eine Meldung.
- Code und QR-Code im Fenster „Dein Code“ erst nach Tipp auf „Code anzeigen“ (Website und App).
- Test: `worker/test-passkey.mjs` gegen `wrangler dev --local` (Anleitung im Kopf der Datei).

## Was gebaut werden muss (ursprünglicher Plan)

**Server (Worker `jukebox-sync`, Bereich `/pk/`)**
- Neue Tabelle `passkey (cred_id, id, public_key, sign_count, wrapped_code, label, created, used)`.
- `register-options` / `register`: Passkey anlegen (nur mit gültiger Code-Prüfsumme), Anmeldung prüfen (WebAuthn-Bibliothek für Worker).
- `login-options` / `login`: Herausforderung ausstellen, Anmeldung prüfen, verschlüsselten Code herausgeben.
- `list` / `delete`: eigene Passkeys anzeigen und entfernen.
- „Code löschen“ und die automatische Löschung unbenutzter Codes (6 Monate) löschen auch die Passkeys. Missbrauchsgrenzen wie bei neuen Codes.

**Website (nur Jukebox: `js/hub.js`, Fenster „Dein Code“; die Spiele brauchen nichts)**
- „Mit Passkey sichern“ (zählt als „Code gesichert“ – die Erinnerung verschwindet).
- „Mit Passkey anmelden“ dort, wo man heute einen Code eingibt, und als Knopf auf der Startseite ohne Code.
- Optional „Mit Passkey starten“: Code wird unsichtbar erstellt und gleich mit Passkey gesichert (neue Spieler sehen nie einen Code).
- Liste der Passkeys mit „Entfernen“; der Code bleibt unter „Code anzeigen“ erreichbar.
- Übersetzungen (5 Sprachen).

**App (nach dem Apple-Account)**
- Entitlement, Domain-Datei, natives Passkey-Fenster in `JBCode` (statt der Website-Funktion), gleiche Server-Schnittstelle.

## Aufwand (grob)

| Teil | Aufwand |
|---|---|
| Server + Website | eine längere Sitzung, danach Test auf iPhone-Safari und Chrome |
| App | eine kürzere Sitzung, **erst mit bezahltem Apple-Account** |

## Risiken

- **PRF-Unterstützung lückenhaft** (Mac-Safari, Firefox, manche Passwortmanager) → Code als Rückfall bleibt Pflicht.
- **Passkey gelöscht und Code nicht gesichert** → Daten weg (wie heute beim verlorenen Code). Darum: bei Passkey-Nutzung trotzdem
  einmal „Code anzeigen“ anbieten, aber ohne Dauererinnerung.
- Passkeys sind an die Domain gebunden: **jukeboxquiz.de darf nicht wechseln** (sonst passen die Passkeys nicht mehr).

## Offene Entscheidungen

1. Nur zusätzlich („Mit Passkey sichern“) – oder für neue Spieler **Standard** („Mit Passkey starten“, Code unsichtbar)?
2. Den Code bei Passkey-Nutzern weiter zeigen oder nur noch auf Nachfrage?

## Quellen (Recherche Nov. 2026)

- Corbado – Passkeys & PRF, Unterstützungstabelle: https://www.corbado.com/blog/passkeys-prf-webauthn
- Apple Developer Forum – Passkeys und PRF (iOS 18): https://developer.apple.com/forums/thread/733413
- Chrome – Intent to Ship PRF: https://groups.google.com/a/chromium.org/g/blink-dev/c/iTNOgLwD2bI
- Firefox – PRF-Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1863819
- Yubico – PRF für Entwickler: https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html
