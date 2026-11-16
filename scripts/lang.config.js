// Jukebox – Besonderheiten für scripts/check-lang.js (das Skript selbst ist gemeinsam für alle Spiele).
// Die Spielbeschreibungen stehen je Sprache in apps.json und werden hier nicht geprüft.
module.exports = {
  ignore: ['Jukebox'],
  tables: ['TAGS'],                                              // Schlagwörter auf den Spiel-Kacheln
  // Bestenliste (js/leaderboard.js): Wertungen und Stufen laufen über tx(Variable)
  add: ['Tages-Challenge', 'Highscores', 'Serien', 'Leicht', 'Normal', 'Schwer', 'Profi', 'Mit Titel', 'Nur hören',
    "Gezählt wird, wie oft du Diamant (15/15) geholt hast – mit jeder Songauswahl.",
    // Needle Drop: Kategorien und Hinweis zur Highscore-Wertung
    "70er", "80er", "90er", "2000er", "2010er", "2020er", "Hip-Hop & Rap", "Deutschrap", "Deutsch-Pop", "Schlager & Party", "Aktuelle Hits", "Billionärs Club", "TikTok-Hits", "Film & Serien", "Eurovision", "Latin",
    "Bester Highscore (alle Kategorien)", "Dein höchster Rekord aus allen Kategorien und Stufen – mit 10 Songs, Leiter „Klassisch“, Antwort „Suchen“ und Modus „Standard“.",
    "Gewertet wird dein Rekord mit 10 Songs, Leiter „Klassisch“, Antwort „Suchen“ und Modus „Standard“."],
};
