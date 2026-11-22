'use strict';
// Word Buddy pet, sticker album, daily surprise egg, streak prizes and the How to play guide. Loaded after fun.js.
const STAGES = [[0, 'Baby'], [10, 'Little'], [50, 'Kid'], [150, 'Big'], [300, 'Hero'], [600, 'Legend']];
const KINDS = {
  dragon: { name: 'Dragon', faces: ['🦎', '🦎', '🐲', '🐲', '🐉', '🐉'] },
  cat: { name: 'Cat', faces: ['🐱', '🐱', '🐈', '🐯', '🦁', '🦁'] },
  robot: { name: 'Robot', faces: ['🤖', '🤖', '🤖', '🤖', '🤖', '🤖'] },
};
const HATS = [['🧢', 20], ['👒', 30], ['🎩', 40], ['⛑️', 40], ['🎓', 60]];
const PAGE_HATS = ['🌸', '⭐', '🍀', '🌈', '🪶', '🍄', '🎈', '🦋'];
const STREAK_PRIZES = [
  [3, '🎀', '3-day streak', '+20 💎 and a bow for your Buddy', (p, f) => { f.gems += 20; own(p, '🎀'); }],
  [7, '✨', '7-day streak', 'Your Buddy can turn gold!', (p) => { if (!p.colors.includes('gold')) p.colors.push('gold'); }],
  [14, '👑', '14-day streak', 'A crown for your Buddy', (p) => own(p, '👑')],
  [30, '🌈', '30-day streak', 'Your Buddy can turn rainbow!', (p) => { if (!p.colors.includes('rainbow')) p.colors.push('rainbow'); }],
];
const PHRASES = {
  th: ['แม่ กิน ข้าว', 'แมว กิน ปลา', 'หมา นอน', 'ตา ดู รถ', 'แม่ ไป ตลาด', 'ไก่ กิน ข้าว', 'พ่อ ดู ปลา', 'ปลา ใน น้ำ', 'หมา ดู แมว', 'แม่ นอน บ้าน'],
  en: ['big red bus', 'red cat', 'big dog', 'cat and dog', 'dog run', 'cat jump', 'big sun', 'red sun'],
  zh: ['小 狗', '小 猫', '大 山', '大 人', '小 人', '大 狗'],
};
const FOOD_GEMS = 5, FOOD_MAX = 9, PAGE_GEMS = 15;

function pet() {
  const f = F();
  return (f.pet ||= { hatched: false, kind: null, stage: 0, fed: '', food: 1, hat: '', hats: [], color: '', colors: [], shiny: {}, pages: {}, eggDay: '', eggReady: '', streaks: {} });
}
function own(p, h) { if (!p.hats.includes(h)) p.hats.push(h); }
const known = () => Object.entries(myM().words).filter(([k, x]) => x.b >= KNOWN && !k.startsWith('math:'))
  .map(([k]) => { const i = k.indexOf(':'); return { key: k, lang: k.slice(0, i), text: k.slice(i + 1) }; });
const stageOf = (n) => { let i = 0; while (i + 1 < STAGES.length && n >= STAGES[i + 1][0]) i++; return i; };
const daysSince = (d) => (d ? Math.round((new Date(today()) - new Date(d)) / 864e5) : 99);
const sayLang = () => (['th', 'en', 'zh'].includes(settings.subject) ? settings.subject : 'th');
const show2 = (lang, text) => (lang === 'en' ? text : text.replace(/ /g, ''));

