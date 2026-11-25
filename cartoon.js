/* Presentation only, plus opt-in comparison scenes. No scoring/rule changes. */
document.addEventListener('DOMContentLoaded', () => {
  const cartoon = document.documentElement.classList.contains('cartoon');
  if (cartoon) {
    const hero = document.createElement('section');
    hero.className = 'story-hero';
    hero.setAttribute('aria-label', 'Word Drop reading adventure');
    hero.innerHTML = '<div class="story-copy"><span class="story-kicker">A little reading. A big adventure.</span><h1>Word Drop</h1><p>Read a word.<br>Grow a little magic.</p></div><img src="art/dragon.svg" alt="" width="190" height="190">';
    document.querySelector('#tab-learn').prepend(hero);

    // Keep the illustrated Buddy faithful to the selected species and egg state.
    const face = document.querySelector('#petFace');
    const syncBuddyArt = () => {
      const dragon = profiles.length && pet().hatched && pet().kind === 'dragon';
      face.dataset.artKind = dragon ? 'dragon' : '';
      if (dragon) document.querySelector('#pet').setAttribute('aria-label', document.querySelector('#petTitle').textContent);
      else document.querySelector('#pet').removeAttribute('aria-label');
    };
    new MutationObserver(syncBuddyArt).observe(face, { childList: true });
    syncBuddyArt();
  }

  if (!window.wordDropPreviewStorage) return;
  // Samples never authenticate, upload photos, join or submit to the leaderboard.
  ['cloudBtn', 'cloudSave', 'cloudSignIn', 'joinBtn'].forEach((id) => {
    const button = document.getElementById(id);
    button.disabled = true; button.title = 'Unavailable in this sample';
  });
  document.querySelector('#cloudBox').hidden = true;
  const scene = new URLSearchParams(location.search).get('scene') || 'learn';
  if (['learn', 'lists', 'pet', 'ranks', 'me'].includes(scene)) showTab(scene);
  if (scene === 'game') {
    // A deterministic still, rendered with the game's own layout/tile functions.
    // The comparison header labels this as a still, not a playable level.
    show('game');
    Object.assign(G, { list: currentList(), mode: modeFor(2), levelIdx: 2, total: 15, resolved: 6, score: 580, hearts: 3, colorIdx: 0 });
    document.querySelector('#board').classList.add('castle-mode');
    measure(); renderCastle(); hud();
    const tile = makeTile({ text: 'sun', lang: 'en' }, 0);
    tile.y = G.H * .35;
    tile.el.style.background = cartoon ? '#f4d89c' : '#ff6b6b';
    placeTile(tile);
    document.querySelector('#heard').textContent = 'Read the word aloud before it reaches the castle';
  }
});
