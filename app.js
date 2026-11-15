'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const STORE_KEY = 'twd.lists.v1';
const SETTINGS_KEY = 'twd.settings.v1';
const BEST_KEY = 'twd.progress.v1';

const STARTER = {
  id: 'starter', builtin: true, name: 'Starter words (คำง่าย)',
  words: ['แม่','พ่อ','ไก่','ปลา','หมา','แมว','บ้าน','น้ำ','ข้าว','ไข่','ตา','มือ','ขา','รถ','ไฟ','ดี','กิน','นอน','เล่น','ใหญ่','เล็ก','ร้อน','เย็น','หนังสือ','โรงเรียน','ครู','เพื่อน','ช้าง','ม้า','นก','ต้นไม้','ดอกไม้','ทะเล','ภูเขา','ฝน','แดด','ลม','กล้วย','มะม่วง','ส้ม','นม','ขนม','วิ่ง','เดิน','อ่าน'],
};

const THAI_RE = /[\u0E00-\u0E7F]/;
const TILE_COLORS = ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#38d9a9','#4dabf7','#748ffc','#da77f2','#f783ac'];

// ---------- storage ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let lists = load(STORE_KEY, []);
let settings = Object.assign({ speed: '3', order: 'shuffle', mic: 'mic', listId: 'starter' }, load(SETTINGS_KEY, {}));
if (+settings.speed > 5) settings.speed = '3';
let progress = load(BEST_KEY, {});
const allLists = () => [STARTER, ...lists];
const getList = (id) => allLists().find((l) => l.id === id) || STARTER;

