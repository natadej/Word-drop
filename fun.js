'use strict';
// XP, ranks, streak freezes, daily quests, trophies, gems and the shop. Loaded after app.js.
const K_FUN = 'twd.fun.v1';
let fun = load(K_FUN, {});
const saveFun = () => save(K_FUN, fun);
function F() {
  const id = profile().id;
  return (fun[id] ||= { xp: 0, gems: 20, weekXp: 0, week: '', words: 0, levels: 0, perfect: 0, bestCombo: 0, speed: 0, subjects: {},
    trophies: {}, quests: null, questSets: 0, freezes: 0, frozen: [], owned: ['🐵', '🐱', '🐶', 'candy'], avatar: '🐵', theme: 'candy', board: null });
}
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}

// ---------- ranks ----------
const TIERS = [[0, 'Bronze', '🥉'], [300, 'Silver', '🥈'], [1000, 'Gold', '🥇'], [2500, 'Ruby', '♦️'], [5000, 'Emerald', '💚'], [10000, 'Diamond', '💎'], [20000, 'Champion', '👑']];
const tierOf = (xp) => { let i = 0; while (i + 1 < TIERS.length && xp >= TIERS[i + 1][0]) i++; return i; };

// ---------- shop ----------
const AVATARS = [['🐵', 0], ['🐱', 0], ['🐶', 0], ['🐰', 30], ['🦊', 30], ['🐼', 50], ['🐯', 50], ['🐸', 50], ['🐧', 60], ['🦁', 80], ['🐙', 80], ['🐲', 120], ['🦄', 120], ['🤖', 150], ['🚀', 150], ['🦖', 200]];
const THEMES = {
  candy: { name: 'Candy', cost: 0, colors: TILE_COLORS },
  ocean: { name: 'Ocean', cost: 60, colors: ['#1e88e5', '#039be5', '#00acc1', '#00897b', '#3949ab', '#5c6bc0'] },
  jungle: { name: 'Jungle', cost: 60, colors: ['#43a047', '#7cb342', '#2e7d32', '#00897b', '#9e9d24', '#558b2f'] },
  sunset: { name: 'Sunset', cost: 80, colors: ['#f4511e', '#fb8c00', '#e53935', '#d81b60', '#8e24aa', '#ffb300'] },
  neon: { name: 'Neon', cost: 120, colors: ['#ff00a8', '#00e5ff', '#76ff03', '#d500f9', '#ff3d00', '#2979ff'] },
  gold: { name: 'Gold', cost: 250, colors: ['#c99a06', '#e0b000', '#b8860b', '#d4a017', '#a67c00'] },
};
const themeColors = () => (THEMES[F().theme] || THEMES.candy).colors;
const FREEZE_COST = 50, FREEZE_MAX = 2;

// ---------- daily quests ----------
const QUESTS = {
  read: { n: [15, 25, 40], text: (n) => `Read ${n} words` },
  combo: { n: [5, 8, 12], text: (n) => `Get ${n} in a row` },
  pass: { n: [1, 2, 3], text: (n) => `Pass ${n} level${n > 1 ? 's' : ''}` },
  fast: { n: [5, 10, 15], text: (n) => `Read ${n} words within 1 second` },
  xp: { n: [40, 80, 120], text: (n) => `Earn ${n} XP` },
  stars: { n: [2, 4, 6], text: (n) => `Collect ${n} stars` },
  subjects: { n: [2, 2, 3], text: (n) => `Play ${n} different subjects` },
};
function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function quests() {
  const f = F(), d = today();
  if (f.quests?.date !== d) {
    const ids = Object.keys(QUESTS), lvl = profile().age <= 6 ? 0 : profile().age <= 9 ? 1 : 2, pick = [];
    let h = hashStr(d + profile().id);
    while (pick.length < 3) { const id = ids[h % ids.length]; if (!pick.includes(id)) pick.push(id); h = hashStr(String(h)); }
    f.quests = { date: d, items: pick.map((id) => ({ id, n: QUESTS[id].n[lvl], p: 0 })), subj: [], chest: 'closed' };
    saveFun();
  }
  return f.quests;
}
const questsDone = () => quests().items.every((q) => q.p >= q.n);

