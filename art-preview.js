/* The art direction is branch-only. ?look=original renders the existing skin. */
(() => {
  const query = new URLSearchParams(location.search);
  document.documentElement.classList.toggle('cartoon', query.get('look') !== 'original');
  if (query.get('artPreview') !== '1') return;

  // An in-memory Storage interface: no reads or writes to real learner data.
  const data = new Map();
  window.wordDropPreviewStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  const seed = (key, value) => data.set(key, JSON.stringify(value));
  const localDate = (offset = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const day = localDate();
  seed('twd.howto.v1', 1);
  seed('twd.profiles.v1', [{ id: 'art-sample', name: 'Milo', age: 7, speed: '6', goal: '2', mathLang: 'en-US', order: 'ordered', mic: 'off', warmup: 'off' }]);
  seed('twd.settings.v1', { subject: 'en', profileId: 'art-sample', listId: { en: 'art-words' } });
  const words = ['sun', 'cat', 'dog', 'red', 'big', 'bus', 'run', 'jump', 'book', 'tree', 'bird', 'star', 'moon', 'fish', 'home'];
  seed('twd.lists.v1', [{ id: 'art-words', subject: 'en', name: 'My first adventure', words: [...words, ...words, ...words, ...words] }]);
  seed('twd.progress.v2', { 'art-sample': { 'art-words': { 0: { pct: 100, score: 1500 }, 1: { pct: 90, score: 1350 } } } });
  seed('twd.mastery.v1', { 'art-sample': { skill: { en: 1 }, words: Object.fromEntries(words.slice(0, 8).map((w) => ['en:' + w, { b: 3 }])) } });
  seed('twd.days.v1', { 'art-sample': Object.fromEntries([0, -1, -2, -3, -4].map((n) => [localDate(n), { passed: n ? 2 : 1, played: 2, read: 15, score: 1350 }])) });
  seed('twd.fun.v1', { 'art-sample': {
    xp: 480, gems: 85, weekXp: 180, week: '', words: 75, levels: 5, perfect: 2, bestCombo: 12, speed: 24, subjects: { en: 5 },
    trophies: { first: day }, questSets: 1, freezes: 1, frozen: [], owned: ['🐵', '🐱', '🐶', 'candy'], avatar: '🐱', theme: 'candy', board: { nick: 'Brave Dragon 12' },
    quests: { date: day, items: [{ id: 'read', n: 25, p: 15 }, { id: 'combo', n: 8, p: 5 }, { id: 'pass', n: 2, p: 1 }], subj: [], chest: 'closed' },
    pet: { hatched: true, kind: 'dragon', stage: 0, fed: day, food: 3, hat: '', hats: [], color: '', colors: [], shiny: {}, pages: {}, eggDay: '', eggReady: day, streaks: {} },
  } });
})();