// ---------- utils ----------
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const normalize = (s) => (s || '').normalize('NFC').replace(/[\s\u200b\u200c\u200d.,!?'"“”‘’()\-–—ๆฯ]/g, '');
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let thaiVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  thaiVoice = vs.find((v) => /^th/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(word) {
  if (!('speechSynthesis' in window)) { toast('Speech not available on this device'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'th-TH'; u.rate = 0.8;
  if (thaiVoice) u.voice = thaiVoice;
  if (recog.active) recog.pauseFor(1500 + word.length * 250);
  speechSynthesis.speak(u);
}

// ---------- word segmentation ----------
function cleanOcr(text) {
  return text
    .replace(/([\u0E00-\u0E7F])[ \t]+(?=[\u0E00-\u0E7F])/g, '$1')
    .replace(/[|_~^`]/g, ' ');
}
function splitThai(text, dedupe) {
  text = cleanOcr(text);
  let words = [];
  if (window.Intl && Intl.Segmenter) {
    const seg = new Intl.Segmenter('th', { granularity: 'word' });
    for (const s of seg.segment(text)) if (s.isWordLike !== false && THAI_RE.test(s.segment)) words.push(s.segment.trim());
  } else {
    words = text.split(/\s+/).filter((w) => THAI_RE.test(w));
  }
  words = words.map((w) => w.replace(/[^\u0E00-\u0E7F]/g, '')).filter((w) => w && !/^[ๆฯ\u0E50-\u0E59]+$/.test(w));
  if (dedupe) words = [...new Set(words)];
  return words;
}

// ---------- share links ----------
function encodeList(l) {
  const json = JSON.stringify({ n: l.name, w: l.words });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeList(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const o = JSON.parse(decodeURIComponent(escape(atob(s))));
  return { name: String(o.n || 'Shared list'), words: (o.w || []).map(String).filter(Boolean) };
}
function checkHashImport() {
  const m = location.hash.match(/list=([^&]+)/);
  if (!m) return;
  try {
    const l = decodeList(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    const existing = lists.find((x) => x.name === l.name && x.words.join('|') === l.words.join('|'));
    if (existing) { settings.listId = existing.id; } else {
      const nl = { id: 'l' + Date.now(), name: l.name, words: l.words };
      lists.push(nl); save(STORE_KEY, lists); settings.listId = nl.id;
    }
    save(SETTINGS_KEY, settings);
    toast(`Added list “${l.name}” (${l.words.length} words)`, 3500);
  } catch (e) { toast('Could not read shared list link'); }
}

// ---------- HOME ----------
function renderHome() {
  const ul = $('#listList');
  ul.innerHTML = '';
  for (const l of allLists()) {
    const li = document.createElement('li');
    li.className = 'list-item' + (l.id === settings.listId ? ' sel' : '');
    const p = prog(l.id), n = levelCount(l);
    const passedN = Object.values(p).filter((x) => x.pct >= PASS_PCT).length;
    li.innerHTML = `<div class="name"><b>${escapeHtml(l.name)}</b><small>${l.words.length} words · ${escapeHtml(l.words.slice(0, 8).join(' '))}</small></div>
      <span class="best">${passedN}/${n} ✓</span>
      <button class="btn small" data-act="play">▶ Play</button>
      ${l.builtin ? '' : '<button class="btn small ghost" data-act="edit">✎</button><button class="btn small ghost" data-act="share" title="Share link">🔗</button>'}`;
    li.querySelector('.name').onclick = () => { settings.listId = l.id; save(SETTINGS_KEY, settings); renderHome(); };
    li.querySelector('[data-act=play]').onclick = () => { settings.listId = l.id; save(SETTINGS_KEY, settings); startGame(); };
    const e = li.querySelector('[data-act=edit]'); if (e) e.onclick = () => openEditor(l);
    const sh = li.querySelector('[data-act=share]'); if (sh) sh.onclick = () => shareList(l);
    ul.appendChild(li);
  }
  renderLevels();
  $('#setSpeed').value = settings.speed;
  $('#setOrder').value = settings.order;
  $('#setMic').value = settings.mic;
  $('#micSupport').textContent = recog.supported
    ? 'Microphone checking uses Thai speech recognition (works best in Chrome). The parent button always works too.'
    : 'This browser has no speech recognition. Use the “He read it!” button (try Chrome on Android for mic checking).';
}
async function shareList(l) {
  const url = location.origin + location.pathname + '#list=' + encodeList(l);
  try {
    if (navigator.share) { await navigator.share({ title: l.name, url }); return; }
    await navigator.clipboard.writeText(url); toast('Link copied');
  } catch { prompt('Copy this link', url); }
}
$('#setGemini').value = settings.gemini || '';
$('#setGemini').onchange = (e) => { settings.gemini = e.target.value.trim(); save(SETTINGS_KEY, settings); };
['setSpeed', 'setOrder', 'setMic'].forEach((id) => {
  $('#' + id).onchange = (e) => { settings[id.slice(3).toLowerCase()] = e.target.value; save(SETTINGS_KEY, settings); renderLevels(); };
});
$('#newListBtn').onclick = () => openEditor(null);
$$('[data-go]').forEach((b) => (b.onclick = () => { show(b.dataset.go); renderHome(); }));

// ---------- EDITOR ----------
let edit = { list: null, words: [], sel: -1 };
function openEditor(list) {
  edit = { list, words: list ? [...list.words] : [], sel: -1 };
  $('#editorTitle').textContent = list ? 'Edit word list' : 'New word list';
  $('#listName').value = list ? list.name : '';
  $('#srcText').value = '';
  $('#photoPreview').classList.add('hidden');
  $('#ocrStatus').classList.add('hidden');
  $('#deleteListBtn').classList.toggle('hidden', !list);
  $('#readerInfo').textContent = settings.gemini
    ? 'Photos are read by Gemini AI (accurate).'
    : 'Photos are read by the free built-in reader, which makes mistakes. For better accuracy, use Google Lens (below) or add a Gemini key in Game settings.';
  renderChips();
  show('editor');
}
function renderChips() {
  const c = $('#chips');
  c.innerHTML = '';
  edit.words.forEach((w, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === edit.sel ? ' sel' : '');
    b.textContent = w;
    b.onclick = () => { edit.sel = edit.sel === i ? -1 : i; renderChips(); };
    c.appendChild(b);
  });
  $('#wordCount').textContent = edit.words.length ? `(${edit.words.length})` : '';
  const has = edit.sel >= 0;
  $('#chipDel').disabled = !has; $('#chipEdit').disabled = !has; $('#chipSay').disabled = !has;
  $('#chipJoin').disabled = !(has && edit.sel < edit.words.length - 1);
}
$('#chipDel').onclick = () => { edit.words.splice(edit.sel, 1); edit.sel = Math.min(edit.sel, edit.words.length - 1); renderChips(); };
$('#chipJoin').onclick = () => { const i = edit.sel; edit.words.splice(i, 2, edit.words[i] + edit.words[i + 1]); renderChips(); };
$('#chipEdit').onclick = () => { const v = prompt('Edit word', edit.words[edit.sel]); if (v && v.trim()) { edit.words[edit.sel] = v.trim(); renderChips(); } };
$('#chipSay').onclick = () => say(edit.words[edit.sel]);
function addWord() {
  const v = $('#addWord').value.trim();
  if (!v) return;
  edit.words.push(...v.split(/\s+/)); $('#addWord').value = ''; renderChips();
}
$('#addWordBtn').onclick = addWord;
$('#addWord').onkeydown = (e) => { if (e.key === 'Enter') addWord(); };
$('#splitBtn').onclick = () => {
  const words = splitThai($('#srcText').value, $('#dedupe').checked);
  if (!words.length) { toast('No Thai words found'); return; }
  edit.words = $('#dedupe').checked ? [...new Set([...edit.words, ...words])] : [...edit.words, ...words];
  edit.sel = -1; renderChips();
  toast(`Found ${words.length} words`);
};
$('#saveListBtn').onclick = () => {
  if (!edit.words.length) { toast('Add some words first'); return; }
  const name = $('#listName').value.trim() || `List ${new Date().toLocaleDateString()}`;
  if (edit.list) { Object.assign(lists.find((l) => l.id === edit.list.id), { name, words: edit.words }); }
  else { const nl = { id: 'l' + Date.now(), name, words: edit.words }; lists.push(nl); settings.listId = nl.id; save(SETTINGS_KEY, settings); }
  save(STORE_KEY, lists);
  show('home'); renderHome(); toast('Saved');
};
$('#deleteListBtn').onclick = () => {
  if (!confirm('Delete this list?')) return;
  lists = lists.filter((l) => l.id !== edit.list.id); save(STORE_KEY, lists);
  if (settings.listId === edit.list.id) { settings.listId = 'starter'; save(SETTINGS_KEY, settings); }
  show('home'); renderHome();
};

async function prepImage(file, enhance = true) {
  const img = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
  const ctx = cv.getContext('2d');
  if (enhance) ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}
$('#pasteBtn').onclick = async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (!t || !THAI_RE.test(t)) { toast('No Thai text on the clipboard'); return; }
    $('#srcText').value = ($('#srcText').value ? $('#srcText').value + '\n' : '') + t.trim();
    $('#splitBtn').click();
  } catch {
    $('#srcText').focus();
    toast('Long-press the text box and choose Paste', 3000);
  }
};

function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
async function geminiOcr(file, msg, bar) {
  const canvas = await prepImage(file, false);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  msg.textContent = 'Gemini AI is reading the Thai text…'; bar.style.width = '40%';
  const prompt = 'Read all the Thai text in this image exactly as written (it is from a children\'s reading book or worksheet). '
    + 'Return JSON: {"text": the full Thai text in reading order, "words": the text split into individual Thai words in reading order, without punctuation, numbers or non-Thai text}.';
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: await blobToBase64(blob) } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });
  const models = [settings.geminiModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'].filter(Boolean);
  let resp, data;
  for (const model of models) {
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.gemini }, body,
    });
    data = await resp.json();
    if (resp.status !== 404) break;
  }
  if (!resp.ok) throw new Error(data.error?.message || resp.statusText);
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}';
  const out = JSON.parse(raw.replace(/^```(json)?|```$/g, ''));
  return { text: String(out.text || ''), words: (out.words || []).map((w) => String(w).replace(/[^\u0E00-\u0E7F]/g, '')).filter(Boolean) };
}

async function runOcr(file) {
  if (!file) return;
  $('#photoPreview').src = URL.createObjectURL(file);
  $('#photoPreview').classList.remove('hidden');
  $('#ocrStatus').classList.remove('hidden');
  const bar = $('#ocrBar'), msg = $('#ocrMsg');
  if (settings.gemini) {
    try {
      const { text, words } = await geminiOcr(file, msg, bar);
      if (!words.length) { msg.textContent = 'No Thai text found. Try a clearer, closer photo.'; return; }
      $('#srcText').value = ($('#srcText').value ? $('#srcText').value + '\n' : '') + text;
      const dd = $('#dedupe').checked;
      edit.words = dd ? [...new Set([...edit.words, ...words])] : [...edit.words, ...words];
      edit.sel = -1; renderChips();
      bar.style.width = '100%';
      msg.textContent = `Done: ${words.length} words. Check them, then save.`;
    } catch (e) {
      console.error(e);
      msg.textContent = 'Gemini could not read the photo: ' + (e.message || e) + '. Check the key in Game settings.';
    }
    return;
  }
  if (!window.Tesseract) { toast('Text reader still loading — try again in a moment'); return; }
  bar.style.width = '0%'; msg.textContent = 'Loading Thai reader (first time takes a little while)…';
  try {
    const canvas = await prepImage(file);
    const { data } = await Tesseract.recognize(canvas, 'tha', {
      logger: (m) => {
        if (m.status === 'recognizing text') { bar.style.width = Math.round(m.progress * 100) + '%'; msg.textContent = `Reading Thai text… ${Math.round(m.progress * 100)}%`; }
        else if (m.status) msg.textContent = m.status + '…';
      },
    });
    const text = cleanOcr(data.text).replace(/\n{2,}/g, '\n').trim();
    if (!THAI_RE.test(text)) { msg.textContent = 'No Thai text found. Try a clearer, closer photo in good light.'; return; }
    $('#srcText').value = ($('#srcText').value ? $('#srcText').value + '\n' : '') + text;
    bar.style.width = '100%';
    msg.textContent = 'Done. Check the text, fix any mistakes, then tap “Split into words”.';
    $('#splitBtn').click();
  } catch (e) {
    console.error(e);
    msg.textContent = 'Could not read the photo: ' + (e.message || e);
  }
}
$('#photoCam').onchange = (e) => { runOcr(e.target.files[0]); e.target.value = ''; };
$('#photoPick').onchange = (e) => { runOcr(e.target.files[0]); e.target.value = ''; };

// ---------- SPEECH RECOGNITION ----------
const recog = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = { supported: !!SR, active: false, onWords: null, paused: false };
  let inst = null, restartTimer = null, pauseTimer = null;
  const dot = () => $('#micDot'), heard = () => $('#heard');
  function create() {
    inst = new SR();
    inst.lang = 'th-TH';
    inst.continuous = true;
    inst.interimResults = true;
    inst.maxAlternatives = 5;
    inst.onstart = () => { dot().classList.add('on'); if (heard().textContent.startsWith('Mic')) heard().textContent = 'Listening… อ่านเลย!'; };
    inst.onresult = (ev) => {
      const alts = [];
      let display = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        display += res[0].transcript;
        for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
      }
      if (display.trim()) heard().textContent = 'Heard: ' + display.trim();
      if (r.onWords && !r.paused && r.onWords(alts)) {
        try { inst.abort(); } catch {}
      }
    };
    inst.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        r.active = false; heard().textContent = 'Mic blocked — allow microphone, or use the button';
        toast('Microphone permission was blocked', 3000);
      }
    };
    inst.onend = () => {
      dot().classList.remove('on');
      if (r.active) { clearTimeout(restartTimer); restartTimer = setTimeout(start1, r.paused ? 400 : 120); }
    };
  }
  function start1() {
    if (!r.active) return;
    if (r.paused) { restartTimer = setTimeout(start1, 300); return; }
    try { create(); inst.start(); } catch (e) { restartTimer = setTimeout(start1, 500); }
  }
  r.start = () => { if (!SR) return; r.active = true; r.paused = false; heard().textContent = 'Mic starting…'; start1(); };
  r.stop = () => {
    r.active = false; clearTimeout(restartTimer); clearTimeout(pauseTimer);
    if (inst) { try { inst.abort(); } catch {} }
    if (dot()) dot().classList.remove('on');
    if (heard()) heard().textContent = 'Mic off';
  };
  r.pauseFor = (ms) => {
    r.paused = true; if (inst) { try { inst.abort(); } catch {} }
    clearTimeout(pauseTimer); pauseTimer = setTimeout(() => { r.paused = false; }, ms);
  };
  return r;
})();

// ---------- LEVELS ----------
const LEVEL_SIZE = 15;
const PASS_PCT = 80;
const MAX_PTS = 100;
const levelCount = (l) => Math.max(1, Math.ceil(l.words.length / LEVEL_SIZE));
const levelSec = (i) => Math.max(1.8, +settings.speed - 0.1 * i);
const prog = (listId) => progress[listId] || (progress[listId] = {});
const isUnlocked = (listId, i) => i === 0 || (prog(listId)[i - 1]?.pct ?? 0) >= PASS_PCT;
function levelWords(list, i) {
  const words = list.words.slice(i * LEVEL_SIZE, (i + 1) * LEVEL_SIZE);
  const pool = shuffle(list.words.filter((w) => !words.includes(w)));
  const base = shuffle([...list.words]);
  while (words.length < LEVEL_SIZE) {
    const src = pool.length ? pool : base;
    const w = src.length ? src.shift() : list.words[words.length % list.words.length];
    if (!pool.length) base.push(w);
    if (words[words.length - 1] !== w || list.words.length === 1) words.push(w);
  }
  if (settings.order !== 'shuffle') return words;
  const hasAdjDup = (a) => a.some((w, k) => k && a[k - 1] === w);
  for (let k = 0; k < 30; k++) { shuffle(words); if (!hasAdjDup(words)) break; }
  return words;
}
function nextLevelIdx(list) {
  const p = prog(list.id);
  for (let i = 0; i < levelCount(list); i++) if ((p[i]?.pct ?? 0) < PASS_PCT) return i;
  return 0;
}
function renderLevels() {
  const list = getList(settings.listId);
  $('#levelsTitle').textContent = 'Levels: ' + list.name;
  const box = $('#levels'); box.innerHTML = '';
  const p = prog(list.id);
  for (let i = 0; i < levelCount(list); i++) {
    const unlocked = isUnlocked(list.id, i);
    const best = p[i];
    const passed = best && best.pct >= PASS_PCT;
    const b = document.createElement('button');
    b.className = 'level-card' + (unlocked ? '' : ' locked') + (passed ? ' passed' : '');
    const preview = list.words.slice(i * LEVEL_SIZE, i * LEVEL_SIZE + 4).join(' ');
    b.innerHTML = `<span class="lv">Level ${i + 1} · ${levelSec(i).toFixed(1)}s</span>
      <span class="lv-name">${unlocked ? (passed ? '✓ Passed' : 'Play') : '🔒 Locked'}</span>
      <span class="lv-desc th-text">${escapeHtml(preview)}…</span>
      ${best ? `<span class="lv-best">Best ${best.pct}% · ${best.score}</span>` : ''}`;
    if (unlocked) b.onclick = () => startGame(i);
    box.appendChild(b);
  }
}

// ---------- GAME ----------
const G = {
  running: false, paused: false, raf: 0, last: 0,
  W: 0, H: 0, cols: 3, colW: 100, rowH: 56, rows: 10,
  stacks: [], active: null, queue: [], list: null, levelIdx: 0, total: 0, resolved: 0,
  score: 0, streak: 0, bestStreak: 0, read: 0, missed: [], times: [],
  fallSec: 3, colorIdx: 0, rescueTile: null, spawnDelay: 0,
};

function layout() {
  const b = $('#board');
  G.W = b.clientWidth; G.H = b.clientHeight;
  G.colW = G.W / G.cols;
  G.rowH = Math.max(44, Math.min(70, Math.round(G.H / 9)));
  G.rows = Math.max(4, Math.floor(G.H / G.rowH));
  b.style.setProperty('--colw', G.colW + 'px');
  $('#dangerLine').style.top = (G.H - G.rows * G.rowH) + G.rowH + 'px';
}
function measure() {
  const b = $('#board');
  G.cols = b.clientWidth >= 700 ? 5 : b.clientWidth >= 480 ? 4 : 3;
  layout();
}
function stackTop(col) { return G.H - (G.stacks[col].length + 1) * G.rowH; }
function placeTile(t) {
  const x = t.col * G.colW + 3, y = t.y;
  t.el.style.width = (G.colW - 6) + 'px';
  t.el.style.height = (G.rowH - 4) + 'px';
  t.el.style.transform = `translate(${x}px, ${y}px)`;
  t.el.style.setProperty('--t', `translate(${x}px, ${y}px)`);
}
function fitFont(el, word) {
  const len = [...word.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '')].length || 1;
  const byW = (G.colW - 16) / (len * 0.62);
  const byH = G.rowH * 0.5;
  el.style.fontSize = Math.max(14, Math.min(byW, byH)) + 'px';
}
function makeTile(word, col) {
  const el = document.createElement('div');
  el.className = 'tile active';
  el.textContent = word;
  el.style.background = TILE_COLORS[G.colorIdx++ % TILE_COLORS.length];
  fitFont(el, word);
  $('#board').appendChild(el);
  return { word, col, y: -G.rowH, el, born: performance.now(), hinted: false, pausedMs: 0 };
}
function spawn() {
  const word = G.queue.shift();
  const heights = G.stacks.map((s) => s.length);
  const minH = Math.min(...heights);
  const candidates = heights.map((h, i) => [h, i]).filter(([h]) => h <= minH + 2).map(([, i]) => i);
  const col = candidates[Math.random() * candidates.length | 0];
  const t = makeTile(word, col);
  t.v = (stackTop(col) + G.rowH) / G.fallSec;
  G.active = t;
  placeTile(t);
  hud();
}
function hud() {
  $('#hudLevel').textContent = G.levelIdx + 1;
  $('#hudWord').textContent = `${Math.min(G.total, G.resolved + (G.active ? 1 : 0))}/${G.total}`;
  $('#hudScore').textContent = G.score;
  $('#hudPass').textContent = Math.ceil(G.total * MAX_PTS * PASS_PCT / 100);
}
function floatText(txt, x, y) {
  const f = document.createElement('div');
  f.className = 'float'; f.textContent = txt;
  f.style.left = Math.max(4, Math.min(G.W - 80, x)) + 'px'; f.style.top = Math.max(0, y) + 'px';
  $('#board').appendChild(f);
  setTimeout(() => f.remove(), 1000);
}
function popTile(t) {
  t.el.classList.remove('active', 'stacked', 'rescue');
  t.el.classList.add('pop');
  setTimeout(() => t.el.remove(), 450);
}
function beep(ok) {
  try {
    const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = ok ? 'triangle' : 'sawtooth';
    const now = ac.currentTime;
    if (ok) { o.frequency.setValueAtTime(660, now); o.frequency.setValueAtTime(990, now + 0.08); }
    else { o.frequency.setValueAtTime(200, now); o.frequency.linearRampToValueAtTime(110, now + 0.25); }
    g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.start(now); o.stop(now + 0.3);
  } catch {}
}
function pointsFor(sec) {
  if (sec <= 1) return MAX_PTS;
  const span = Math.max(0.5, G.fallSec - 1);
  return Math.max(60, Math.round(MAX_PTS - 40 * (sec - 1) / span));
}
function resolveWord() {
  G.active = null; G.resolved++; G.spawnDelay = 0.35;
  hud();
  if (G.resolved >= G.total) setTimeout(() => G.running && levelEnd(), 600);
}
function correctActive(byMic) {
  const t = G.active;
  if (!t || !G.running || G.paused) return;
  const sec = (performance.now() - t.born - t.pausedMs) / 1000;
  let pts = pointsFor(sec);
  if (t.hinted) pts = Math.round(pts / 2);
  G.score += pts; G.streak++; G.read++;
  G.bestStreak = Math.max(G.bestStreak, G.streak);
  G.times.push(sec);
  floatText('+' + pts + (byMic ? ' 🎤' : ''), t.col * G.colW + 8, t.y);
  popTile(t); beep(true);
  resolveWord();
}
function land() {
  const t = G.active;
  t.y = stackTop(t.col);
  t.el.classList.remove('active'); t.el.classList.add('stacked');
  t.el.onclick = () => openRescue(t);
  G.stacks[t.col].push(t);
  placeTile(t);
  if (!G.missed.includes(t.word)) G.missed.push(t.word);
  G.streak = 0;
  beep(false);
  if (G.stacks[t.col].length >= G.rows) { G.active = null; levelEnd(); return; }
  resolveWord();
}
function relayoutCol(col) {
  G.stacks[col].forEach((t, i) => { t.y = G.H - (i + 1) * G.rowH; placeTile(t); });
}
function rescue(t) {
  const col = t.col, idx = G.stacks[col].indexOf(t);
  if (idx < 0) return;
  G.stacks[col].splice(idx, 1);
  floatText('✓', col * G.colW + 8, t.y);
  popTile(t); beep(true);
  relayoutCol(col);
  closeRescue();
}
function openRescue(t) {
  if (G.rescueTile) G.rescueTile.el.classList.remove('rescue');
  G.rescueTile = t; t.el.classList.add('rescue');
  $('#rescueWord').textContent = t.word;
  $('#rescuePop').classList.remove('hidden');
}
function closeRescue() {
  if (G.rescueTile) G.rescueTile.el.classList.remove('rescue');
  G.rescueTile = null; $('#rescuePop').classList.add('hidden');
}
$('#rescueSay').onclick = () => G.rescueTile && say(G.rescueTile.word);
$('#rescueOk').onclick = () => G.rescueTile && rescue(G.rescueTile);
$('#rescueClose').onclick = closeRescue;

function onHeard(alts) {
  if (!G.running || G.paused) return false;
  const heardNorm = alts.map(normalize);
  if (G.active) {
    const w = normalize(G.active.word);
    if (heardNorm.some((h) => h.includes(w))) { correctActive(true); return true; }
  }
  for (const col of G.stacks) for (const t of col) {
    const w = normalize(t.word);
    if (w.length >= 2 && heardNorm.some((h) => h.includes(w))) { rescue(t); return true; }
  }
  return false;
}

function frame(now) {
  if (!G.running) return;
  const dt = Math.min(0.05, (now - G.last) / 1000);
  G.last = now;
  if (!G.paused) {
    if (!G.active) {
      if (G.queue.length) { G.spawnDelay -= dt; if (G.spawnDelay <= 0) spawn(); }
    } else {
      const t = G.active;
      t.y += t.v * dt;
      if (t.y >= stackTop(t.col)) land(); else placeTile(t);
    }
  } else if (G.active) {
    G.active.pausedMs += dt * 1000;
  }
  G.raf = requestAnimationFrame(frame);
}

function clearBoard() {
  $$('#board .tile, #board .float, #board .countdown').forEach((e) => e.remove());
}
function startGame(levelIdx) {
  G.list = getList(settings.listId);
  if (!G.list.words.length) { toast('This list has no words'); return; }
  if (levelIdx == null) levelIdx = nextLevelIdx(G.list);
  show('game');
  $('#overOverlay').classList.add('hidden'); $('#pauseOverlay').classList.add('hidden'); closeRescue();
  clearBoard();
  measure();
  const words = levelWords(G.list, levelIdx);
  Object.assign(G, {
    stacks: Array.from({ length: G.cols }, () => []), active: null, queue: words, levelIdx, total: words.length, resolved: 0,
    score: 0, streak: 0, bestStreak: 0, read: 0, missed: [], times: [],
    fallSec: levelSec(levelIdx), colorIdx: 0, paused: false, spawnDelay: 0,
  });
  hud();
  const useMic = settings.mic === 'mic' && recog.supported;
  recog.onWords = onHeard;
  if (useMic) recog.start(); else { recog.stop(); $('#heard').textContent = recog.supported ? 'Mic off (parent mode)' : 'No speech recognition in this browser'; }
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  countdown(3, () => { G.running = true; G.last = performance.now(); G.raf = requestAnimationFrame(frame); });
}
function countdown(n, done) {
  const c = document.createElement('div');
  c.className = 'countdown'; $('#board').appendChild(c);
  const tick = () => {
    if (n === 0) { c.remove(); done(); return; }
    c.textContent = n--; setTimeout(tick, 650);
  };
  tick();
}
function setPaused(p) {
  if (!G.running) return;
  G.paused = p;
  $('#pauseOverlay').classList.toggle('hidden', !p);
}
function stopGame() {
  G.running = false; cancelAnimationFrame(G.raf); recog.stop(); closeRescue();
}
function levelEnd() {
  stopGame();
  const max = G.total * MAX_PTS;
  const pct = Math.round(G.score / max * 100);
  const passed = pct >= PASS_PCT;
  const p = prog(G.list.id);
  const prev = p[G.levelIdx];
  const isBest = !prev || G.score > prev.score;
  if (isBest) { p[G.levelIdx] = { pct, score: G.score }; save(BEST_KEY, progress); }
  const hasNext = G.levelIdx + 1 < levelCount(G.list);
  $('#finTitle').textContent = passed ? `Level ${G.levelIdx + 1} passed! 🎉` : `Level ${G.levelIdx + 1}: try again`;
  $('#finPct').textContent = pct + '%';
  $('#finPct').classList.toggle('fail', !passed);
  $('#finBar').style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => { $('#finBar').style.width = Math.min(100, pct) + '%'; }));
  $('#finBar').style.background = passed ? 'var(--ok)' : 'var(--danger)';
  $('#finScore').textContent = `${G.score} / ${max}`;
  $('#finRead').textContent = `${G.read} / ${G.total}`;
  $('#finStreak').textContent = G.bestStreak;
  const avg = G.times.length ? (G.times.reduce((a, b) => a + b, 0) / G.times.length) : 0;
  $('#finAvg').textContent = G.times.length ? avg.toFixed(1) + 's' : '–';
  $('#finBest').textContent = (passed ? (hasNext ? `Level ${G.levelIdx + 2} unlocked. ` : 'All levels passed! ') : `Need ${PASS_PCT}% to pass. `)
    + (isBest && prev ? 'New best score!' : prev ? `Best: ${prev.pct}%` : '');
  $('#nextBtn').classList.toggle('hidden', !(passed && hasNext));
  const m = $('#finMissed'); m.innerHTML = '';
  $('#finMissedWrap').classList.toggle('hidden', !G.missed.length);
  for (const w of G.missed) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = '🔊 ' + w; b.onclick = () => say(w);
    m.appendChild(b);
  }
  $('#overOverlay').classList.remove('hidden');
}

$('#okBtn').onclick = () => correctActive(false);
$('#hintBtn').onclick = () => { if (G.active && G.running && !G.paused) { G.active.hinted = true; say(G.active.word); } };
$('#pauseBtn').onclick = () => setPaused(true);
$('#resumeBtn').onclick = () => setPaused(false);
$('#quitBtn').onclick = () => { stopGame(); show('home'); renderHome(); };
$('#againBtn').onclick = () => startGame(G.levelIdx);
$('#nextBtn').onclick = () => startGame(G.levelIdx + 1);
$('#menuBtn').onclick = () => { show('home'); renderHome(); };
document.addEventListener('keydown', (e) => {
  if (!$('#game').classList.contains('active') || !G.running) return;
  if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); correctActive(false); }
  if (e.key === 'Escape' || e.key === 'p') setPaused(!G.paused);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && G.running && !G.paused) setPaused(true); });
window.addEventListener('resize', () => {
  if (!G.running) return;
  const oldH = G.H;
  layout();
  G.stacks.forEach((s, c) => { s.forEach((t) => fitFont(t.el, t.word)); relayoutCol(c); });
  if (G.active) {
    const f = G.H / oldH;
    G.active.y *= f; G.active.v *= f;
    fitFont(G.active.el, G.active.word); placeTile(G.active);
  }
});

// ---------- init ----------
checkHashImport();
renderHome();
window.addEventListener('hashchange', () => { checkHashImport(); renderHome(); });
window.__twd = { G, splitThai, encodeList, decodeList, onHeard, correctActive, levelWords, getList };
