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