// ---------- album ----------
function albumPages() {
  const pages = [];
  if (typeof TH !== 'undefined') for (const l of TH.LESSONS) pages.push({ id: 'th:' + l.id, lang: 'th', title: l.title, words: [...new Set(l.words)] });
  const band = { '4-6': 'Age 4–6', '7-9': 'Age 7–9', '10-12': 'Age 10–12' }, sub = { th: 'ไทย', en: 'English', zh: '中文' };
  for (const s of ['th', 'en', 'zh']) for (const [b, ws] of Object.entries(BANKS[s] || {}))
    for (let i = 0; i < ws.length; i += 15) pages.push({ id: `${s}:${b}:${i}`, lang: s, title: `${sub[s]} · ${band[b] || b} · ${i / 15 + 1}`, words: ws.slice(i, i + 15) });
  return pages;
}
const pageGot = (pg) => pg.words.filter((w) => isKnown(pg.lang, w)).length;

// ---------- phrases ----------
function phrases() {
  const out = [];
  for (const [lang, list] of Object.entries(PHRASES)) {
    const pool = new Set(wordPool(lang).map((x) => (lang === 'en' ? x.w.toLowerCase() : x.w)));
    const knownEn = lang === 'en' ? new Set(known().filter((k) => k.lang === 'en').map((k) => k.text.toLowerCase())) : null;
    for (const ph of list) {
      const ws = ph.split(' ');
      if (!ws.every((w) => pool.has(w) || w === 'and')) continue;
      const ok = ws.map((w) => w === 'and' || (knownEn ? knownEn.has(w) : isKnown(lang, w)));
      out.push({ lang, text: ph, ws, ok, open: ok.every(Boolean) });
    }
  }
  return out;
}

// ---------- level end ----------
function petLevelEnd(r) {
  const p = pet(), f = F(), cele = [];
  for (const k of r.fastWords || []) p.shiny[k] = 1;
  if (r.passed) p.food = Math.min(FOOD_MAX, p.food + 1);
  if (!p.hatched && f.levels >= 1 && !p.toldHatch) { p.toldHatch = 1; cele.push({ icon: '🥚', title: 'Your egg is moving!', text: 'Open the Buddy tab and tap the egg to hatch your pet.' }); }
  if (p.hatched) {
    const s = stageOf(known().length);
    if (s > p.stage) { p.stage = s; cele.push({ icon: KINDS[p.kind].faces[s], title: `Your Buddy grew: ${STAGES[s][1]}!`, text: `You know ${STAGES[s][0]} words. Your Buddy can say all of them!`, voice: 5 }); }
  }
  for (const pg of albumPages()) if (!p.pages[pg.id] && pageGot(pg) === pg.words.length) {
    p.pages[pg.id] = today(); f.gems += PAGE_GEMS;
    const hat = PAGE_HATS.find((h) => !p.hats.includes(h));
    if (hat) own(p, hat);
    cele.push({ icon: '📒', title: 'Album page complete!', text: `${pg.title}: every sticker collected. +${PAGE_GEMS} 💎${hat ? ` and a ${hat} for your Buddy` : ''}` });
  }
  for (const [n, icon, name, text, give] of STREAK_PRIZES) if (!p.streaks[n] && streak() >= n) { p.streaks[n] = today(); give(p, f); cele.push({ icon, title: name + ' prize!', text }); }
  if (p.eggDay !== today() && p.eggReady !== today()) { p.eggReady = today(); cele.push({ icon: '🎁', title: 'Surprise egg!', text: "Today's surprise egg is waiting in the Buddy tab." }); }
  saveFun();
  return cele;
}

