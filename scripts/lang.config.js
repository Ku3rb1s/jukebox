// Jukebox – Besonderheiten für scripts/check-lang.js (das Skript selbst ist gemeinsam für alle Spiele).
// Die Spielbeschreibungen stehen je Sprache in apps.json und werden hier nicht geprüft.
module.exports = {
  ignore: ['Jukebox'],
  tables: ['TAGS'],                                              // Schlagwörter auf den Spiel-Kacheln
  // Bestenliste (js/leaderboard.js): Wertungen und Stufen laufen über tx(Variable)
  add: ['Tages-Challenge', 'Highscores', 'Serien', 'Leicht', 'Normal', 'Schwer', 'Profi', 'Mit Titel', 'Nur hören',
    "Gezählt wird, wie oft du Diamant (15/15) geholt hast – mit jeder Songauswahl."],
};
