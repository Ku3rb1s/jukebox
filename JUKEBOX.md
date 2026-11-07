# Jukebox-Spiele – gemeinsame Regeln

Diese Datei gilt für **alle** Spiele der Jukebox. Jedes Spiel bindet sie über seine `CLAUDE.md` ein.
Original: `Spiele-Hub/JUKEBOX.md` – hier ändern, nicht in Kopien.

## Die Spiele

Alle liegen unter `C:\Users\nik-r\Documents\Claude\`, jedes ist ein eigenes GitHub-Repo (GitHub Pages, Branch `main`).

| Spiel | Ordner | Adresse | Lokal | Speicher-Kürzel |
|---|---|---|---|---|
| Jukebox (Übersicht, Code, Abgleich) | `Spiele-Hub` | ku3rb1s.github.io/jukebox/ | 8891 | `hub.`, `jb.` |
| Needle Drop | `Musik-Quiz` | ku3rb1s.github.io/needle-drop/ | 8890 | `mq.` |
| Older or Newer | `Older-or-Newer` | ku3rb1s.github.io/older-or-newer/ | 8892 | `oon.` |
| Gold Record | `Gold-Record` | ku3rb1s.github.io/gold-record/ | 8893 | `gr.` |
| Musik-Bingo | `Musik-Bingo-Lobby/mb` | ku3rb1s.github.io/musik-bingo-lobby/ | 8888 | `mb_` |

Lokal starten: im Spiel-Ordner `node server.js`. Die Liste mit Repo-Namen steht auch in `Spiele-Hub/shared/games.json`.

## Gemeinsame Dateien – nur das Original ändern

Diese Dateien sind in allen Spielen gleich. Das Original liegt in **`Spiele-Hub/shared/`**:

- `css/base.css` – Design-Basis (Farbthemen, Glas, Knöpfe, Menüs, Handy-Abstände)
- `css/fonts.css`, `fonts/` – Schrift Outfit (liegt im Spiel selbst, keine Verbindung zu Google)
- `js/i18n.js` – Sprachen: `tx('Deutscher Text')`, `translatePage()`, `setLang()`
- `js/profile.js` – gemeinsames Spielerprofil (Name + Emoji, Schlüssel `jb.profile`)
- `js/sync.js` – „Auf allen Geräten spielen“: Abgleich per persönlichem Code (siehe unten)
- `js/pwa.js`, `sw.js` – App-Modus, Zwischenspeicher, iPhone-Korrekturen (Statusleiste, kein Zoomen)
- `scripts/check-lang.js` – Übersetzungsprüfung. Spielspezifisches (Eigennamen, Tabellen mit Texten, Ausnahmen)
  steht in `scripts/lang.config.js` des Spiels – die gehört dem Spiel und wird nicht verteilt.

Musik-Bingo hat ein eigenes Design und eigene Sprachdateien (auch ein eigenes Prüfskript) und bekommt nur `js/pwa.js` und `sw.js`.

**Übersetzungen aller Spiele prüfen:** `node scripts/share.js --lang` (im Ordner `Spiele-Hub`, mit `-v` für Details).
Erfolge im Format `['id', 'Symbol', 'Name', 'Beschreibung']` und Farbthemen findet das Prüfskript von selbst.

**Ablauf bei einer Änderung:**
1. Datei in `Spiele-Hub/shared/` ändern.
2. `node scripts/share.js` (im Ordner `Spiele-Hub`) zeigt, welche Spiele abweichen.
3. `node scripts/share.js --write` kopiert in alle Spiele und erhöht dort `?v=` in `index.html`.
4. Jedes geänderte Spiel lokal kurz testen, dann einchecken und hochladen.

Wurde eine Kopie in einem Spiel geändert (z. B. von einer Spiel-Sitzung)? Erst zum Original machen:
`node scripts/share.js --pull <Ordner> <Datei>`, dann `--write`.

## Was alle Spiele teilen (Browser-Speicher von ku3rb1s.github.io)

- **Sprache:** `mq.lang`, `hub.lang`, `mb_lang` – `setLang()` setzt alle drei.
- **Design:** `mq.theme` (neuere Spiele), `hub.theme`, `mb_settings.theme` (Bingo). Themen: graphit, ozean, wald, abend, lila, oled.
- **Profil:** `jb.profile` = `{ name, emoji }`. Bingo schlägt den Namen beim Beitreten vor.
- **Abgleich:** `jb.sync` (Code und Stand), `jb.syncOthers` (Statistik der anderen Geräte).

Jedes Spiel speichert seine eigenen Daten nur unter seinem Kürzel (Tabelle oben). „Alles löschen“ löscht nur das
eigene Kürzel und ruft `Sync.leave()` auf.

## Abgleich zwischen Geräten (`js/sync.js` + Worker `jukebox-sync`)

- Code in der Jukebox erstellen oder eingeben: Fenster „Dein Code“ (Knopf unten auf der Startseite oder Einstellungen → „Dein Code“, Link `jukebox/#sync`, QR `jukebox/#code=…`).
- Alles wird im Browser mit dem Code verschlüsselt (AES-GCM). Der Server sieht nur eine Prüfsumme und unlesbare Daten.
- Server: Cloudflare Worker `jukebox-sync` mit D1-Datenbank, Quelltext in `Spiele-Hub/worker/`
  (`npx wrangler deploy` im Ordner `worker`). Unbenutzte Codes nach 6 Monaten weg, nie benutzte nach 14 Tagen,
  höchstens 3 neue Codes pro Anschluss und Tag.