// ---------- daily surprise egg ----------
function openEgg() {
  const p = pet(), f = F();
  if (p.eggReady !== today()) { toast(p.eggDay === today() ? 'Come back tomorrow for a new egg 🎁' : 'Play one level today to get your surprise egg 🎁'); return; }
  p.eggReady = ''; p.eggDay = today();
  const roll = Math.random(), dull = known().filter((k) => !p.shiny[k.key]), hat = HATS.map(([h]) => h).find((h) => !p.hats.includes(h));
  let c;
  if (roll < 0.15 && hat) { own(p, hat); c = { icon: hat, title: 'A new hat!', text: `Your Buddy got a ${hat}. Tap it under Hats to wear it.` }; }
  else if (roll < 0.35 && dull.length) { const k = dull[Math.floor(Math.random() * dull.length)]; p.shiny[k.key] = 1; c = { icon: '✨', title: 'Shiny sticker!', text: `“${k.text}” is now shiny in your album.` }; }
  else if (roll < 0.55) { p.food = Math.min(FOOD_MAX, p.food + 2); c = { icon: '🍎', title: '+2 food', text: 'Feed your Buddy to keep it happy.' }; }
  else { const g = 10 + Math.floor(Math.random() * 16); f.gems += g; c = { icon: '💎', title: `+${g} gems!`, text: 'Spend gems on hats, food, avatars and streak freezes.' }; }
  saveFun(); celebrate([{ ...c, voice: 1 }], sayLang()); renderHome();
}

