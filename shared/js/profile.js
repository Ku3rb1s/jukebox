/* Gemeinsames Spielerprofil für alle Spiele auf ku3rb1s.github.io (Jukebox, Musik-Bingo, Needle Drop).
   Nur lokal auf diesem Gerät: { name, emoji } unter „jb.profile“. Fehlt der Name, wird der zuletzt im Bingo benutzte genommen. */
const Profile = (() => {
  const KEY = 'jb.profile';
  const EMOJIS = ['🎧', '🎤', '🎸', '🥁', '🎹', '🎷', '🎺', '🪩', '🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐧', '👽', '🤖', '👑', '🔥', '⭐'];
  function get() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    if (!p.name) { try { p.name = JSON.parse(localStorage.getItem('mb_name')) || ''; } catch {} }
    return { name: String(p.name || '').slice(0, 24), emoji: EMOJIS.includes(p.emoji) ? p.emoji : EMOJIS[0] };
  }
  function set(patch) {
    const p = { ...get(), ...patch };
    p.name = String(p.name || '').trim().slice(0, 24);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
    return p;
  }
  /** „🦊 Nik“ – leer, solange kein Name gesetzt ist */
  const tag = () => { const p = get(); return p.name ? p.emoji + ' ' + p.name : ''; };
  const nextEmoji = () => { const i = EMOJIS.indexOf(get().emoji); return set({ emoji: EMOJIS[(i + 1) % EMOJIS.length] }).emoji; };
  return { get, set, tag, nextEmoji, EMOJIS };
})();