- **Welche Schlüssel abgeglichen werden, steht in `RULES` in `shared/js/sync.js`** (latest, max, days, day, mapmax,
  union, top, device). Statistik ist „device“: je Gerät gespeichert und zur Anzeige mit `Sync.view(key, eigenerWert)`
  zusammengezählt (Zusammenzählen in `COMBINE`).
- **Neuer Rekord-/Statistik-Schlüssel in einem Spiel?** In `RULES` (und ggf. `COMBINE`) eintragen, sonst wird er nicht abgeglichen.
- Rekorde/Statistik löschen soll auf allen Geräten gelten: nach dem lokalen Löschen `Sync.reset('präfix')` aufrufen.
- Spiele hören auf `addEventListener('jukebox-sync', …)` und zeichnen dann Startseite/Einstellungen neu.

## Bestenliste (`js/leaderboard.js` in der Jukebox + Worker, Bereich `/lb/`)

Drei Wertungen:
- **Tages-Challenge** (Needle Drop, Gold Record): heute bzw. Summe der Woche. Aus `mq.daily` und `gr.daily.<Tag>`,
  nachgespielte Tage zählen nicht, pro Spiel und Tag zählt das erste Ergebnis (Tabelle `lb_score`).
- **Highscores** (Older or Newer, Gold Record): Allzeit-Rekord, nur Songauswahl „Alle“, je Stufe (und bei Older or Newer je Modus),
  damit die Werte vergleichbar sind. Aus `oon.best2.all.<stufe>.<modus>` und `gr.best.all.<stufe>`. Nur höhere Werte werden übernommen (`lb_high`).
- **Serien** (Needle Drop, Gold Record): laufende Serie der Tages-Challenge. Gezeigt nur, wenn zuletzt gestern oder heute gemeldet (`lb_streak`).

Regeln:
- Eigenes Fenster, geöffnet über den goldenen Knopf oben in der Jukebox (Link: `jukebox/#bestenliste`). Anschauen kann jeder.
- Mitmachen ist freiwillig und geht in einem Schritt: Name eintragen (Pflicht), „Mitmachen“ – fehlt ein Code, wird er dabei
  erstellt; danach wird „Code sichern“ angeboten, bis er gesichert ist. Erst beim Mitmachen gehen Name, Emoji und Werte **lesbar**
  an den Server und sind öffentlich. Der Code ist das Konto, gesendet wird nur seine Prüfsumme (wie beim Abgleich).