// ---------- talking ----------
let bubbleTimer = 0, listenTimer = 0, unsure = '';
function bubble(text, ms = 3500) {
  const b = $('#petBubble'); b.textContent = text; b.classList.remove('hidden');
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
function hop() { const el = $('#pet'); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
function petSay(k, prefix = '') {
  bubble(prefix + show2(k.lang, k.text)); hop(); say(show2(k.lang, k.text), k.lang);
}
function sayRandom() {
  const p = pet(), ks = known();
  if (!p.hatched) { toast('Hatch your egg first 🥚'); return; }
  if (!ks.length) { bubble('I don’t know any words yet. Teach me by playing!'); return; }
  const pref = ks.filter((k) => k.lang === sayLang());
  const k = (pref.length ? pref : ks)[Math.floor(Math.random() * (pref.length ? pref : ks).length)];
  petSay(k);
}
function stopListen() { clearTimeout(listenTimer); recog.stop(); recog.onWords = null; $('#petTalk').innerHTML = '🎤 Talk to me'; }
function petHeard(alts) {
  const ks = known(), norm = (x) => x.toLowerCase().replace(/[\s.,!?]/g, ''), said = new Set(alts.map(norm));
  const hit = ks.find((k) => said.has(norm(k.text))) || [...ks].sort((a, b) => b.text.length - a.text.length).find((k) => matches({ text: k.text, lang: k.lang }, alts));
  if (hit) { stopListen(); beep(true, 5); petSay(hit, '🎉 '); return true; }
  unsure = alts.find((a) => a.trim()) || unsure;
  clearTimeout(listenTimer);
  listenTimer = setTimeout(() => { stopListen(); bubble(`I don’t know “${unsure.trim()}” yet. Teach me by passing it in a level!`, 5000); }, 1500);
  return false;
}
function talk() {
  const p = pet();
  if (!p.hatched) { toast('Hatch your egg first 🥚'); return; }
  if (recog.onWords === petHeard) { stopListen(); return; }
  if (!recog.supported) { toast('No microphone here. Tap “Say a word” or a sticker instead.', 3000); return; }
  unsure = ''; recog.onWords = petHeard; recog.setLang(srLang(sayLang())); recog.start();
  $('#petTalk').innerHTML = '👂 Listening… (stop)'; bubble('Say a word you know!', 8000);
  listenTimer = setTimeout(() => { stopListen(); bubble('I didn’t hear anything. Try again!'); }, 8000);
}
function feed() {
  const p = pet(), f = F();
  if (!p.hatched) { toast('Hatch your egg first 🥚'); return; }
  if (daysSince(p.fed) === 0) { bubble('I’m full, thank you! 😊'); hop(); return; }
  if (p.food > 0) p.food--;
  else { if (f.gems < FOOD_GEMS) { toast(`No food. Pass a level to get 🍎, or earn ${FOOD_GEMS} 💎`); return; } f.gems -= FOOD_GEMS; }
  p.fed = today(); saveFun(); beep(true, 4); renderHome(); bubble('Yummy! 😋'); hop();
}

// ---------- render ----------
function moodOf(p) {
  if (!p.hatched) return ['', ''];
  const d = daysSince(p.fed);
  return d === 0 ? ['😊 Happy', 'happy'] : d === 1 ? ['😋 Hungry: feed me!', 'hungry'] : ['😴 Sad and sleepy: I missed you! Feed me.', 'sad'];
}
function renderPet() {
  if (!$('#tab-pet') || !profile()) return;
  const p = pet(), f = F(), ks = known(), n = ks.length, s = p.hatched ? stageOf(n) : 0;
  if (p.hatched && s > p.stage) { p.stage = s; saveFun(); }
  const [mood, cls] = moodOf(p), face = !p.hatched ? '🥚' : p.kind ? KINDS[p.kind].faces[s] : '🐣';
  const petEl = $('#pet');
  petEl.className = `pet st${s} ${cls} ${p.color || ''}${!p.hatched && f.levels >= 1 ? ' wobble' : ''}`;
  $('#petFace').textContent = face; $('#petHat').textContent = p.hatched ? p.hat : '';
  $('#petTitle').textContent = !p.hatched ? 'Your Word Buddy egg' : p.kind ? `${KINDS[p.kind].name} · ${STAGES[s][1]}` : 'Pick your Buddy!';
  $('#petMood').textContent = !p.hatched ? (f.levels >= 1 ? 'Tap the egg to hatch it!' : 'Pass your first level to hatch me!') : mood;
  const nx = STAGES[s + 1];
  $('#petBar').style.width = !p.hatched ? '0%' : nx ? ((n - STAGES[s][0]) / (nx[0] - STAGES[s][0]) * 100) + '%' : '100%';
  $('#petNext').textContent = !p.hatched ? '' : `Knows ${n} words` + (nx ? ` · ${nx[0] - n} more to grow to ${nx[1]}` : ' · fully grown!');
  $('#petFood').textContent = `🍎 ${p.food}`;
  $('#petActions').classList.toggle('hidden', !p.hatched || !p.kind);
  $('#petPick').classList.toggle('hidden', !(p.hatched && !p.kind));
  // mini buddy on Learn
  $('#buddyFace').textContent = face; $('#buddyText').textContent = !p.hatched ? (f.levels >= 1 ? 'Your egg is ready to hatch!' : 'Pass a level to hatch your egg') : p.eggReady === today() ? '🎁 Surprise egg waiting!' : mood;
  const alert = (p.eggReady === today()) || (p.hatched && cls !== 'happy') || (!p.hatched && f.levels >= 1) || (p.hatched && !p.kind);
  $('#navPet').classList.toggle('dot', alert);
  // daily
  const d = $('#dailyBox'), ready = p.eggReady === today();
  d.innerHTML = `<button id="eggBtn" class="chest${ready ? ' ready' : p.eggDay === today() ? ' opened' : ''}"><i>${ready ? '🎁' : p.eggDay === today() ? '✨' : '🥚'}</i><small>${ready ? 'Open!' : p.eggDay === today() ? 'Opened' : 'Locked'}</small></button>
    <p class="hint">${ready ? 'Tap to open today’s surprise egg!' : p.eggDay === today() ? 'Come back tomorrow for a new egg.' : 'Finish one level today to get a surprise egg.'}</p>
    <div class="streak-prizes">${STREAK_PRIZES.map(([k, icon, name]) => `<span class="${p.streaks[k] ? 'got' : ''}" title="${name}"><i>${p.streaks[k] ? icon : '🔒'}</i><small>Day ${k}</small></span>`).join('')}</div>`;
  $('#eggBtn').onclick = openEgg;
  // phrases
  const ph = phrases(), pe = $('#phrases');
  pe.innerHTML = '';
  const shown = [...ph.filter((x) => x.open), ...ph.filter((x) => !x.open).sort((a, b) => b.ok.filter(Boolean).length / b.ws.length - a.ok.filter(Boolean).length / a.ws.length).slice(0, 4)];
  for (const x of shown) {
    const b = document.createElement('button'); b.className = 'phrase' + (x.open ? ' open' : '');
    b.innerHTML = x.open ? `💬 ${escapeHtml(show2(x.lang, x.text))}` : '🔒 ' + x.ws.map((w, i) => `<em class="${x.ok[i] ? 'ok' : ''}">${escapeHtml(x.ok[i] ? w : '?')}</em>`).join(x.lang === 'en' ? ' ' : '');
    b.onclick = () => {
      if (!x.open) { toast(`Learn ${x.ok.filter((o) => !o).length} more word(s) to unlock this phrase`); return; }
      if (!p.hatched) return; petSay({ lang: x.lang, text: x.text }, '💬 ');
    };
    pe.appendChild(b);
  }
  $('#phraseCount').textContent = `${ph.filter((x) => x.open).length}/${ph.length}`;
  renderAlbum(); renderHats();
  if (typeof maybeHowto === 'function') maybeHowto();
}
let albumSel = null;
function renderAlbum() {
  const p = pet(), pages = albumPages(), sel = $('#albumSel');
  albumSel ??= (pages.find((pg) => pg.lang === sayLang()) || pages[0])?.id;
  sel.innerHTML = pages.map((pg) => `<option value="${escapeHtml(pg.id)}"${pg.id === albumSel ? ' selected' : ''}>${p.pages[pg.id] ? '✅' : '📄'} ${escapeHtml(pg.title)} (${pageGot(pg)}/${pg.words.length})</option>`).join('');
  sel.onchange = () => { albumSel = sel.value; renderAlbum(); };
  const pg = pages.find((x) => x.id === albumSel) || pages[0], g = $('#albumGrid'); g.innerHTML = '';
  if (!pg) return;
  pg.words.forEach((w, i) => {
    const k = pg.lang + ':' + w, got = isKnown(pg.lang, w), b = document.createElement('button');
    b.className = 'sticker' + (got ? ' got c' + (i % 6) : '') + (got && p.shiny[k] ? ' shiny' : '');
    b.textContent = w;
    b.onclick = () => {
      if (!got) { toast('Not collected yet: read it right in 3 levels to get this sticker'); return; }
      if (p.hatched && p.kind) { petSay({ lang: pg.lang, text: w }); } else say(w, pg.lang);
    };
    g.appendChild(b);
  });
  const total = pages.reduce((a, x) => a + x.words.length, 0), got = pages.reduce((a, x) => a + pageGot(x), 0);
  $('#albumCount').textContent = `${got}/${total} stickers · ${Object.keys(p.shiny).filter((k) => known().some((x) => x.key === k)).length} ✨`;
}
function renderHats() {
  const p = pet(), box = $('#hatShop'); box.innerHTML = '';
  const add = (h, label, cls, fn) => { const b = document.createElement('button'); b.className = 'shop-item ' + cls; b.innerHTML = `<i>${h}</i><b>${label}</b>`; b.onclick = fn; box.appendChild(b); };
  const wear = (h) => { if (!p.hatched) { toast('Hatch your egg first 🥚'); return; } p.hat = p.hat === h ? '' : h; saveFun(); renderPet(); hop(); };
  for (const [h, cost] of HATS) { const o = p.hats.includes(h); add(h, p.hat === h ? 'Wearing' : o ? 'Wear' : cost + ' 💎', (p.hat === h ? 'using ' : '') + (o ? 'owned' : ''), () => { if (!o) { if (!buy(cost, `the ${h} hat`)) return; own(p, h); } wear(h); }); }
  for (const h of p.hats.filter((x) => !HATS.some(([y]) => y === x))) add(h, p.hat === h ? 'Wearing' : 'Wear', (p.hat === h ? 'using ' : '') + 'owned', () => wear(h));
  for (const c of p.colors) add(c === 'gold' ? '🟡' : '🌈', p.color === c ? 'On' : c === 'gold' ? 'Gold' : 'Rainbow', (p.color === c ? 'using ' : '') + 'owned', () => { p.color = p.color === c ? '' : c; saveFun(); renderPet(); });
}
function hatch() {
  const p = pet(), f = F();
  if (p.hatched) return;
  if (f.levels < 1) { bubble('Pass your first level to hatch me!'); hop(); return; }
  p.hatched = true; p.fed = today(); saveFun(); beep(true, 7); renderPet();
  celebrate([{ icon: '🐣', title: 'It hatched!', text: 'Pick what your Buddy will grow into.', voice: 5 }], sayLang());
}
$('#pet').onclick = () => { const p = pet(); if (!p.hatched) hatch(); else if (p.kind) sayRandom(); };
$('#petTalk').onclick = talk;
$('#petSay').onclick = sayRandom;
$('#petFeed').onclick = feed;
$('#buddyMini').onclick = () => showTab('pet');
$$('#petPick [data-kind]').forEach((b) => (b.onclick = () => {
  const p = pet(); p.kind = b.dataset.kind; p.stage = stageOf(known().length); saveFun(); renderPet();
  bubble(known().length ? `Hi! I already know ${known().length} words from you!` : 'Hi! Teach me words by playing levels!', 4500); hop();
}));

// ---------- how to play ----------
const HOWTO = [
  ['🗣️', 'Read the word out loud', 'Words fall from the top. Say each word before it lands. No microphone? A grown-up taps ✓ Read it.'],
  ['⭐', 'Score and stars', 'Read faster to get more points. Get 80% to pass the level and win 1 to 3 stars. Gold words and 👑 boss words give ×2.'],
  ['🏰', 'Castle and Tower', 'Levels 1–3: a word that hits the castle costs a ❤️. From level 4: a missed word turns to stone. Read 3 in a row to smash a stone. Keep the tower below the red line!'],
  ['💎', 'What points do', '⚡ XP raises your rank on the leaderboard. 💎 Gems buy food and hats for your Buddy, avatars and streak freezes.'],
  ['🐣', 'Grow your Word Buddy', 'Every word you learn grows your Buddy and adds a sticker to your album. Your Buddy can only say words you have learned!'],
  ['🎁', 'Come back every day', 'Your first level each day gives a surprise egg. Buddy gets hungry if you skip a day. Day 3, 7, 14 and 30 streaks win prizes.'],
];
let howI = 0;
function howShow() {
  const [icon, title, text] = HOWTO[howI];
  $('#howIcon').textContent = icon; $('#howTitle').textContent = title; $('#howText').textContent = text;
  $('#howDots').innerHTML = HOWTO.map((_, i) => `<i class="${i === howI ? 'on' : ''}"></i>`).join('');
  $('#howBack').classList.toggle('invisible', howI === 0);
  $('#howNext').textContent = howI === HOWTO.length - 1 ? "Let's play! ▶" : 'Next ›';
}
function openHow() { howI = 0; howShow(); $('#howto').classList.remove('hidden'); }
function closeHow() { $('#howto').classList.add('hidden'); localStorage.setItem('twd.howto.v1', '1'); }
$('#howNext').onclick = () => { if (howI === HOWTO.length - 1) closeHow(); else { howI++; howShow(); } };
$('#howBack').onclick = () => { if (howI > 0) { howI--; howShow(); } };
$('#howSkip').onclick = closeHow;
$$('.how-btn').forEach((b) => (b.onclick = openHow));
function maybeHowto() { if ($('#howto').classList.contains('hidden') && !localStorage.getItem('twd.howto.v1') && profiles.length && $('#home').classList.contains('active')) openHow(); }
window.__pet = { pet, known, stageOf, albumPages, phrases, petLevelEnd, openEgg, hatch, feed, openHow, petHeard };
setTimeout(maybeHowto, 400);
renderPet();