// ---------- trophies ----------
const TROPHIES = [
  ['first', '🎉', 'First win', 'Pass your first level', (f) => f.levels >= 1],
  ['w100', '📖', '100 words', 'Read 100 words', (f) => f.words >= 100],
  ['w500', '📚', '500 words', 'Read 500 words', (f) => f.words >= 500],
  ['w2000', '🧠', 'Word wizard', 'Read 2,000 words', (f) => f.words >= 2000],
  ['s3', '🔥', 'On fire', '3-day streak', () => streak() >= 3],
  ['s7', '⚡', 'One week', '7-day streak', () => streak() >= 7],
  ['s30', '🌋', 'Unstoppable', '30-day streak', () => streak() >= 30],
  ['perfect', '💯', 'Perfect', 'Get 100% on a level', (f) => f.perfect >= 1],
  ['combo15', '🌀', 'Combo master', '15 in a row', (f) => f.bestCombo >= 15],
  ['speed', '🚀', 'Speed reader', 'Average under 1 second in a level', (f) => f.speed >= 1],
  ['explorer', '🌏', 'Explorer', 'Pass a level in Thai, English, 中文 and Math', (f) => ['th', 'en', 'zh', 'math'].every((s) => f.subjects[s])],
  ['photo', '📷', 'Bookworm', 'Add a photo of a schoolbook', () => myRefs().length > 0],
  ['quest10', '🎯', 'Quest hero', 'Finish all daily quests 10 times', (f) => f.questSets >= 10],
  ['gold', '🥇', 'Gold rank', 'Reach 1,000 XP', (f) => f.xp >= 1000],
];
const TROPHY_GEMS = 20;
function checkTrophies() {
  const f = F(), got = [];
  for (const [id, icon, name, desc, test] of TROPHIES) if (!f.trophies[id] && test(f)) { f.trophies[id] = today(); f.gems += TROPHY_GEMS; got.push({ icon, title: `Trophy: ${name}`, text: `${desc}. +${TROPHY_GEMS} 💎` }); }
  if (got.length) saveFun();
  return got;
}

// ---------- streak freeze ----------
function applyFreezes() {
  const f = F(); if (!f.freezes) return;
  const d = new Date(); d.setDate(d.getDate() - 1);
  const missed = [];
  for (let i = 0; i < 7; i++, d.setDate(d.getDate() - 1)) {
    const k = dateKey(d);
    if (dayOk(k) || isFrozen(k)) {
      if (missed.length && missed.length <= f.freezes) { f.freezes -= missed.length; f.frozen.push(...missed); saveFun(); toast(`🧊 Streak freeze used, your streak is safe!`, 3000); }
      return;
    }
    missed.push(k);
  }
}

// ---------- level end ----------
function addXp(n) { const f = F(), w = weekKey(); if (f.week !== w) { f.week = w; f.weekXp = 0; } f.xp += n; f.weekXp += n; }
function funLevelEnd(r) {
  const f = F(), tierBefore = tierOf(f.xp), q = quests(), cele = [];
  const stars = r.passed ? starCount(r.pct) : 0;
  const xp = Math.round(r.score / 10) + (r.passed ? 20 : 0) + (r.pct >= 100 ? 10 : 0);
  let gems = (r.passed ? 5 : 0) + (r.pct >= 100 ? 5 : 0);
  addXp(xp);
  f.words += r.read; f.bestCombo = Math.max(f.bestCombo, r.combo);
  if (r.passed) { f.levels++; f.subjects[r.subject] = 1; }
  if (r.pct >= 100) f.perfect++;
  if (r.passed && r.avg < 1 && r.read >= r.total - 1) f.speed++;
  if (!q.subj.includes(r.subject)) q.subj.push(r.subject);
  const before = q.items.map((x) => x.p >= x.n);
  for (const it of q.items) {
    if (it.id === 'read') it.p += r.read;
    else if (it.id === 'combo') it.p = Math.max(it.p, r.combo);
    else if (it.id === 'pass') it.p += r.passed ? 1 : 0;
    else if (it.id === 'fast') it.p += r.fast;
    else if (it.id === 'xp') it.p += xp;
    else if (it.id === 'stars') it.p += stars;
    else if (it.id === 'subjects') it.p = q.subj.length;
  }
  const newlyDone = q.items.filter((x, i) => x.p >= x.n && !before[i]);
  gems += newlyDone.length * 5;
  f.gems += gems;
  saveFun();
  const tierAfter = tierOf(f.xp);
  if (tierAfter > tierBefore) cele.push({ icon: TIERS[tierAfter][2], title: `${TIERS[tierAfter][1]} rank!`, text: `You reached ${TIERS[tierAfter][0].toLocaleString()} XP. Keep going!`, voice: 5 });
  if (questsDone() && q.chest === 'closed') cele.push({ icon: '🎁', title: 'All quests done!', text: 'Your treasure chest is ready. Open it on the Learn page.' });
  cele.push(...checkTrophies());
  $('#finRewards').innerHTML = `<span class="rw xp">+${xp} XP</span>${gems ? `<span class="rw gem">+${gems} 💎</span>` : ''}`
    + newlyDone.map((x) => `<span class="rw quest">✓ ${escapeHtml(QUESTS[x.id].text(x.n))}</span>`).join('');
  if (typeof pushScore === 'function') pushScore();
  if (cele.length) setTimeout(() => celebrate(cele, r.subject), 900);
}

