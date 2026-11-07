# Jukebox

Übersichtsseite für alle Spiele: **https://ku3rb1s.github.io/jukebox/**

- [Musik-Bingo](https://ku3rb1s.github.io/musik-bingo-lobby/) – Repo `musik-bingo-lobby`
- [Needle Drop](https://ku3rb1s.github.io/needle-drop/) – Repo `needle-drop`
- [Older or Newer](https://ku3rb1s.github.io/older-or-newer/) – Repo `older-or-newer`

Lokal starten: `node server.js` → http://127.0.0.1:8891/

## Neues Spiel hinzufügen

In `apps.json` einen Eintrag ergänzen – mehr ist nicht nötig:

```json
{
  "id": "mein-spiel",
  "name": "Mein Spiel",
  "url": "https://ku3rb1s.github.io/mein-spiel/",
  "icon": "https://ku3rb1s.github.io/mein-spiel/icon-192.png?v=1",
  "color": "#22c55e",
  "desc": { "de": "Kurzbeschreibung", "en": "Short description" },
  "tags": ["group", "solo", "lobby", "daily", "spotify", "nologin"]
}
```

**Logo geändert?** Bei `icon` die Zahl hinter `?v=` erhöhen (am besten dieselbe wie im Spiel selbst) – sonst zeigen Browser
noch eine Weile das alte Bild aus dem Zwischenspeicher.

Fehlt eine Sprache bei `desc`, wird Deutsch gezeigt. Tags: `group`, `solo`, `lobby`, `daily`, `spotify`, `nologin`
(neue Tags in `js/hub.js` bei `TAGS` und in den Sprachdateien ergänzen).

## Gleicher Look für alle Spiele

- `css/base.css` ist die gemeinsame Basis aus Musik-Bingo (Farbthemen, Glas, Knöpfe, Menüs) – auch in Needle Drop.
  Für ein neues Spiel einfach diese Datei, `css/fonts.css` und `fonts/` übernehmen.
- Alle Spiele liegen unter `ku3rb1s.github.io` und teilen sich den Browser-Speicher. Die Übersicht setzt **Sprache**
  (`mq.lang`, `mb_lang`) und **Design** (`mq.theme`, `mb_settings.theme`) darum für alle Spiele gleich.
- Sprachen: gleiches System wie in den Spielen (`js/i18n.js`, `js/lang/*.js`, Texte im Code auf Deutsch mit `tx()`).