- Die Werte trägt die Jukebox ein, wenn sie geöffnet wird (aus dem Speicher der Spiele, die Spiele selbst senden nichts).
- Server prüft: Code muss existieren, Werte müssen möglich sein (`LB_GAMES`, `LB_HIGH`, `LB_STREAK` in `worker/sync.js`), Namen ohne grobe Beleidigungen/Links.
- Austreten oder „Code löschen“ entfernt Name und alle Werte. Tagesergebnisse werden nach 60 Tagen gelöscht.
- **Neues Spiel oder neue Wertung?** In `js/leaderboard.js` (`DAILY_RESULTS`, `HIGH`, `VIEWS`) und im Worker (`LB_GAMES`, `LB_HIGH`, `LB_STREAK`)
  eintragen, neue Tabellen in `worker/schema.sql`, dann `npx wrangler d1 execute jukebox-sync --remote --file schema.sql` und `npx wrangler deploy`.

## Cover (Gold Record, Older or Newer)

- Deezer liefert das Cover des Albums, auf dem der Track liegt – oft ein Sampler („Sommer Hits“, späte Soundtracks …).
  `node scripts/check-covers.js` (im Ordner Spiele-Hub) findet solche Songs und sucht das Original-Cover: erst MusicBrainz/
  Cover Art Archive (Original-Single/-Album aus der Zeit des Songs), sonst ein Album des Interpreten bei Deezer – sonst bleibt es.
- Ergebnis: `data/covers.json` im Spiel (`{ id: "mb:<release-group>" | "<deezer-md5>" }`), die Spiele übernehmen es beim Laden.
  Lädt ein Original-Cover nicht (oder nicht binnen 4 s), springt das Bild auf das Deezer-Cover zurück.
- Nach neuen Songs das Skript erneut laufen lassen (Zwischenstand in `scripts/.cache/`, Bericht `scripts/.cache/covers-report.txt`).

## Neues Spiel

1. Ordner neben den anderen anlegen, eigenes Repo, GitHub Pages.
2. In `Spiele-Hub/shared/games.json` eintragen (Ordner, Kürzel für `sw`), dann `node scripts/share.js --write` –
   damit bekommt es Design, Schrift, Sprachen, Profil, Abgleich und App-Modus.
3. `CLAUDE.md` im Spiel-Ordner mit der Zeile `@../Spiele-Hub/JUKEBOX.md` anlegen.
4. In `index.html` die gemeinsamen Dateien einbinden (Reihenfolge: `lang/*.js`, `profile.js`, `sync.js`, `i18n.js`, Spiel, `pwa.js`),
   Viewport mit `maximum-scale=1,viewport-fit=cover`, Manifest mit `"scope": "/"`.
5. Spieldaten nur unter einem eigenen Kürzel speichern, Rekorde/Statistik in `RULES` von `sync.js` eintragen.
6. In `Spiele-Hub/apps.json` als Kachel eintragen (siehe `Spiele-Hub/README.md`) und in die Tabelle oben.

## Arbeitsweise

- Texte im Code auf Deutsch mit `tx()`, Übersetzungen in `js/lang/{en,fr,es,nb}.js` (alle vier Sprachen pflegen).
- Bei jedem Update: `APP_VERSION` erhöhen, `CHANGELOG.md` ergänzen, `?v=` geänderter Dateien in `index.html` erhöhen.
- **Gold Record:** Die Songdaten (`data/*.json`) haben eine eigene Version `DATA_V` in `js/game.js` – nur erhöhen, wenn sich
  Songdaten geändert haben (dann bleiben sie bei normalen Updates im Zwischenspeicher der Handys).
- Ein Ergebnis ist nur in der Bestenliste, wenn es in `BOARD` in `shared/js/sync.js` steht (Tages-Challenge, Highscores, Serien) –
  neue Wertung dort und im Worker eintragen.
- Vor dem Hochladen `git pull --rebase` – oft arbeiten mehrere Sitzungen gleichzeitig an den Spielen.
  Nur die eigenen Dateien einchecken, fremde offene Änderungen nicht mit einchecken.
- Rückfragen im Spiel nicht mit `confirm()`/`alert()`, sondern mit einem Dialog im Stil des Spiels.
- Keine Anmeldung, kein Tracking, keine externen Schriften. Daten bleiben auf dem Gerät (außer beim Abgleich, verschlüsselt).