// ---------- celebration ----------
let celeQueue = [], celeLang = 'th';
function celebrate(items, lang) { celeQueue.push(...items); celeLang = lang === 'mix' ? 'th' : lang || 'th'; if ($('#celebrate').classList.contains('hidden')) nextCele(); }
function nextCele() {
  const c = celeQueue.shift();
  if (!c) { $('#celebrate').classList.add('hidden'); return; }
  $('#celeIcon').textContent = c.icon; $('#celeTitle').textContent = c.title; $('#celeText').textContent = c.text;
  const conf = $('#confetti'); conf.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%'; p.style.background = TILE_COLORS[i % TILE_COLORS.length];
    p.style.animationDelay = Math.random() * 0.6 + 's'; p.style.animationDuration = 1.6 + Math.random() + 's';
    conf.appendChild(p);
  }
  $('#celebrate').classList.remove('hidden');
  beep(true, 7);
  if (c.voice != null) praise(c.voice, celeLang);
}
$('#celeOk').onclick = nextCele;

// ---------- render ----------
function renderFun() {
  const f = F(), t = tierOf(f.xp), q = quests();
  applyFreezes();
  $('#avatar').textContent = f.avatar;
  $('#streakNum').textContent = streak();
  $('#gemNum').textContent = f.gems;
  $('#tierIcon').textContent = TIERS[t][2];
  $('#xpNum').textContent = f.xp.toLocaleString();
  $('.pill.fire').classList.toggle('cold', !dayOk(today()));
  // quests
  const ql = $('#questList'); ql.innerHTML = '';
  for (const it of q.items) {
    const done = it.p >= it.n, el = document.createElement('div');
    el.className = 'quest' + (done ? ' done' : '');
    el.innerHTML = `<span class="q-text">${done ? '✅' : '🎯'} ${escapeHtml(QUESTS[it.id].text(it.n))}</span>
      <div class="q-bar"><div style="width:${Math.min(100, it.p / it.n * 100)}%"></div><span>${Math.min(it.p, it.n)}/${it.n}</span></div>`;
    ql.appendChild(el);
  }
  const chest = $('#chestBtn');
  chest.className = 'chest' + (q.chest === 'opened' ? ' opened' : questsDone() ? ' ready' : '');
  chest.textContent = q.chest === 'opened' ? '✨' : '🎁';
  // me
  $('#meAvatar').textContent = f.avatar; $('#meName').textContent = profile().name;
  $('#meTier').textContent = `${TIERS[t][2]} ${TIERS[t][1]} rank · ${f.xp.toLocaleString()} XP`;
  const nx = TIERS[t + 1];
  $('#meTierBar').style.width = nx ? ((f.xp - TIERS[t][0]) / (nx[0] - TIERS[t][0]) * 100) + '%' : '100%';
  $('#meTierNext').textContent = nx ? `${(nx[0] - f.xp).toLocaleString()} XP to ${nx[2]} ${nx[1]}` : 'Top rank!';
  $('#meStats').innerHTML = [['🔥', streak(), 'day streak'], ['📖', f.words.toLocaleString(), 'words read'], ['⭐', f.levels, 'levels passed'], ['🌀', f.bestCombo, 'best combo']]
    .map(([i, v, k]) => `<div><i>${i}</i><b>${v}</b><small>${k}</small></div>`).join('');
  $('#freezeInfo').textContent = `🧊 ${f.freezes}/${FREEZE_MAX}`;
  // trophies
  const tr = $('#trophies'); tr.innerHTML = '';
  for (const [id, icon, name, desc] of TROPHIES) {
    const el = document.createElement('button');
    el.className = 'trophy' + (f.trophies[id] ? ' got' : '');
    el.innerHTML = `<i>${f.trophies[id] ? icon : '🔒'}</i><small>${escapeHtml(name)}</small>`;
    el.onclick = () => toast(`${icon} ${name}: ${desc}${f.trophies[id] ? ` (got it ${f.trophies[id]})` : ''}`, 2800);
    tr.appendChild(el);
  }
  $('#trophyCount').textContent = `${Object.keys(f.trophies).length}/${TROPHIES.length}`;
  renderShop();
}
function buy(cost, what) {
  const f = F();
  if (f.gems < cost) { toast(`Need ${cost - f.gems} more 💎. Play levels and quests to earn gems!`); return false; }
  if (!confirm(`Buy ${what} for ${cost} 💎?`)) return false;
  f.gems -= cost; saveFun(); beep(true, 5); return true;
}
function renderShop() {
  const f = F(), box = $('#shop'); box.innerHTML = '';
  const add = (html, cls, onclick) => { const b = document.createElement('button'); b.className = 'shop-item ' + cls; b.innerHTML = html; b.onclick = onclick; box.appendChild(b); };
  const fz = f.freezes >= FREEZE_MAX;
  add(`<i>🧊</i><small>Streak freeze</small><b>${fz ? 'Full' : FREEZE_COST + ' 💎'}</b>`, fz ? 'owned' : '', () => {
    if (fz) { toast('You already have 2 streak freezes'); return; }
    if (buy(FREEZE_COST, 'a streak freeze')) { f.freezes++; saveFun(); renderHome(); toast('🧊 If you miss a day, your streak stays safe'); }
  });
  for (const [a, cost] of AVATARS) {
    const own = f.owned.includes(a) || !cost;
    add(`<i>${a}</i><b>${f.avatar === a ? 'Using' : own ? 'Use' : cost + ' 💎'}</b>`, (f.avatar === a ? 'using ' : '') + (own ? 'owned' : ''), () => {
      if (!own) { if (!buy(cost, a)) return; f.owned.push(a); }
      f.avatar = a; saveFun(); renderHome(); if (typeof pushScore === 'function') pushScore();
    });
  }
  for (const [id, th] of Object.entries(THEMES)) {
    const own = f.owned.includes(id) || !th.cost;
    add(`<span class="swatch">${th.colors.slice(0, 4).map((c) => `<em style="background:${c}"></em>`).join('')}</span><small>${th.name} tiles</small><b>${f.theme === id ? 'Using' : own ? 'Use' : th.cost + ' 💎'}</b>`,
      'theme ' + (f.theme === id ? 'using ' : '') + (own ? 'owned' : ''), () => {
        if (!own) { if (!buy(th.cost, `${th.name} tiles`)) return; f.owned.push(id); }
        f.theme = id; saveFun(); renderHome();
      });
  }
}
$('#chestBtn').onclick = () => {
  const q = quests();
  if (q.chest === 'opened') { toast('Come back tomorrow for new quests!'); return; }
  if (!questsDone()) { toast('Finish all 3 quests to open the chest 🎁'); return; }
  const g = 15 + Math.floor(Math.random() * 16);
  q.chest = 'opened'; F().gems += g; F().questSets++; saveFun();
  celebrate([{ icon: '💎', title: `+${g} gems!`, text: 'Treasure chest opened. Spend gems in the shop on the Me page.', voice: 1 }, ...checkTrophies()], settings.subject);
  renderHome();
};
$('#meEdit').onclick = () => openProfiles(false);
window.__fun = { F, quests, funLevelEnd, checkTrophies, tierOf, weekKey, applyFreezes, saveFun };
