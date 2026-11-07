# Jukebox

Übersichtsseite für alle Spiele: **https://ku3rb1s.github.io/jukebox/**

- [Musik-Bingo](https://ku3rb1s.github.io/musik-bingo-lobby/) – Repo `musik-bingo-lobby`
- [Needle Drop](https://ku3rb1s.github.io/needle-drop/) – Repo `needle-drop`
- [Older or Newer](https://ku3rb1s.github.io/older-or-newer/) – Repo `older-or-newer`
- [Gold Record](https://ku3rb1s.github.io/gold-record/) – Repo `gold-record`

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

## Gleicher Look und gemeinsame Dateien

Design-Basis, Schrift, Sprachen, Profil, Abgleich und App-Modus sind in allen Spielen gleich. Die Originale liegen in
`shared/`, verteilt werden sie mit `node scripts/share.js --write` (ohne `--write`: nur prüfen).
Alle Regeln für die Spiele – Ordner, Speicher-Schlüssel, Abgleich, neues Spiel anlegen – stehen in **[JUKEBOX.md](JUKEBOX.md)**.
