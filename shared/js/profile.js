/* Gemeinsames Spielerprofil für alle Spiele auf ku3rb1s.github.io (Jukebox, Needle Drop, Older or Newer, Gold Record).
   Nur lokal auf diesem Gerät: { name, emoji } unter „jb.profile“. Fehlt der Name, wird der zuletzt im Bingo benutzte genommen.
   Avatar: Profile.pick(fertig) öffnet ein Auswahl-Fenster mit allen Emojis (Gruppen Tiere, Winter & Weihnachten, Musik, Essen & Trinken, Sonstiges).
   Exklusive Avatare (SPECIAL) gibt es nur über den Adventskalender (On Tour, Tür 6, 12, 18, 24): freigeschaltet in „jb.avatars“
   = { emoji: Datum } (abgeglichen als „union“, siehe RULES in js/sync.js), danach in der Gruppe „Aus dem Adventskalender“. */
const Profile = (() => {
  const KEY = 'jb.profile';
  // Alle früheren Avatare sind weiter dabei. Die Gruppen dienen nur der Anzeige im Auswahl-Fenster.
  const GROUPS = [
    ['Tiere', ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐧', '🐶', '🐱', '🐭', '🐹', '🐰', '🐻', '🐨', '🐯', '🐮', '🐷', '🐵', '🐔', '🐤',
      '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🐝', '🦋', '🐌', '🐞', '🐢', '🐍', '🦖', '🦕', '🦀', '🐠', '🐬', '🐳', '🦈',
      '🦭', '🐊', '🦒', '🦓', '🦘', '🦥', '🦦', '🦔', '🦩', '🦜', '🦚', '🐲', '🐘', '🦛', '🐪', '🦙', '🐑', '🐐', '🦌', '🐈‍⬛',
      '🐇', '🦝', '🦫', '🦨', '🦡', '🦍', '🦧', '🐆', '🐅', '🦏', '🦣', '🦬', '🐓', '🦃', '🦢', '🦤', '🐦', '🐋', '🐡', '🦑',
      '🐚', '🦞', '🦐', '🐛', '🐜', '🦗', '🦂', '🦎', '🐉', '🐩']],
    ['Winter & Weihnachten', ['🎄', '🎅', '🤶', '⛄', '❄️', '🎁', '🔔', '🕯️', '🌟', '✨', '🍪', '🥛', '🧦', '🧣', '🧤', '🛷', '🎿', '🏂', '🥶', '☕',
      '🍫', '🎆', '🎇', '🥂', '🍾']],
    ['Musik', ['🎧', '🎤', '🎸', '🥁', '🎹', '🎷', '🎺', '🎻', '🪕', '🪗', '🎼', '🎵', '🪩', '📻', '💿']],
    ['Essen & Trinken', ['🍕', '🍩', '🍔', '🍟', '🌭', '🌮', '🍣', '🍜', '🥨', '🥐', '🧁', '🍰', '🍦', '🍿', '🍉', '🍓', '🍒', '🍍', '🥑', '🥥',
      '🍋', '🧃', '🧋', '🍭']],
    ['Sonstiges', ['👽', '🤖', '👑', '🔥', '⭐', '🌈', '🚀', '⚡', '💎', '🎈', '😎', '🤠', '🥳', '👻', '🎃', '🌵', '🍄', '🌙',
      '🤓', '🤩', '🥸', '🤡', '💀', '🧙', '🧛', '🧜', '🦸', '🥷', '⚽', '🏀', '🎮', '🎲', '🎯', '🛹', '🏆', '🌻', '🌸', '🍀', '🌍', '🪐']],
  ];
  const EMOJIS = GROUPS.flatMap(([, list]) => list);
  const SPECIAL = ['🎅🏻', '☃️', '🧑‍🎄', '🌠'];
  const unlocked = () => { try { const u = JSON.parse(localStorage.getItem('jb.avatars')); return u && typeof u === 'object' ? u : {}; } catch { return {}; } };
  const isUnlocked = e => SPECIAL.includes(e) && !!unlocked()[e];
  const unlock = e => { if (!SPECIAL.includes(e) || isUnlocked(e)) return; const u = unlocked(); u[e] = new Date().toISOString().slice(0, 10); try { localStorage.setItem('jb.avatars', JSON.stringify(u)); } catch {} };
  const allowed = e => EMOJIS.includes(e) || isUnlocked(e);
  const DEFAULT = '🎧';
  function get() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    if (!p.name) { try { p.name = JSON.parse(localStorage.getItem('mb_name')) || ''; } catch {} }
    return { name: String(p.name || '').slice(0, 24), emoji: allowed(p.emoji) ? p.emoji : DEFAULT };
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

  /** Auswahl-Fenster: Tippen auf ein Emoji übernimmt es und schließt; fertig(emoji) wird danach aufgerufen */
  function pick(done) {
    const t = s => (self.tx ? tx(s) : s), cur = get().emoji;
    const d = document.createElement('dialog');
    d.className = 'sheet emo-pick';
    d.innerHTML = `<div class="sheet-head"><span class="grab"></span><span></span><div class="nav-title">${t('Avatar wählen')}</div>
      <button class="nav-done" type="button" data-close>${t('Fertig')}</button></div>
      <div class="sheet-body">${[...(SPECIAL.some(isUnlocked) ? [['Aus dem Adventskalender', SPECIAL.filter(isUnlocked)]] : []), ...GROUPS].map(([name, list]) => `<div class="group-h">${t(name)}</div>
        <div class="emo-grid">${list.map(e => `<button type="button" class="${e === cur ? 'on' : ''}" data-emo="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`).join('')}</div>`;
    // Direkt aufräumen statt auf das „close“-Ereignis zu warten (kommt in manchen Browsern verzögert) – „close“ nur noch für Esc
    let ended = false;
    const finish = () => { if (ended) return; ended = true; if (d.open) d.close(); d.remove(); try { done?.(get().emoji); } catch {} };
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-emo]');
      if (b) { set({ emoji: b.dataset.emo }); return finish(); }
      if (e.target === d || e.target.closest('[data-close]')) finish();
    });
    d.addEventListener('close', finish);
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('.emo-grid .on')?.scrollIntoView({ block: 'center' });
  }
  return { get, set, tag, nextEmoji, pick, EMOJIS, SPECIAL, isUnlocked, unlock };
})();
