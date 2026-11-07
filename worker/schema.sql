-- Ein Eintrag pro Code. id = Prüfsumme des Codes (der Code selbst kommt nie zum Server),
-- data = im Browser verschlüsselter Block, rev = Versionszähler gegen gleichzeitiges Überschreiben.
CREATE TABLE IF NOT EXISTS sync (
  id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_updated ON sync(updated);

-- Zähler für neue Codes pro Anschluss und Tag. k = Prüfsumme aus IP + geheimem Schlüssel + Datum (keine IP gespeichert).
CREATE TABLE IF NOT EXISTS limits (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  day TEXT NOT NULL
);

-- Bestenliste der Tages-Challenges (freiwillig, nur mit Code). Anders als der Abgleich ist das öffentlich:
-- Name, Emoji und Punkte sind für alle sichtbar. id = dieselbe Prüfsumme wie in sync (wird nie herausgegeben).
CREATE TABLE IF NOT EXISTS lb_player (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lb_score (
  id TEXT NOT NULL,
  game TEXT NOT NULL,
  day TEXT NOT NULL,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (id, game, day)
);
CREATE INDEX IF NOT EXISTS lb_score_day ON lb_score(game, day, score);

-- Highscores (Allzeit-Rekorde) je Spiel und Kategorie (z. B. Older or Newer „normal.show“). Gespeichert wird nur der höchste Wert.
CREATE TABLE IF NOT EXISTS lb_high (
  id TEXT NOT NULL,
  game TEXT NOT NULL,
  cat TEXT NOT NULL,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (id, game, cat)
);
CREATE INDEX IF NOT EXISTS lb_high_cat ON lb_high(game, cat, score);

-- Aktuelle Serie der Tages-Challenge je Spiel. day = wann zuletzt gemeldet (ältere Einträge werden nicht gezeigt).
CREATE TABLE IF NOT EXISTS lb_streak (
  id TEXT NOT NULL,
  game TEXT NOT NULL,
  streak INTEGER NOT NULL,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (id, game)
);
