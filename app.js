'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------- constants ----------
const K = { lists: 'twd.lists.v1', settings: 'twd.settings.v1', progress: 'twd.progress.v2', profiles: 'twd.profiles.v1', days: 'twd.days.v1', refs: 'twd.refs.v1', mastery: 'twd.mastery.v1', cloud: 'twd.cloud.v1' };
const LEVEL_SIZE = 15, PASS_PCT = 80, MAX_PTS = 100;
const SUBJECTS = { th: 'Thai', en: 'English', zh: 'Chinese', math: 'Math', mix: 'Mix' };
const LANG_NAME = { th: 'Thai', en: 'English', zh: 'Simplified Chinese' };
const SR_LANG = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };
const OCR_LANG = { th: 'tha', en: 'eng', zh: 'chi_sim', math: 'eng' };
const THAI_RE = /[\u0E00-\u0E7F]/, HAN_RE = /[\u3400-\u9FFF]/, LATIN_RE = /[A-Za-z]/;
const TILE_COLORS = ['#ff6b6b','#ffa94d','#ffd43b','#69db7c','#38d9a9','#4dabf7','#748ffc','#da77f2','#f783ac'];

// ---------- storage ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let Cloud = null, cloudQuiet = false;
const save = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); cloudDirty(k); };
let lists = load(K.lists, []).map((l) => ({ subject: 'th', ...l }));
let settings = Object.assign({ subject: 'th', listId: {} }, load(K.settings, {}));
if (typeof settings.listId !== 'object' || !settings.listId) settings.listId = {};
let profiles = load(K.profiles, []);
let progress = load(K.progress, {});
let days = load(K.days, {});
let refs = load(K.refs, {});
let mastery = load(K.mastery, {});
const oldProgress = load('twd.progress.v1', null);
const saveAll = () => { save(K.lists, lists); save(K.settings, settings); save(K.profiles, profiles); save(K.progress, progress); save(K.days, days); };

const newProfile = (name, age) => ({ id: 'p' + Date.now(), name, age, speed: '3', goal: '2', mathLang: 'en-US', order: 'shuffle', mic: 'mic' });
const profile = () => profiles.find((p) => p.id === settings.profileId) || profiles[0];
const band = (age) => (age <= 6 ? '4-6' : age <= 9 ? '7-9' : '10-12');

// ---------- book photos (difficulty references) ----------
const gradeBand = (g) => (g <= 1 ? '4-6' : g <= 4 ? '7-9' : '10-12');
const gradeName = (g) => (g <= 0 ? 'Kindergarten' : 'Grade ' + g);
const myRefs = (subject) => (refs[profile().id] || []).filter((r) => !subject || r.subject === subject);
function bookGrade(subject) {
  const rs = myRefs(subject).filter((r) => r.grade != null).slice(-6);
  if (!rs.length) return null;
  let w = 0, sum = 0;
  rs.forEach((r, i) => { w += i + 1; sum += (i + 1) * r.grade; });
  return Math.round(sum / w);
}
const diffBand = (subject) => { const g = bookGrade(subject); return g == null ? band(profile().age) : gradeBand(g); };
function mathOffset() { const g = bookGrade('math'); return g == null ? 0 : Math.max(0, g <= 1 ? g : g <= 4 ? g - 2 : g - 5); }
function guessGrade(items, subject) {
  if (!items.length) return null;
  if (subject === 'math') {
    const es = items.map(parseExpr).filter(Boolean);
    if (!es.length) return null;
    const max = Math.max(...es.map((e) => { const [a, , b] = e.text.split(' '); return Math.max(+a, +b); }));
    if (es.some((e) => /[×÷]/.test(e.text))) return max > 12 ? 5 : 3;
    return max <= 5 ? 0 : max <= 20 ? 1 : max <= 100 ? 2 : 4;
  }
  const len = (w) => [...w].filter((c) => !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(c)).length;
  const avg = items.reduce((a, w) => a + len(w), 0) / items.length;
  const steps = { th: [2.5, 3.5, 4.5, 6], en: [3.5, 4.5, 5.5, 6.5], zh: [1.3, 1.8, 2.3, 3] }[subject];
  return 1 + steps.filter((x) => avg > x).length;
}
function saveRefs() {
  for (;;) {
    try { localStorage.setItem(K.refs, JSON.stringify(refs)); cloudDirty(K.refs); return; } catch (e) {
      const withThumb = Object.values(refs).flat().filter((r) => r.thumb).sort((a, b) => a.id.localeCompare(b.id));
      if (!withThumb.length) throw e;
      withThumb[0].thumb = null;
    }
  }
}
function thumbOf(canvas) {
  const k = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}
function photoOf(canvas) {
  const k = Math.min(1, 1400 / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  let q = 0.75, url = c.toDataURL('image/jpeg', q);
  while (url.length > 900000 && q > 0.3) url = c.toDataURL('image/jpeg', (q -= 0.1));
  return url;
}
const idb = (() => {
  let dbp;
  const db = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('twd', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, f) => {
    const d = await db();
    return new Promise((res, rej) => { const t = d.transaction('photos', mode), q = f(t.objectStore('photos')); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
  };
  return { get: (k) => tx('readonly', (st) => st.get(k)).catch(() => null), put: (k, v) => tx('readwrite', (st) => st.put(v, k)).catch(() => {}), del: (k) => tx('readwrite', (st) => st.delete(k)).catch(() => {}) };
})();
async function refPhoto(r) {
  let url = await idb.get(r.id);
  if (!url && Cloud) { url = await Cloud.getPhoto(r.id).catch(() => null); if (url) idb.put(r.id, url); }
  return url || r.thumb;
}
function deleteRefs(ids) {
  const del = new Set(ids);
  for (const pid of Object.keys(refs)) refs[pid] = refs[pid].filter((r) => !del.has(r.id));
  ids.forEach((id) => idb.del(id));
  saveRefs();
}
function deleteList(l) {
  lists = lists.filter((x) => x.id !== l.id);
  if (settings.listId[l.subject] === l.id) delete settings.listId[l.subject];
  for (const p of Object.values(progress)) delete p[l.id];
  saveAll();
}
function addRef(subject, canvas, items, more, grade) {
  if (!items.length && !more.length) return null;
  const g = grade !== null && grade !== '' && Number.isFinite(+grade) ? Math.max(0, Math.min(12, Math.round(+grade))) : guessGrade(items, subject);
  const r = { id: 'r' + Date.now(), date: today(), subject, thumb: thumbOf(canvas), items, more, grade: g };
  (refs[profile().id] ||= []).push(r);
  edit.refIds.push(r.id);
  idb.put(r.id, photoOf(canvas)).then(cloudPhotos);
  saveRefs();
  return r;
}
function bookList(subject) {
  const words = [...new Set(myRefs(subject).flatMap((r) => [...r.items, ...(r.more || [])]))];
  if (!words.length) return null;
  return { id: `book-${subject}`, builtin: true, book: true, smart: true, subject, name: `📚 From ${profile().name}'s books`, words };
}

// ---------- mastery: each word is learned after KNOWN good rounds; the reading level follows what he can read ----------
const KNOWN = 3, MAX_SKILL = 7;
const myM = () => (mastery[profile().id] ||= { skill: {}, words: {} });
const mKey = (lang, w) => lang + ':' + w;
const wordRec = (lang, w) => myM().words[mKey(lang, w)];
const isKnown = (lang, w) => (wordRec(lang, w)?.b ?? 0) >= KNOWN;
const startSkill = (s) => { const g = bookGrade(s); return g ?? Math.max(0, Math.min(5, profile().age - 6)); };
const skillOf = (s) => myM().skill[s] ?? startSkill(s);
const skillName = (s) => { const v = skillOf(s); return `${gradeName(Math.round(v))} (${v.toFixed(1)})`; };
function wordPool(subject) { // [{w, d}], d = difficulty on a grade scale
  const out = new Map(), add = (w, d) => { if (w && !out.has(w)) out.set(w, d); };
  for (const r of myRefs(subject)) [...r.items, ...(r.more || [])].forEach((w) => add(w, r.grade ?? 1));
  if (subject === 'th' && typeof TH !== 'undefined') for (const l of TH.LESSONS) if (!l.letters) l.words.forEach((w) => add(w, l.d));
  const base = { '4-6': 0, '7-9': 2, '10-12': 4 };
  for (const [b, ws] of Object.entries(BANKS[subject] || {})) ws.forEach((w, i) => add(w, base[b] + 2 * i / ws.length));
  return [...out].map(([w, d]) => ({ w, d }));
}
function smartWords(subject, pool, n) {
  const S = skillOf(subject), rec = (x) => wordRec(subject, x.w), jit = () => Math.random() * 0.6;
  const learning = pool.filter((x) => rec(x) && rec(x).b < KNOWN), fresh = pool.filter((x) => !rec(x)), known = pool.filter((x) => rec(x)?.b >= KNOWN);
  const out = [], take = (arr, k) => { for (const x of arr) { if (out.length >= n || k <= 0) break; if (!out.includes(x)) { out.push(x); k--; } } };
  const by = (f) => (a, b) => f(a) - f(b);
  take([...learning].sort(by((x) => rec(x).b - (rec(x).f || 0) * 0.5 + jit())), Math.round(n * 0.4)); // words he is still learning come back
  take(shuffle(fresh.filter((x) => x.d > S + 0.5 && x.d <= S + 2)), 2); // a couple of stretch words
  take([...known].sort(by((x) => rec(x).t)), 1); // one old word to check he still remembers it
  take([...fresh, ...learning].sort(by((x) => Math.abs(x.d - S) + jit())), n); // new words at his level
  take([...known].sort(by((x) => rec(x).t + Math.random() * 864e5)), n);
  return shuffle(out.map((x) => x.w));
}
function learn(results) { // results: Map lang:word → 1 read, 0.5 hint/late, 0 missed
  const m = myM(), now = Date.now(), learned = [], before = {}, pools = {};
  for (const [k, r] of results) {
    const i = k.indexOf(':'), lang = k.slice(0, i), w = k.slice(i + 1);
    const x = (m.words[k] ||= { b: 0, n: 0, f: 0, t: 0 }), was = x.b >= KNOWN;
    x.n++; x.t = now;
    if (r === 1) x.b = Math.min(6, x.b + 1); else if (r === 0) { x.b = 0; x.f++; } else x.b = Math.min(x.b, 1);
    if (!was && x.b >= KNOWN) learned.push(w);
    const pool = (pools[lang] ||= wordPool(lang));
    const d = pool.find((p) => p.w === w)?.d ?? guessGrade([w], lang) ?? skillOf(lang);
    const cur = m.skill[lang] ?? (before[lang] ??= skillOf(lang));
    before[lang] ??= cur;
    const expect = 1 / (1 + Math.exp(-1.6 * (cur - d + 0.7)));
    m.skill[lang] = Math.max(0, Math.min(MAX_SKILL, cur + 0.1 * (r - expect)));
  }
  for (const lang of Object.keys(before)) { // move up once most words at his level are known
    const S = m.skill[lang], near = pools[lang].filter((p) => p.d <= S + 0.3);
    if (near.length >= 8 && near.filter((p) => (m.words[mKey(lang, p.w)]?.b ?? 0) >= KNOWN).length >= near.length * 0.8) m.skill[lang] = Math.min(MAX_SKILL, S + 0.25);
  }
  save(K.mastery, mastery);
  return { learned, change: Object.keys(before).map((l) => [l, before[l], m.skill[l]]) };
}

// ---------- utils ----------
function show(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); window.scrollTo(0, 0); }
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normalize = (s) => (s || '').normalize('NFC').toLowerCase().replace(/[\s\u200b\u200c\u200d.,!?'"“”‘’()\-–—ๆฯ，。！？、]/g, '');
const today = () => dateKey(new Date());
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const srLang = (lang) => (lang === 'math' ? profile().mathLang : SR_LANG[lang]);

// ---------- math ----------
function parseExpr(s) {
  const m = String(s).replace(/−/g, '-').match(/^\s*(\d+(?:\.\d+)?)\s*([+\-×x*÷/:])\s*(\d+(?:\.\d+)?)\s*(?:=\s*\??\s*)?$/i);
  if (!m) return null;
  const a = +m[1], b = +m[3], op = { '+': '+', '-': '−', '×': '×', x: '×', X: '×', '*': '×', '÷': '÷', '/': '÷', ':': '÷' }[m[2]];
  const v = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b ? a / b : NaN;
  return { text: `${a} ${op} ${b}`, answer: Math.round(v * 100) / 100 };
}
function extractExprs(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*([+\-−×xX*÷/])\s*(\d+(?:\.\d+)?)/g;
  let m; while ((m = re.exec(text))) { const e = parseExpr(m[1] + m[2] + m[3]); if (e) out.push(e.text); }
  return out;
}
function mathItem(b, lvl) {
  const add = (max) => { const a = rand(0, max); return `${a} + ${rand(0, max - a)}`; };
  const sub = (max) => { const a = rand(1, max); return `${a} − ${rand(0, a)}`; };
  const addsub = (max) => (Math.random() < 0.5 ? add(max) : sub(max));
  const mul = (lo, hi, n = 10) => `${rand(lo, hi)} × ${rand(1, n)}`;
  const div = (lo, hi) => { const d = rand(lo, hi), q = rand(1, hi); return `${d * q} ÷ ${d}`; };
  const pick = (...fs) => fs[rand(0, fs.length - 1)]();
  if (b === '4-6') return [() => add(5), () => add(10), () => sub(10), () => addsub(10)][lvl]?.() ?? addsub(20);
  if (b === '7-9') return [() => addsub(20), () => addsub(50), () => `${[2, 5, 10][rand(0, 2)]} × ${rand(1, 10)}`, () => mul(2, 9), () => div(2, 9)][lvl]?.()
    ?? pick(() => addsub(100), () => mul(2, 10), () => div(2, 10));
  return [() => mul(2, 12, 12), () => div(2, 12), () => addsub(1000), () => `${rand(11, 99)} × ${rand(2, 9)}`][lvl]?.()
    ?? pick(() => mul(2, 12, 12), () => div(2, 12), () => addsub(1000), () => `${rand(11, 99)} × ${rand(2, 9)}`);
}
const EN_NUM = { zero: 0, oh: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const TH_D = { 'ศูนย์': 0, 'หนึ่ง': 1, 'เอ็ด': 1, 'สอง': 2, 'ยี่': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9 };
const TH_U = { 'สิบ': 10, 'ร้อย': 100, 'พัน': 1000, 'หมื่น': 10000 };
const ZH_D = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const ZH_U = { '十': 10, '百': 100, '千': 1000, '万': 10000 };
function unitParse(toks, D, U) {
  let total = 0, digit = null;
  for (const t of toks) { if (t in D) digit = D[t]; else { total += (digit ?? 1) * U[t]; digit = null; } }
  return total + (digit ?? 0);
}
function numbersIn(s) {
  const found = [];
  s = s.replace(/[๐-๙]/g, (c) => c.charCodeAt(0) - 0x0E50).toLowerCase();
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) found.push([m.index, +m[0]]);
  const thTok = /ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น/g;
  for (const m of s.matchAll(/(?:ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น)+/g)) found.push([m.index, unitParse(m[0].match(thTok), TH_D, TH_U)]);
  for (const m of s.matchAll(/[零〇一二两三四五六七八九十百千万]+/g)) found.push([m.index, unitParse([...m[0]], ZH_D, ZH_U)]);
  const re = /[a-z]+/g; let m, run = null;
  const flush = () => { if (run) { found.push([run.i, run.total + run.cur]); run = null; } };
  while ((m = re.exec(s))) {
    const w = m[0];
    if (w in EN_NUM) { run = run || { i: m.index, total: 0, cur: 0 }; run.cur += EN_NUM[w]; }
    else if (w === 'hundred' && run) run.cur *= 100;
    else if (w === 'thousand' && run) { run.total += run.cur * 1000; run.cur = 0; }
    else if (w !== 'and' || !run) flush();
  }
  flush();
  return found.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

// ---------- items ----------
function itemFor(text, lang) {
  if (lang === 'math') { const e = parseExpr(text); return e ? { text: e.text + ' = ?', lang, answer: e.answer, plain: e.text } : null; }
  const t = lang === 'th' && typeof TH !== 'undefined' && TH.letterKind(text) ? { say: TH.sayFor(text) || undefined, ...TH.accept(text) } : {};
  return { text, lang, ...t };
}
function thaiNum(n) {
  if (!n || n >= 1e7) return n ? String(n) : 'ศูนย์';
  const D = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'], U = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  const d = [...String(n)].reverse().map(Number);
  return d.map((v, i) => (!v ? '' : (i === 1 && v === 1 ? '' : i === 1 && v === 2 ? 'ยี่' : i === 0 && v === 1 && d.length > 1 ? 'เอ็ด' : D[v]) + U[i])).reverse().join('');
}
// Letters that sound the same are merged and tone marks dropped, so the speech recognizer's spelling choice doesn't matter.
const TH_SOUND = { ฃ: 'ข', ค: 'ข', ฅ: 'ข', ฆ: 'ข', ฌ: 'ช', ซ: 'ส', ศ: 'ส', ษ: 'ส', ญ: 'ย', ฎ: 'ด', ฏ: 'ต', ฐ: 'ท', ฑ: 'ท', ฒ: 'ท', ถ: 'ท', ธ: 'ท', ณ: 'น', ผ: 'พ', ภ: 'พ', ฝ: 'ฟ', ร: 'ล', ฬ: 'ล', ฮ: 'ห' };
const soundKey = (s) => normalize(s).replace(/\d+/g, (m) => thaiNum(+m))
  .replace(/[\u0E01-\u0E2E][\u0E34\u0E38]?\u0E4C/g, '').replace(/[\u0E47-\u0E4E]/g, '')
  .replace(/[\u0E01-\u0E2E]/g, (c) => TH_SOUND[c] || c);
function fuzzyIn(w, s, k) { // is w within k edits of some part of s?
  if (!k) return s.includes(w);
  let prev = Array.from({ length: w.length + 1 }, (_, i) => i);
  for (const ch of s) {
    const cur = [0];
    for (let i = 1; i <= w.length; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (w[i - 1] === ch ? 0 : 1));
    if (cur[w.length] <= k) return true;
    prev = cur;
  }
  return prev[w.length] <= k;
}
function matches(item, alts) {
  if (item.lang === 'math') return alts.some((a) => { const n = numbersIn(a); return n.length && n[n.length - 1] === item.answer; });
  if (item.lang === 'en') {
    const w = item.text.toLowerCase().replace(/[^a-z' ]/g, '').trim();
    return alts.some((a) => {
      const s = a.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
      if ((' ' + s + ' ').includes(' ' + w + ' ')) return true;
      return !w.includes(' ') && s.split(' ').some((x) => x === w + 's' || x === w + 'es' || (w.length >= 5 && Math.abs(x.length - w.length) <= 1 && fuzzyIn(w, x, 1)));
    });
  }
  if (item.alt && item.alt.some((x) => alts.some((a) => soundKey(a).includes(soundKey(x))))) return true;
  if (item.strict) return false;
  const w = normalize(item.text);
  if (alts.some((a) => normalize(a).includes(w))) return true;
  if (item.lang !== 'th') return false;
  const key = soundKey(item.text), k = key.length >= 8 ? 2 : key.length >= 4 ? 1 : 0;
  return !!key && alts.some((a) => fuzzyIn(key, soundKey(a), k));
}
const sayText = (item) => (item.lang === 'math' ? String(item.answer) : item.say || item.text);

// ---------- speech synthesis ----------
// Natural voices: pre-recorded files for built-in words (audio/index.json), Gemini voice for other words when a key is set
// (saved after the first time), otherwise the phone's own voice.
let voiceIndex = null;
const loadVoiceIndex = () => voiceIndex || (voiceIndex = fetch('audio/index.json').then((r) => r.json()).catch(() => ({})));
const player = new Audio();
const VOICE_CACHE = 'twd-voice-v1';
function playUrl(url) {
  window.speechSynthesis?.cancel();
  player.pause(); player.src = url;
  if (recog.active) recog.holdForSpeech(player, ['ended', 'error', 'pause']);
  return player.play().then(() => true, () => false);
}
function pcmToWav(b64) {
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), rate = 24000;
  const buf = new ArrayBuffer(44 + pcm.length), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}
async function geminiVoice(text, code) {
  const key = `https://voice.cache/${code}/${encodeURIComponent(text)}`;
  const cache = window.caches ? await caches.open(VOICE_CACHE) : null;
  const hit = cache && await cache.match(key);
  if (hit) return URL.createObjectURL(await hit.blob());
  if (!settings.gemini || geminiVoice.off > Date.now()) return null;
  const langName = { 'th-TH': 'Thai', 'en-US': 'English', 'zh-CN': 'Mandarin Chinese' }[code] || 'Thai';
  const job = fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(settings.gemini)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Say this ${langName} word clearly and warmly, like a friendly teacher to a young child: ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } } },
    }),
  }).then(async (r) => {
    if (!r.ok) { geminiVoice.off = Date.now() + 10 * 60e3; return null; }
    const b64 = (await r.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!b64) return null;
    const blob = pcmToWav(b64);
    if (cache) await cache.put(key, new Response(blob));
    return URL.createObjectURL(blob);
  }).catch(() => null);
  return Promise.race([job, new Promise((res) => setTimeout(() => res(null), 3000))]);
}
async function say(text, lang) {
  const code = lang === 'math' ? profile().mathLang : SR_LANG[lang] || 'th-TH';
  const rel = (await loadVoiceIndex())[code]?.[String(text)];
  if (rel && await playUrl('audio/' + rel)) return;
  if (lang !== 'math') { const url = await geminiVoice(String(text), code); if (url && await playUrl(url)) return; }
  sayDevice(text, code);
}
async function praise(k, lang) {
  const code = SR_LANG[lang] || (lang === 'math' ? profile().mathLang : 'th-TH');
  const idx = (await loadVoiceIndex())[code];
  const lines = idx && Object.keys(idx).filter((t) => /[!！]$/.test(t));
  if (lines && lines[k]) playUrl('audio/' + idx[lines[k]]);
}
function sayDevice(text, code) {
  if (!('speechSynthesis' in window)) { toast('Speech not available on this device'); return; }
  speechSynthesis.cancel(); player.pause();
  const u = say.u = new SpeechSynthesisUtterance(text);
  u.lang = code; u.rate = code === 'th-TH' ? 0.7 : 0.8;
  const vs = speechSynthesis.getVoices().filter((x) => x.lang.replace('_', '-').toLowerCase().startsWith(code.slice(0, 2).toLowerCase()));
  const v = vs.find((x) => /google/i.test(x.name)) || vs[0];
  if (v) u.voice = v;
  if (recog.active) recog.holdForSpeech(u);
  speechSynthesis.speak(u);
}

// ---------- splitting ----------
function cleanOcr(text) { return text.replace(/([\u0E00-\u0E7F\u3400-\u9FFF])[ \t]+(?=[\u0E00-\u0E7F\u3400-\u9FFF])/g, '$1').replace(/[|_~^`]/g, ' '); }
function splitText(text, subject, dedupe) {
  let words = [];
  if (subject === 'math') words = extractExprs(text);
  else if (subject === 'en') words = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).map((w) => (w === 'I' ? w : w.toLowerCase()));
  else {
    const re = subject === 'zh' ? HAN_RE : THAI_RE;
    text = cleanOcr(text);
    if (subject === 'th') text = text.replace(/[\u0E50-\u0E59]+/g, ' ');
    if (window.Intl && Intl.Segmenter) {
      for (const s of new Intl.Segmenter(subject, { granularity: 'word' }).segment(text)) if (s.isWordLike !== false && re.test(s.segment)) words.push(s.segment.trim());
    } else words = text.split(/\s+/).filter((w) => re.test(w));
    const keep = subject === 'zh' ? /[^\u3400-\u9FFF]/g : /[^\u0E00-\u0E7F]/g;
    words = words.map((w) => w.replace(keep, '')).filter((w) => w && !/^[ๆฯ\u0E50-\u0E59]+$/.test(w));
  }
  return dedupe ? [...new Set(words)] : words;
}

// ---------- lists & levels ----------
function builtinList(subject) {
  const b = diffBand(subject), g = bookGrade(subject);
  const lv = g == null ? `Age ${b}` : `${gradeName(g)} level`;
  if (subject === 'math') return { id: `b-math-${b}`, builtin: true, subject, name: `${lv} math`, gen: 'math', count: 8 };
  if (subject === 'mix') return { id: `b-mix-${b}`, builtin: true, subject, name: `Mix: Thai, English, 中文, Math`, gen: 'mix', count: 4 };
  return { id: `smart-${subject}`, builtin: true, smart: true, subject, name: `🎯 Smart practice · ${skillName(subject)}`, gen: 'smart', count: 10 };
}
const phonicsList = () => ({ id: 'phonics-th', builtin: true, phonics: true, subject: 'th', name: '🔤 Phonics: สระ · แม่ ก กา · ตัวสะกด · วรรณยุกต์', count: TH.LESSONS.length });
const subjectLists = (subject) => (subject === 'mix' ? [builtinList(subject)]
  : [bookList(subject), builtinList(subject), subject === 'th' && phonicsList(), ...lists.filter((l) => l.subject === subject)].filter(Boolean));
const getList = (id) => [...['th', 'en', 'zh', 'math'].map(bookList), ...['th', 'en', 'zh', 'math', 'mix'].map(builtinList), phonicsList()].find((l) => l && l.id === id)
  || lists.find((l) => l.id === id);
const currentList = () => {
  const s = settings.subject;
  return subjectLists(s).find((l) => l.id === settings.listId[s]) || builtinList(s);
};
const levelCount = (l) => l.count || Math.max(1, Math.ceil(l.words.length / LEVEL_SIZE));
const levelSec = (i) => Math.max(1.8, +profile().speed - 0.1 * i);
const prog = (listId) => { const p = progress[profile().id] || (progress[profile().id] = {}); return p[listId] || (p[listId] = {}); };
const isUnlocked = (listId, i) => i === 0 || (prog(listId)[i - 1]?.pct ?? 0) >= PASS_PCT;
const noAdjDup = (items) => { for (let k = 0; k < 30; k++) { shuffle(items); if (!items.some((w, j) => j && items[j - 1].text === w.text)) break; } return items; };
function levelItems(list, i) {
  if (list.gen === 'math') {
    const b = diffBand('math'), off = mathOffset();
    const seen = new Set(), out = [];
    for (let k = 0; out.length < LEVEL_SIZE && k < 500; k++) { const e = mathItem(b, i + off); if (!seen.has(e) || k > 200) { seen.add(e); out.push(itemFor(e, 'math')); } }
    return out;
  }
  if (list.gen === 'mix') {
    const pickN = (arr, n) => shuffle([...arr]).slice(0, n);
    const items = [
      ...['th', 'en', 'zh'].flatMap((s) => smartWords(s, wordPool(s), 4).map((w) => itemFor(w, s))),
      ...[...new Set(Array.from({ length: 12 }, () => mathItem(diffBand('math'), i + 1 + mathOffset())))].slice(0, 3).map((e) => itemFor(e, 'math')),
    ];
    return noAdjDup(items);
  }
  if (list.phonics) {
    const ws = TH.LESSONS[i].words, words = [...ws];
    while (words.length < Math.min(LEVEL_SIZE, ws.length * 2)) words.push(ws[words.length % ws.length]);
    return noAdjDup(words.map((w) => itemFor(w, 'th')));
  }
  if (list.smart) {
    const pool = list.words ? wordPool(list.subject).filter((x) => list.words.includes(x.w)) : wordPool(list.subject);
    const words = smartWords(list.subject, pool, LEVEL_SIZE);
    while (words.length && words.length < LEVEL_SIZE) words.push(words[words.length % pool.length]);
    return noAdjDup(words.map((w) => itemFor(w, list.subject)).filter(Boolean));
  }
  const all = list.words;
  const words = all.slice(i * LEVEL_SIZE, (i + 1) * LEVEL_SIZE);
  const pool = shuffle(all.filter((w) => !words.includes(w)));
  const base = shuffle([...all]);
  while (words.length < LEVEL_SIZE && all.length) {
    const w = pool.length ? pool.shift() : base[words.length % base.length];
    if (words[words.length - 1] !== w || all.length === 1) words.push(w); else base.push(base.shift());
  }
  const items = words.map((w) => itemFor(w, list.subject)).filter(Boolean);
  return profile().order === 'shuffle' ? noAdjDup(items) : items;
}
function nextLevelIdx(list) {
  const p = prog(list.id);
  for (let i = 0; i < levelCount(list); i++) if ((p[i]?.pct ?? 0) < PASS_PCT) return i;
  return 0;
}

// ---------- daily record ----------
const dayRec = (key = today()) => { const d = days[profile().id] || (days[profile().id] = {}); return d[key] || { played: 0, passed: 0, read: 0, score: 0 }; };
function recordDay(passed, read, score) {
  const d = days[profile().id] || (days[profile().id] = {});
  const r = d[today()] || { played: 0, passed: 0, read: 0, score: 0 };
  r.played++; if (passed) r.passed++; r.read += read; r.score += score;
  d[today()] = r; save(K.days, days);
  return r;
}
const dayOk = (k) => dayRec(k).passed >= +profile().goal;
const isFrozen = (k) => (typeof F === 'function' && (F().frozen || []).includes(k));
function streak() {
  let n = 0;
  const d = new Date();
  if (!dayOk(dateKey(d))) d.setDate(d.getDate() - 1);
  for (let k = dateKey(d); dayOk(k) || isFrozen(k); d.setDate(d.getDate() - 1), k = dateKey(d)) if (dayOk(k)) n++;
  return n;
}
function renderToday() {
  const goal = +profile().goal, r = dayRec();
  const done = r.passed >= goal;
  $('#todayText').textContent = done ? `Daily goal done! ${r.passed}/${goal} passed ✓` : `${r.passed}/${goal} levels passed`;
  $('#goalBar').style.width = Math.min(100, r.passed / goal * 100) + '%';
  $('#streakNum').textContent = streak();
  const row = $('#daysRow'); row.innerHTML = '';
  for (let k = 13; k >= 0; k--) {
    const d = new Date(); d.setDate(d.getDate() - k);
    const rec = dayRec(dateKey(d));
    const el = document.createElement('div');
    const fz = rec.passed < goal && isFrozen(dateKey(d));
    el.className = 'day' + (rec.passed >= goal ? ' passed' : fz ? ' frozen' : rec.played ? ' played' : '') + (k === 0 ? ' today' : '');
    el.title = `${dateKey(d)}: ${rec.passed} passed, ${rec.played} played`;
    el.innerHTML = `<i>${rec.passed >= goal ? '✓' : fz ? '🧊' : rec.passed || ''}</i><span>${'SMTWTFS'[d.getDay()]}</span>`;
    row.appendChild(el);
  }
}

// ---------- share links ----------
function encodeList(l) {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ n: l.name, w: l.words, s: l.subject })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeList(s) {
  const o = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  return { name: String(o.n || 'Shared list'), words: (o.w || []).map(String).filter(Boolean), subject: SUBJECTS[o.s] && o.s !== 'mix' ? o.s : 'th' };
}
function checkHashImport() {
  const m = location.hash.match(/list=([^&]+)/);
  if (!m) return;
  try {
    const l = decodeList(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    let ex = lists.find((x) => x.name === l.name && x.words.join('|') === l.words.join('|'));
    if (!ex) { ex = { id: 'l' + Date.now(), ...l }; lists.push(ex); }
    settings.subject = ex.subject; settings.listId[ex.subject] = ex.id; saveAll();
    toast(`Added list “${l.name}” (${l.words.length})`, 3500);
  } catch { toast('Could not read shared list link'); }
}
async function shareList(l) {
  const url = location.origin + location.pathname + '#list=' + encodeList(l);
  try { if (navigator.share) { await navigator.share({ title: l.name, url }); return; } await navigator.clipboard.writeText(url); toast('Link copied'); }
  catch { prompt('Copy this link', url); }
}

// ---------- HOME ----------
function renderHome() {
  if (!profile()) { openProfiles(true); return; }
  const p = profile();
  $('#profileName').textContent = p.name;
  renderToday();
  $$('#subjectTabs button').forEach((b) => b.classList.toggle('sel', b.dataset.subject === settings.subject));
  const s = settings.subject, cur = currentList();
  $('#listsPanel').classList.toggle('hidden', s === 'mix'); $('#mixNote').classList.toggle('hidden', s !== 'mix');
  const ul = $('#listList'); ul.innerHTML = '';
  for (const l of subjectLists(s)) {
    const li = document.createElement('li');
    li.className = 'list-item' + (l.id === cur.id ? ' sel' : '');
    const pr = prog(l.id), n = levelCount(l);
    const passedN = Object.values(pr).filter((x) => x.pct >= PASS_PCT).length;
    const preview = l.words ? l.words.slice(0, 8).join(' ') : `${n} levels`;
    li.innerHTML = `<div class="name"><b>${escapeHtml(l.name)}</b><small class="${s}">${l.words ? l.words.length + ' · ' : ''}${escapeHtml(preview)}</small></div>
      <span class="best">${passedN}/${n} ✓</span>
      <button class="btn small" data-act="play">▶</button>
      ${l.book ? '<button class="btn small ghost" data-act="delbook" title="Delete whole book">🗑</button>' : ''}
      ${l.builtin ? '' : '<button class="btn small ghost" data-act="edit">✎</button><button class="btn small ghost" data-act="share" title="Share link">🔗</button><button class="btn small ghost" data-act="del" title="Delete">🗑</button>'}`;
    li.querySelector('.name').onclick = () => { settings.listId[s] = l.id; saveAll(); showTab('learn'); };
    li.querySelector('[data-act=play]').onclick = () => { settings.listId[s] = l.id; saveAll(); startGame(l.id); };
    const e = li.querySelector('[data-act=edit]'); if (e) e.onclick = () => openEditor(l);
    const sh = li.querySelector('[data-act=share]'); if (sh) sh.onclick = () => shareList(l);
    const del = li.querySelector('[data-act=del]'); if (del) del.onclick = () => askDeleteList(l);
    const db = li.querySelector('[data-act=delbook]');
    if (db) db.onclick = () => {
      const rs = myRefs(s);
      if (!confirm(`Delete the whole ${SUBJECTS[s]} book: all ${rs.length} photo${rs.length > 1 ? 's' : ''} and their words? Saved lists stay.`)) return;
      deleteRefs(rs.map((r) => r.id)); renderHome(); toast('Book deleted');
    };
    ul.appendChild(li);
  }
  if (s !== 'mix') renderRefs(s);
  renderLevels();
  if (typeof renderFun === 'function') renderFun();
  $('#setSpeed').value = p.speed; $('#setGoal').value = p.goal; $('#setMathLang').value = p.mathLang;
  $('#setOrder').value = p.order; $('#setMic').value = p.mic; $('#setWarmup').value = p.warmup || 'on';
  renderCloud();
  $('#setGemini').value = settings.gemini || '';
  $('#micSupport').textContent = recog.supported
    ? 'The microphone listens in Thai, English or Chinese to match each word (works best in Chrome). The parent button always works too.'
    : 'This browser has no speech recognition. Use the “He read it!” button (Chrome on Android supports the mic).';
}
function askDeleteList(l, after) {
  if (!confirm(`Delete “${l.name}”?`)) return false;
  const rs = myRefs().filter((r) => (l.refIds || []).includes(r.id));
  if (rs.length && confirm(`Also delete the ${rs.length} book photo${rs.length > 1 ? 's' : ''} this page came from?`)) deleteRefs(rs.map((r) => r.id));
  deleteList(l); (after || renderHome)(); toast('Deleted');
  return true;
}
function renderRefs(s) {
  const rs = myRefs(s), g = bookGrade(s), p = profile();
  $('#refsInfo').textContent = rs.length
    ? `Difficulty: ${gradeName(g)} level, from ${rs.length} photo${rs.length > 1 ? 's' : ''} of ${p.name}'s books (newest count most).`
    : `Difficulty: from age ${p.age}. Take a photo of ${p.name}'s ${SUBJECTS[s]} schoolbook (+ New list → Take photo) to set it from his books.`;
  const strip = $('#refsStrip'); strip.innerHTML = '';
  for (const r of [...rs].reverse()) {
    const b = document.createElement('button');
    b.className = 'ref-thumb';
    b.innerHTML = `<img ${r.thumb ? `src="${r.thumb}"` : ''} alt=""><span>${r.grade <= 0 ? 'K' : 'G' + r.grade} · ${r.items.length + (r.more?.length || 0)}</span>`;
    b.onclick = () => openRef(r);
    strip.appendChild(b);
  }
}
let refOpen = null;
function openRef(r) {
  refOpen = r;
  $('#refTitle').textContent = `${SUBJECTS[r.subject]} book photo · ${r.date}`;
  $('#refImg').src = r.thumb || ''; $('#refImg').classList.toggle('hidden', !r.thumb);
  refPhoto(r).then((url) => { if (refOpen === r && url) { $('#refImg').src = url; $('#refImg').classList.remove('hidden'); } });
  $('#refInfo').textContent = `${gradeName(r.grade)} level · ${r.items.length} from the photo${r.more?.length ? ` + ${r.more.length} similar` : ''}`;
  const c = $('#refItems'); c.innerHTML = '';
  for (const w of r.items) { const b = document.createElement('span'); b.className = 'chip ' + r.subject; b.textContent = w; c.appendChild(b); }
  $('#refOverlay').classList.remove('hidden');
}
$('#refClose').onclick = () => $('#refOverlay').classList.add('hidden');
$('#refDelete').onclick = () => {
  if (!refOpen || !confirm('Delete this photo and its words from the book list?')) return;
  const ls = lists.filter((l) => (l.refIds || []).includes(refOpen.id));
  if (ls.length && confirm(`Also delete the list “${ls.map((l) => l.name).join('”, “')}” made from it?`)) ls.forEach(deleteList);
  deleteRefs([refOpen.id]); $('#refOverlay').classList.add('hidden'); renderHome();
};
function renderLevels() {
  const list = currentList();
  $('#levelsTitle').textContent = list.name;
  const box = $('#levels'); box.innerHTML = '';
  const p = prog(list.id), next = nextLevelIdx(list);
  const SWAY = [0, 1, 1.6, 1, 0, -1, -1.6, -1];
  for (let i = 0; i < levelCount(list); i++) {
    const unlocked = isUnlocked(list.id, i), best = p[i], passed = best && best.pct >= PASS_PCT, cur = unlocked && i === next;
    const b = document.createElement('button');
    b.className = 'level-card node' + (unlocked ? '' : ' locked') + (passed ? ' passed' : '') + (cur ? ' current' : '');
    b.style.setProperty('--x', SWAY[i % SWAY.length]);
    const preview = list.phonics ? TH.LESSONS[i].title
      : list.gen === 'smart' ? `${SUBJECTS[list.subject]} words picked for ${profile().name}`
      : list.words && list.smart ? 'Book words picked for his level'
      : list.words ? list.words.slice(i * LEVEL_SIZE, i * LEVEL_SIZE + 3).join(' ')
      : list.gen === 'math' ? mathItem(diffBand('math'), i + mathOffset()) : 'ไทย · ABC · 中文 · 1+2';
    b.innerHTML = `${cur ? '<span class="start">START</span>' : ''}
      <span class="bubble">${unlocked ? (passed ? '★' : i + 1) : '🔒'}</span>
      <span class="stars-row">${passed ? starsHtml(best.pct) : ''}</span>
      <span class="lv">Level ${i + 1} · ${levelSec(i).toFixed(1)}s</span>
      <span class="lv-desc ${list.subject}">${escapeHtml(preview)}</span>`;
    if (unlocked) b.onclick = () => startGame(list.id, i);
    box.appendChild(b);
  }
}
$$('#subjectTabs button').forEach((b) => (b.onclick = () => { settings.subject = b.dataset.subject; saveAll(); renderHome(); }));
const starCount = (pct) => (pct >= 100 ? 3 : pct >= 90 ? 2 : pct >= PASS_PCT ? 1 : 0);
const starsHtml = (pct) => [1, 2, 3].map((k) => `<i class="${k <= starCount(pct) ? 'on' : ''}">★</i>`).join('');
let tab = 'learn';
function showTab(t) {
  tab = t;
  ['learn', 'lists', 'ranks', 'me'].forEach((x) => $('#tab-' + x).classList.toggle('hidden', x !== t));
  $$('#bottomNav button').forEach((b) => b.classList.toggle('sel', b.dataset.tab === t));
  $('#subjectTabs').classList.toggle('hidden', t === 'ranks' || t === 'me');
  renderHome(); window.scrollTo(0, 0);
  if (t === 'ranks' && typeof renderRanks === 'function') renderRanks();
}
$$('#bottomNav button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
$('#listPicker').onclick = () => showTab('lists');
const bindProfileSetting = (id, key) => ($('#' + id).onchange = (e) => { profile()[key] = e.target.value; saveAll(); renderHome(); });
bindProfileSetting('setSpeed', 'speed'); bindProfileSetting('setGoal', 'goal'); bindProfileSetting('setMathLang', 'mathLang');
bindProfileSetting('setOrder', 'order'); bindProfileSetting('setMic', 'mic'); bindProfileSetting('setWarmup', 'warmup');
$('#setGemini').onchange = (e) => { settings.gemini = e.target.value.trim(); saveAll(); };
$('#newListBtn').onclick = () => openEditor(null);
$$('[data-go]').forEach((b) => (b.onclick = () => { show(b.dataset.go); renderHome(); }));

// ---------- PROFILES ----------
let pfEditing = null;
(() => { const s = $('#pfAge'); for (let a = 3; a <= 14; a++) s.add(new Option(String(a), a)); s.value = 7; })();
function openProfiles(forceNew) {
  const ul = $('#profileList'); ul.innerHTML = '';
  for (const p of profiles) {
    const li = document.createElement('li');
    li.className = 'list-item' + (p.id === profile()?.id ? ' sel' : '');
    li.innerHTML = `<div class="name"><b>${escapeHtml(p.name)}</b><small>Age ${p.age} · 🔥 ${p.id === profile()?.id ? streak() : ''}</small></div>
      <button class="btn small" data-act="use">Play as</button><button class="btn small ghost" data-act="edit">✎</button>`;
    li.querySelector('[data-act=use]').onclick = () => { settings.profileId = p.id; saveAll(); closeProfiles(); renderHome(); };
    li.querySelector('[data-act=edit]').onclick = () => editProfile(p);
    ul.appendChild(li);
  }
  ul.classList.toggle('hidden', !profiles.length);
  editProfile(null);
  $('#pfCancel').classList.toggle('hidden', !!forceNew && !profiles.length);
  $('#profileOverlay').classList.remove('hidden');
}
function editProfile(p) {
  pfEditing = p;
  $('#pfTitle').textContent = p ? `Edit ${p.name}` : profiles.length ? 'Add another child' : 'Create a profile';
  $('#pfName').value = p ? p.name : ''; $('#pfAge').value = p ? p.age : 7;
  $('#pfDelete').classList.toggle('hidden', !p || profiles.length < 2);
}
function closeProfiles() { $('#profileOverlay').classList.add('hidden'); }
$('#profileBtn').onclick = () => openProfiles(false);
$('#pfCancel').onclick = closeProfiles;
$('#pfSave').onclick = () => {
  const name = $('#pfName').value.trim(), age = +$('#pfAge').value;
  if (!name) { toast('Please input your name'); $('#pfName').focus(); return; }
  if (pfEditing) Object.assign(pfEditing, { name, age });
  else {
    const np = newProfile(name, age);
    if (!profiles.length && oldProgress) {
      const old = load(K.settings, {});
      if (old.speed && +old.speed <= 6) np.speed = String(old.speed);
      progress[np.id] = oldProgress;
    }
    profiles.push(np); settings.profileId = np.id;
  }
  saveAll(); closeProfiles(); renderHome();
};
$('#pfDelete').onclick = () => {
  if (!pfEditing || !confirm(`Delete ${pfEditing.name} and all their scores?`)) return;
  profiles = profiles.filter((p) => p !== pfEditing);
  delete progress[pfEditing.id]; delete days[pfEditing.id]; delete refs[pfEditing.id]; saveRefs();
  if (settings.profileId === pfEditing.id) settings.profileId = profiles[0]?.id;
  saveAll(); closeProfiles(); renderHome();
};

// ---------- EDITOR ----------
let edit = { list: null, words: [], sel: -1, refIds: [] };
const edSubject = () => $('#listSubject').value;
function openEditor(list) {
  edit = { list, words: list ? [...list.words] : [], sel: -1, refIds: [] };
  $('#editorTitle').textContent = list ? 'Edit list' : 'New list';
  $('#listName').value = list ? list.name : '';
  $('#listSubject').value = list ? list.subject : settings.subject === 'mix' ? 'th' : settings.subject;
  $('#srcText').value = '';
  $('#photoPreview').classList.add('hidden'); $('#ocrStatus').classList.add('hidden');
  $('#deleteListBtn').classList.toggle('hidden', !list);
  updateEditorInfo(); renderChips(); show('editor');
}
function updateEditorInfo() {
  const g = !!settings.gemini;
  const ot = OpenThai.langs.includes(edSubject());
  document.querySelectorAll('#ocrLang button').forEach((b) => b.classList.toggle('sel', b.dataset.subject === edSubject()));
  $('#readerInfo').textContent = g ? 'Photos are read by Gemini AI (accurate).'
    : ot ? 'Photos are read on this device by the free OpenThai reader (good for printed Thai and English). Add a Gemini key in Settings for grade levels and extra words.'
    : 'Photos are read by the free built-in reader, which makes mistakes. For better accuracy use Google Lens (below), or add a Gemini key in Settings.';
  $('#moreLike').parentElement.classList.toggle('hidden', !g);
  $('#aiGenRow').classList.toggle('hidden', !g);
  $('#aiGenBtn').textContent = `✨ Make ${edSubject() === 'math' ? 'problems' : 'words'} for age ${profile().age}`;
}
$('#listSubject').onchange = updateEditorInfo;
document.querySelectorAll('#ocrLang button').forEach((b) => { b.onclick = () => { $('#listSubject').value = b.dataset.subject; updateEditorInfo(); }; });
function renderChips() {
  const c = $('#chips'); c.innerHTML = '';
  edit.words.forEach((w, i) => {
    const b = document.createElement('button');
    b.className = 'chip ' + edSubject() + (i === edit.sel ? ' sel' : '');
    b.textContent = w;
    b.onclick = () => { edit.sel = edit.sel === i ? -1 : i; renderChips(); };
    c.appendChild(b);
  });
  $('#wordCount').textContent = edit.words.length ? `(${edit.words.length})` : '';
  const has = edit.sel >= 0;
  $('#chipDel').disabled = !has; $('#chipEdit').disabled = !has; $('#chipSay').disabled = !has;
  $('#chipJoin').disabled = !(has && edit.sel < edit.words.length - 1);
}
function addWords(words) {
  edit.words = $('#dedupe').checked ? [...new Set([...edit.words, ...words])] : [...edit.words, ...words];
  edit.sel = -1; renderChips();
}
$('#chipDel').onclick = () => { edit.words.splice(edit.sel, 1); edit.sel = Math.min(edit.sel, edit.words.length - 1); renderChips(); };
$('#chipJoin').onclick = () => { const i = edit.sel, sep = edSubject() === 'en' ? ' ' : ''; edit.words.splice(i, 2, edit.words[i] + sep + edit.words[i + 1]); renderChips(); };
$('#chipEdit').onclick = () => { const v = prompt('Edit', edit.words[edit.sel]); if (v && v.trim()) { edit.words[edit.sel] = v.trim(); renderChips(); } };
$('#chipSay').onclick = () => { const it = itemFor(edit.words[edit.sel], edSubject()); if (it) say(sayText(it), it.lang); };
function addWord() {
  const v = $('#addWord').value.trim(); if (!v) return;
  if (edSubject() === 'math') { const e = parseExpr(v); if (!e) { toast('Write it like 7 + 5'); return; } addWords([e.text]); }
  else addWords(edSubject() === 'en' ? [v] : v.split(/\s+/));
  $('#addWord').value = '';
}
$('#addWordBtn').onclick = addWord;
$('#addWord').onkeydown = (e) => { if (e.key === 'Enter') addWord(); };
$('#splitBtn').onclick = () => {
  const words = splitText($('#srcText').value, edSubject(), $('#dedupe').checked);
  if (!words.length) { toast(edSubject() === 'math' ? 'No sums found (write them like 7 + 5)' : 'No words found for this subject'); return; }
  addWords(words); toast(`Found ${words.length}`);
};
$('#saveListBtn').onclick = () => {
  if (!edit.words.length) { toast('Add some words first'); return; }
  const subject = edSubject();
  const name = $('#listName').value.trim() || `${edit.refIds.length ? `${SUBJECTS[subject]} book page` : SUBJECTS[subject]} ${new Date().toLocaleDateString()}`;
  if (edit.list) { const l = lists.find((x) => x.id === edit.list.id); Object.assign(l, { name, words: edit.words, subject, refIds: [...new Set([...(l.refIds || []), ...edit.refIds])] }); }
  else { const nl = { id: 'l' + Date.now(), name, words: edit.words, subject, refIds: edit.refIds }; lists.push(nl); settings.listId[subject] = nl.id; }
  const keep = new Set(edit.words);
  for (const r of myRefs()) if (edit.refIds.includes(r.id)) { r.items = r.items.filter((w) => keep.has(w)); r.more = (r.more || []).filter((w) => keep.has(w)); }
  saveRefs();
  settings.subject = subject; saveAll(); show('home'); renderHome(); toast('Saved');
};
$('#deleteListBtn').onclick = () => askDeleteList(lists.find((l) => l.id === edit.list.id), () => { show('home'); renderHome(); });
$('#pasteBtn').onclick = async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (!t || !t.trim()) { toast('Clipboard is empty'); return; }
    $('#srcText').value = ($('#srcText').value ? $('#srcText').value + '\n' : '') + t.trim();
    $('#splitBtn').click();
  } catch { $('#srcText').focus(); toast('Long-press the text box and choose Paste', 3000); }
};

// ---------- OCR / Gemini ----------
async function prepImage(file, enhance = true) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
  const ctx = cv.getContext('2d');
  if (enhance) ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}
const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
async function gemini(parts) {
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
  let resp, data;
  const models = [settings.geminiModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'].filter(Boolean);
  for (const [i, model] of models.entries()) {
    if (i && resp?.status !== 404) await new Promise((r) => setTimeout(r, 1500));
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.gemini }, body,
    });
    data = await resp.json();
    if (![404, 429, 500, 503].includes(resp.status)) break;
  }
  if (!resp.ok) throw new Error(data.error?.message || resp.statusText);
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}';
  return JSON.parse(raw.replace(/^\s*```(json)?|```\s*$/g, ''));
}
function cleanAiItems(arr, subject) {
  arr = (arr || []).map(String);
  if (subject === 'math') return arr.map((s) => parseExpr(s)?.text).filter(Boolean);
  if (subject === 'en') return arr.map((w) => w.trim().replace(/[^A-Za-z' ]/g, '')).filter(Boolean);
  const keep = subject === 'zh' ? /[^\u3400-\u9FFF]/g : /[^\u0E00-\u0E7F]/g;
  return arr.map((w) => w.replace(keep, '')).filter(Boolean);
}
function photoPrompt(subject, more) {
  const age = profile().age, known = bookList(subject)?.words.slice(-80) || [];
  const avoid = known.length ? ` and not in: ${known.join(', ')}` : '';
  const grade = ', "grade": the school grade level this page is for, as a number (0 = kindergarten, 1 = grade 1, 2 = grade 2, ...)';
  if (subject === 'math') return `This image is from a child's math book or worksheet. Extract every arithmetic problem, written like "7 + 5" using only whole numbers and one of + − × ÷. `
    + `Return JSON {"text": the problems one per line, "items": [the problems], "more": [${more ? `30 NEW different problems of the same type and difficulty${avoid}` : ''}]${grade}}.`;
  const L = LANG_NAME[subject];
  return `This image is from a ${age}-year-old child's ${L} reading book or worksheet. Read all the ${L} text exactly as written. `
    + `Return JSON {"text": the full ${L} text in reading order, "items": the text split into individual ${L} words in reading order${subject === 'en' ? '' : ', segmented as a native teacher would'}, without punctuation, numbers or text in other languages, `
    + `"more": [${more ? `30 NEW different ${L} words at the same reading difficulty and similar topics, suitable for this child, not already in items${avoid}` : ''}]${grade}}.`;
}
async function runOcr(file) {
  if (!file) return;
  const subject = edSubject();
  $('#photoPreview').src = URL.createObjectURL(file); $('#photoPreview').classList.remove('hidden');
  $('#ocrStatus').classList.remove('hidden');
  const bar = $('#ocrBar'), msg = $('#ocrMsg');
  bar.style.width = '10%';
  if (settings.gemini) {
    try {
      const more = $('#moreLike').checked;
      msg.textContent = 'Gemini AI is reading the photo…'; bar.style.width = '40%';
      const canvas = await prepImage(file, false);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      const out = await gemini([{ text: photoPrompt(subject, more) }, { inline_data: { mime_type: 'image/jpeg', data: await blobToBase64(blob) } }]);
      const items = cleanAiItems(out.items, subject), extra = cleanAiItems(out.more, subject);
      if (!items.length && !extra.length) { msg.textContent = `No ${SUBJECTS[subject]} found. Check the subject, or try a clearer photo.`; return; }
      if (out.text) $('#srcText').value = ($('#srcText').value ? $('#srcText').value + '\n' : '') + String(out.text);
      addWords([...items, ...extra]);
      const ref = addRef(subject, canvas, items, extra, out.grade);
      bar.style.width = '100%';
      msg.textContent = `Done: ${items.length} from the photo${extra.length ? ` + ${extra.length} more at the same level` : ''} (${gradeName(ref.grade)} level). Saved as a book photo. Check them, then save.`;
    } catch (e) {
      console.error(e);
      const why = 'Gemini could not read the photo: ' + String(e.message || e).replace(/\.+$/, '') + '. ';
      if (OpenThai.langs.includes(subject)) return readFree(file, subject, why + 'Using the built-in reader instead. ');
      msg.textContent = why + 'Check the key in Settings.';
    }
    return;
  }
  await readFree(file, subject);
}
async function readFree(file, subject, why = '') {
  const bar = $('#ocrBar'), msg = $('#ocrMsg');
  const thaiReader = OpenThai.langs.includes(subject);
  if (!thaiReader && !window.Tesseract) { toast('Text reader still loading, try again in a moment'); return; }
  msg.textContent = why + 'Loading reader (first time takes a little while)…';
  try {
    const canvas = await prepImage(file, !thaiReader);
    let text;
    if (thaiReader) {
      text = (await OpenThai.read(canvas, (f, m) => { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = why + m; })).text;
    } else {
      const { data } = await Tesseract.recognize(canvas, OCR_LANG[subject], {
        logger: (m) => { if (m.status === 'recognizing text') { bar.style.width = Math.round(m.progress * 100) + '%'; msg.textContent = `${why}Reading… ${Math.round(m.progress * 100)}%`; } },
      });
      text = data.text;
    }
    text = cleanOcr(text).replace(/\n{2,}/g, '\n').trim();
    if (!splitText(text, subject).length) { msg.textContent = `${why}No ${SUBJECTS[subject]} found. Check the subject, or try a clearer photo.`; return; }
    $('#srcText').value = ($('#srcText').value ? $('#srcText').value + '\n' : '') + text;
    bar.style.width = '100%';
    $('#splitBtn').click();
    const ref = addRef(subject, canvas, splitText(text, subject, true), [], null);
    msg.textContent = `${why}Done${ref ? ` (${gradeName(ref.grade)} level, saved as a book photo)` : ''}. Fix any mistakes, then save.`;
  } catch (e) { console.error(e); msg.textContent = why + 'Could not read the photo: ' + (e.message || e); }
}
$('#photoCam').onchange = (e) => { runOcr(e.target.files[0]); e.target.value = ''; };
$('#photoPick').onchange = (e) => { runOcr(e.target.files[0]); e.target.value = ''; };
$('#aiGenBtn').onclick = async () => {
  const subject = edSubject(), age = profile().age, topic = $('#aiTopic').value.trim(), g = bookGrade(subject);
  const sample = bookList(subject)?.words.slice(-25) || [];
  const who = `a ${age}-year-old child${g == null ? '' : ` whose schoolbooks are at ${gradeName(g)} level`}${sample.length ? ` (examples from the books: ${sample.join(', ')})` : ''}`;
  const btn = $('#aiGenBtn'); btn.disabled = true; const label = btn.textContent; btn.textContent = '✨ Making…';
  try {
    const prompt = subject === 'math'
      ? `Make 45 different arithmetic problems right for ${who}, getting slightly harder through the list. Write each like "7 + 5" with whole numbers and one of + − × ÷ (divisions must divide exactly). Return JSON {"items": [...]}.`
      : `Make a list of 45 different ${LANG_NAME[subject]} words right for ${who} learning to read${topic ? `, about: ${topic}` : ''}, easier words first. Only single words${subject === 'en' ? '' : ' (common compound words are fine)'}. Return JSON {"items": [...]}.`;
    const items = cleanAiItems((await gemini([{ text: prompt }])).items, subject);
    addWords(items);
    if (!$('#listName').value) $('#listName').value = `${SUBJECTS[subject]}${topic ? ': ' + topic : ''} (age ${age})`;
    toast(`Added ${items.length}`);
  } catch (e) { toast('Gemini error: ' + (e.message || e), 4000); }
  btn.disabled = false; btn.textContent = label;
};

// ---------- SPEECH RECOGNITION ----------
const recog = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = { supported: !!SR, active: false, onWords: null, paused: false, lang: 'th-TH' };
  let inst = null, restartTimer = null, pauseTimer = null, cut = null;
  const dot = () => $('#micDot'), heard = () => $('#heard');
  function create() {
    inst = new SR(); cut = null;
    inst.lang = r.lang; inst.continuous = true; inst.interimResults = true; inst.maxAlternatives = 5;
    inst.onstart = () => { dot().classList.add('on'); if (heard().textContent.startsWith('Mic')) heard().textContent = 'Listening… read it!'; };
    inst.onresult = (ev) => {
      const alts = []; let display = '';
      // Keep listening after a correct word (restarting the mic loses what he says next); skip speech already used.
      for (let i = Math.max(ev.resultIndex, cut ? cut.i : 0); i < ev.results.length; i++) {
        const res = ev.results[i];
        if (cut && i === cut.i) {
          if (!res[0].transcript.startsWith(cut.tx)) continue;
          const rest = res[0].transcript.slice(cut.tx.length); display += rest; alts.push(rest); continue;
        }
        display += res[0].transcript;
        for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
      }
      if (display.trim()) heard().textContent = 'Heard: ' + display.trim();
      if (r.onWords && !r.paused && alts.some((a) => a.trim()) && r.onWords(alts)) {
        const i = ev.results.length - 1; cut = { i, tx: ev.results[i][0].transcript };
      }
    };
    inst.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        r.active = false; heard().textContent = 'Mic blocked: allow the microphone, or use the button';
        toast('Microphone permission was blocked', 3000);
      }
    };
    inst.onend = () => { dot().classList.remove('on'); if (r.active) { clearTimeout(restartTimer); restartTimer = setTimeout(start1, r.paused ? 400 : 120); } };
  }
  function start1() {
    if (!r.active) return;
    if (r.paused) { restartTimer = setTimeout(start1, 300); return; }
    try { create(); inst.start(); } catch { restartTimer = setTimeout(start1, 500); }
  }
  r.start = () => { if (!SR) return; r.active = true; r.paused = false; heard().textContent = 'Mic starting…'; start1(); };
  r.stop = () => {
    r.active = false; clearTimeout(restartTimer); clearTimeout(pauseTimer);
    if (inst) { try { inst.abort(); } catch {} }
    dot().classList.remove('on'); heard().textContent = 'Mic off';
  };
  r.setLang = (code) => {
    $('#micLang').textContent = code.slice(0, 2).toUpperCase();
    if (r.lang === code) return;
    r.lang = code;
    if (r.active && inst) { try { inst.abort(); } catch {} }
  };
  r.holdForSpeech = (u, evs = ['end', 'error']) => { // mic off while the word is spoken, back on once speech has finished
    r.pauseFor(8000);
    const done = () => { evs.forEach((e) => u.removeEventListener(e, done)); clearTimeout(pauseTimer); pauseTimer = setTimeout(() => { r.paused = false; }, 350); };
    evs.forEach((e) => u.addEventListener(e, done));
  };
  r.pauseFor = (ms) => {
    r.paused = true; if (inst) { try { inst.abort(); } catch {} }
    clearTimeout(pauseTimer); pauseTimer = setTimeout(() => { r.paused = false; }, ms);
  };
  return r;
})();

// ---------- GAME ----------
const G = {
  running: false, paused: false, raf: 0, last: 0, W: 0, H: 0, cols: 3, colW: 100, rowH: 56, rows: 10,
  stacks: [], active: null, queue: [], list: null, levelIdx: 0, total: 0, resolved: 0,
  score: 0, streak: 0, bestStreak: 0, read: 0, missed: [], times: [], fallSec: 3, colorIdx: 0, rescueTile: null, spawnDelay: 0,
};
function layout() {
  const b = $('#board');
  G.W = b.clientWidth; G.H = b.clientHeight; G.colW = G.W / G.cols;
  G.rowH = Math.max(44, Math.min(70, Math.round(G.H / 9)));
  G.rows = Math.max(4, Math.floor(G.H / G.rowH));
  b.style.setProperty('--colw', G.colW + 'px');
  G.lineY = (G.H - G.rows * G.rowH) + G.rowH;
  $('#dangerLine').style.top = G.lineY + 'px';
}
function measure() { const w = $('#board').clientWidth; G.cols = w >= 700 ? 5 : w >= 480 ? 4 : 3; layout(); }
const stackTop = (col) => G.H - (G.stacks[col].length + 1) * G.rowH;
function placeTile(t) {
  const x = t.col * G.colW + 3, y = t.y;
  t.el.style.width = (G.colW - 6) + 'px'; t.el.style.height = (G.rowH - 4) + 'px';
  t.el.style.transform = `translate(${x}px, ${y}px)`; t.el.style.setProperty('--t', `translate(${x}px, ${y}px)`);
}
function fitFont(el, text) {
  let units = 0;
  for (const ch of text) {
    if (/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch)) continue;
    units += HAN_RE.test(ch) ? 1.05 : THAI_RE.test(ch) ? 0.62 : ch === ' ' ? 0.3 : 0.58;
  }
  el.style.fontSize = Math.max(13, Math.min((G.colW - 16) / Math.max(1, units), G.rowH * 0.5)) + 'px';
}
function makeTile(item, col) {
  const el = document.createElement('div');
  el.className = 'tile active ' + item.lang;
  el.textContent = item.text;
  const pal = typeof themeColors === 'function' ? themeColors() : TILE_COLORS;
  el.style.background = pal[G.colorIdx++ % pal.length];
  fitFont(el, item.text);
  $('#board').appendChild(el);
  return { item, col, y: -G.rowH, el, born: performance.now(), lineAt: null, hinted: false, pausedMs: 0 };
}
function spawn() {
  const item = G.queue.shift();
  const heights = G.stacks.map((s) => s.length), minH = Math.min(...heights);
  const cands = heights.map((h, i) => [h, i]).filter(([h]) => h <= minH + 2).map(([, i]) => i);
  const col = cands[Math.random() * cands.length | 0];
  const t = makeTile(item, col);
  t.v = (stackTop(col) + G.rowH) / G.fallSec;
  G.active = t; placeTile(t);
  recog.setLang(srLang(item.lang));
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
  $('#board').appendChild(f); setTimeout(() => f.remove(), 1000);
}
function popTile(t) { t.el.classList.remove('active', 'stacked', 'rescue'); t.el.classList.add('pop'); setTimeout(() => t.el.remove(), 450); }
function beep(ok, combo = 0) {
  try {
    const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
    o.type = ok ? 'triangle' : 'sawtooth'; const now = ac.currentTime;
    const up = Math.pow(2, Math.min(combo, 12) / 12);
    if (ok) { o.frequency.setValueAtTime(660 * up, now); o.frequency.setValueAtTime(990 * up, now + 0.08); }
    else { o.frequency.setValueAtTime(200, now); o.frequency.linearRampToValueAtTime(110, now + 0.25); }
    g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.start(now); o.stop(now + 0.3);
  } catch {}
}
function pointsFor(sec, span) { // sec counts from the red line; span = time from the line to the stack
  if (sec <= 1) return MAX_PTS;
  return Math.max(60, Math.round(MAX_PTS - 40 * (sec - 1) / Math.max(0.5, span - 1)));
}
function showCombo() {
  const c = $('#hudCombo'), n = G.streak;
  c.classList.toggle('hidden', n < 3);
  c.querySelector('b').textContent = 'x' + n;
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  if (n >= 5 && n % 5 === 0) {
    const big = document.createElement('div'); big.className = 'combo-big'; big.textContent = `${n} in a row!`;
    $('#board').appendChild(big); setTimeout(() => big.remove(), 1300);
    praise(n >= 15 ? 2 : n >= 10 ? 1 : 0, G.active?.item.lang);
  }
}
function resolveWord() {
  G.active = null; G.resolved++; G.spawnDelay = 0.35; hud();
  if (G.resolved >= G.total) setTimeout(() => G.running && levelEnd(), 600);
}
function correctActive(byMic) {
  const t = G.active;
  if (!t || !G.running || G.paused) return;
  const sec = t.lineAt == null ? 0 : (performance.now() - t.lineAt - (t.pausedMs - t.pausedAtLine)) / 1000;
  let pts = pointsFor(sec, t.span); if (t.hinted) pts = Math.round(pts / 2);
  mark(t.item, t.hinted || sec > t.span * 0.8 ? 0.5 : 1);
  G.score += pts; G.streak++; G.read++; G.bestStreak = Math.max(G.bestStreak, G.streak); G.times.push(sec);
  floatText('+' + pts + (byMic ? ' 🎤' : ''), t.col * G.colW + 8, t.y);
  popTile(t); beep(true, G.streak); showCombo(); resolveWord();
}
function land() {
  const t = G.active;
  t.y = stackTop(t.col);
  t.el.classList.remove('active'); t.el.classList.add('stacked');
  t.el.onclick = () => openRescue(t);
  G.stacks[t.col].push(t); placeTile(t);
  if (!G.missed.some((m) => m.text === t.item.text)) G.missed.push(t.item);
  mark(t.item, 0);
  G.streak = 0; beep(false); showCombo();
  if (G.stacks[t.col].length >= G.rows) { G.active = null; levelEnd(); return; }
  resolveWord();
}
function mark(item, r) {
  if (item.lang === 'math') return;
  const k = mKey(item.lang, item.text), prev = G.res.get(k);
  G.res.set(k, prev == null ? r : Math.min(prev, r));
}
function relayoutCol(col) { G.stacks[col].forEach((t, i) => { t.y = G.H - (i + 1) * G.rowH; placeTile(t); }); }
function rescue(t) {
  const col = t.col, idx = G.stacks[col].indexOf(t);
  if (idx < 0) return;
  G.stacks[col].splice(idx, 1);
  mark(t.item, 0.5); floatText('✓', col * G.colW + 8, t.y); popTile(t); beep(true); relayoutCol(col); closeRescue();
}
function openRescue(t) {
  if (G.rescueTile) G.rescueTile.el.classList.remove('rescue');
  G.rescueTile = t; t.el.classList.add('rescue');
  $('#rescueWord').textContent = t.item.text; $('#rescueWord').className = 'rescue-word ' + t.item.lang;
  $('#rescuePop').classList.remove('hidden');
}
function closeRescue() { if (G.rescueTile) G.rescueTile.el.classList.remove('rescue'); G.rescueTile = null; $('#rescuePop').classList.add('hidden'); }
$('#rescueSay').onclick = () => G.rescueTile && say(sayText(G.rescueTile.item), G.rescueTile.item.lang);
$('#rescueOk').onclick = () => G.rescueTile && rescue(G.rescueTile);
$('#rescueClose').onclick = closeRescue;

function onHeard(alts) {
  if (!G.running || G.paused) return false;
  if (G.active && matches(G.active.item, alts)) { correctActive(true); return true; }
  for (const col of G.stacks) for (const t of col) {
    if (srLang(t.item.lang) !== recog.lang || t.item.lang === 'math') continue;
    if (normalize(t.item.text).length >= 2 && matches(t.item, alts)) { rescue(t); return true; }
  }
  return false;
}
function frame(now) {
  if (!G.running) return;
  const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now;
  if (!G.paused) {
    if (!G.active) { if (G.queue.length) { G.spawnDelay -= dt; if (G.spawnDelay <= 0) spawn(); } }
    else {
      const t = G.active; t.y += t.v * dt;
      if (t.lineAt == null && t.y + G.rowH >= G.lineY) { t.lineAt = now; t.pausedAtLine = t.pausedMs; t.span = Math.max(0, stackTop(t.col) - t.y) / t.v; }
      if (t.y >= stackTop(t.col)) land(); else placeTile(t);
    }
  } else if (G.active) G.active.pausedMs += dt * 1000;
  G.raf = requestAnimationFrame(frame);
}
function clearBoard() { $$('#board .tile, #board .float, #board .countdown').forEach((e) => e.remove()); }
function startGame(listId, levelIdx) {
  G.list = getList(listId) || currentList();
  if (G.list.words && !G.list.words.length) { toast('This list is empty'); return; }
  if (levelIdx == null) levelIdx = nextLevelIdx(G.list);
  show('game');
  $('#overOverlay').classList.add('hidden'); $('#pauseOverlay').classList.add('hidden'); closeRescue();
  clearBoard(); measure();
  const items = levelItems(G.list, levelIdx);
  Object.assign(G, {
    stacks: Array.from({ length: G.cols }, () => []), active: null, queue: items, levelIdx, total: items.length, resolved: 0,
    score: 0, streak: 0, bestStreak: 0, read: 0, missed: [], res: new Map(), times: [], fallSec: levelSec(levelIdx), colorIdx: 0, paused: false, spawnDelay: 0,
  });
  hud(); showCombo();
  recog.onWords = onHeard;
  recog.setLang(srLang(items[0].lang));
  if (profile().mic === 'mic' && recog.supported) recog.start();
  else { recog.stop(); $('#heard').textContent = recog.supported ? 'Mic off (parent mode)' : 'No speech recognition in this browser'; }
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  warmup(items, G.list, () => countdown(3, () => { G.running = true; G.last = performance.now(); G.raf = requestAnimationFrame(frame); }));
}

// ---------- warm-up: listen, see how it is spelled, say it back ----------
const W = { list: [], i: 0, done: null, lesson: null, timer: 0 };
function warmup(items, list, done) {
  const seen = new Set();
  W.list = items.filter((it) => it.lang !== 'math' && !seen.has(it.lang + it.text) && seen.add(it.lang + it.text) && (list.phonics || !isKnown(it.lang, it.text))).slice(0, list.phonics ? 15 : 8);
  if (!W.list.length || profile().warmup === 'off') { done(); return; }
  Object.assign(W, { i: 0, done, lesson: list.phonics ? TH.LESSONS[G.levelIdx] : null });
  recog.onWords = warmHeard;
  $('#warmOverlay').classList.remove('hidden');
  warmShow();
}
function warmShow() {
  const it = W.list[W.i], th = it.lang === 'th' && typeof TH !== 'undefined';
  clearTimeout(W.timer);
  $('#warmCount').textContent = `${W.i + 1} / ${W.list.length}`;
  $('#warmWord').textContent = it.text; $('#warmWord').className = 'warm-word ' + it.lang;
  const ex = th ? TH.explain(it.text) : null;
  $('#warmParts').innerHTML = (ex || []).map((p) => `<span class="part ${p.k}"><b>${escapeHtml(p.t)}</b><small>${escapeHtml(p.label)}</small></span>`).join('');
  const l = W.lesson || (th && TH.lessonOf[it.text]);
  $('#warmNote').textContent = l ? `${l.title} · ${l.note}` : '';
  W.spell = th ? TH.spellText(it.text) : null;
  $('#warmSpell').classList.toggle('hidden', !W.spell);
  $('#warmHeard').textContent = recog.active ? '🎤 Your turn: say it!' : 'Say it, then tap ✓';
  recog.setLang(srLang(it.lang));
  say(W.spell && (W.lesson || it.text.length > 1) ? W.spell : sayText(it), it.lang);
}
function warmNext() { W.i++; if (W.i >= W.list.length) warmEnd(); else warmShow(); }
function warmEnd() {
  clearTimeout(W.timer);
  $('#warmOverlay').classList.add('hidden');
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  recog.onWords = onHeard;
  if (G.queue[0]) recog.setLang(srLang(G.queue[0].lang));
  const d = W.done; W.done = null; if (d) d();
}
function warmHeard(alts) {
  const it = W.done && W.list[W.i];
  if (!it || !matches(it, alts)) return false;
  beep(true); $('#warmHeard').textContent = '✓ Great!';
  clearTimeout(W.timer); W.timer = setTimeout(warmNext, 700);
  return true;
}
$('#warmSay').onclick = () => { const it = W.list[W.i]; if (it) say(sayText(it), it.lang); };
$('#warmSpell').onclick = () => { const it = W.list[W.i]; if (it && W.spell) say(W.spell, it.lang); };
$('#warmOk').onclick = () => W.done && warmNext();
$('#warmSkip').onclick = () => W.done && warmEnd();
$('#warmQuit').onclick = () => { W.done = null; clearTimeout(W.timer); $('#warmOverlay').classList.add('hidden'); stopGame(); show('home'); renderHome(); };
function countdown(n, done) {
  const c = document.createElement('div'); c.className = 'countdown'; $('#board').appendChild(c);
  const tick = () => { if (n === 0) { c.remove(); done(); return; } c.textContent = n--; setTimeout(tick, 650); };
  tick();
}
function setPaused(p) { if (!G.running) return; G.paused = p; $('#pauseOverlay').classList.toggle('hidden', !p); }
function stopGame() { if (W.done) { W.done = null; $('#warmOverlay').classList.add('hidden'); } G.running = false; cancelAnimationFrame(G.raf); recog.stop(); closeRescue(); }
function levelEnd() {
  stopGame();
  const max = G.total * MAX_PTS, pct = Math.round(G.score / max * 100), passed = pct >= PASS_PCT;
  const p = prog(G.list.id), prev = p[G.levelIdx];
  const isBest = !prev || G.score > prev.score;
  if (isBest) { p[G.levelIdx] = { pct, score: G.score }; save(K.progress, progress); }
  const goal = +profile().goal, before = dayRec().passed;
  const rec = recordDay(passed, G.read, G.score);
  const lr = learn(G.res);
  $('#finLearn').textContent = [
    lr.learned.length ? `New words learned: ${lr.learned.join(' ')}` : '',
    ...lr.change.filter(([, a, b]) => Math.abs(b - a) >= 0.05).map(([l, a, b]) => `${SUBJECTS[l]} reading level ${b > a ? '↑' : '↓'} ${b.toFixed(1)}`),
  ].filter(Boolean).join(' · ');
  const hasNext = G.levelIdx + 1 < levelCount(G.list);
  $('#finTitle').textContent = passed ? `Level ${G.levelIdx + 1} passed! 🎉` : `Level ${G.levelIdx + 1}: try again`;
  $('#finPct').textContent = pct + '%'; $('#finPct').classList.toggle('fail', !passed);
  $('#finBar').style.width = '0'; $('#finBar').style.background = passed ? 'var(--ok)' : 'var(--danger)';
  requestAnimationFrame(() => requestAnimationFrame(() => { $('#finBar').style.width = Math.min(100, pct) + '%'; }));
  $('#finScore').textContent = `${G.score} / ${max}`;
  $('#finRead').textContent = `${G.read} / ${G.total}`;
  $('#finStreak').textContent = G.bestStreak;
  $('#finAvg').textContent = G.times.length ? (G.times.reduce((a, b) => a + b, 0) / G.times.length).toFixed(1) + 's' : '–';
  $('#finBest').textContent = (passed ? (hasNext ? `Level ${G.levelIdx + 2} unlocked. ` : 'All levels passed! ') : `Need ${PASS_PCT}% to pass. `)
    + (isBest && prev ? 'New best score!' : prev ? `Best: ${prev.pct}%` : '');
  $('#finDaily').textContent = rec.passed >= goal
    ? (before < goal ? `Daily goal done! 🔥 ${streak()} day streak` : `Today: ${rec.passed} levels passed 🔥 ${streak()}`)
    : `Today: ${rec.passed}/${goal} levels passed`;
  $('#nextBtn').classList.toggle('hidden', !(passed && hasNext));
  $('#finStars').innerHTML = passed ? starsHtml(pct) : '';
  if (typeof funLevelEnd === 'function') funLevelEnd({ pct, passed, score: G.score, read: G.read, total: G.total, combo: G.bestStreak, fast: G.times.filter((x) => x <= 1).length, avg: G.times.length ? G.times.reduce((a, b) => a + b, 0) / G.times.length : 99, subject: G.list.subject });
  praise(passed ? 3 : 4, G.list.subject === 'mix' ? 'th' : G.list.subject);
  const m = $('#finMissed'); m.innerHTML = '';
  $('#finMissedWrap').classList.toggle('hidden', !G.missed.length);
  for (const it of G.missed) {
    const b = document.createElement('button');
    b.className = 'chip ' + it.lang; b.textContent = '🔊 ' + (it.lang === 'math' ? `${it.plain} = ${it.answer}` : it.text);
    b.onclick = () => say(sayText(it), it.lang); m.appendChild(b);
  }
  $('#overOverlay').classList.remove('hidden');
}
$('#okBtn').onclick = () => correctActive(false);
$('#hintBtn').onclick = () => { if (G.active && G.running && !G.paused) { G.active.hinted = true; say(sayText(G.active.item), G.active.item.lang); } };
$('#pauseBtn').onclick = () => setPaused(true);
$('#resumeBtn').onclick = () => setPaused(false);
$('#quitBtn').onclick = () => { stopGame(); show('home'); renderHome(); };
$('#againBtn').onclick = () => startGame(G.list.id, G.levelIdx);
$('#nextBtn').onclick = () => startGame(G.list.id, G.levelIdx + 1);
$('#menuBtn').onclick = () => { show('home'); renderHome(); };
document.addEventListener('keydown', (e) => {
  if (!$('#game').classList.contains('active') || !G.running) return;
  if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); correctActive(false); }
  if (e.key === 'Escape' || e.key === 'p') setPaused(!G.paused);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && G.running && !G.paused) setPaused(true); });
window.addEventListener('resize', () => {
  if (!G.running) return;
  const oldH = G.H; layout();
  G.stacks.forEach((s, c) => { s.forEach((t) => fitFont(t.el, t.item.text)); relayoutCol(c); });
  if (G.active) { const f = G.H / oldH; G.active.y *= f; G.active.v *= f; fitFont(G.active.el, G.active.item.text); placeTile(G.active); }
});

// ---------- cloud sync (Sign in with Google, Firebase) ----------
const SYNC = [K.lists, K.profiles, K.progress, K.days, K.mastery, K.refs];
const cloudState = { user: null, msg: '' };
function cloudDirty(k) {
  if (cloudQuiet || !SYNC.includes(k)) return;
  localStorage.setItem('twd.cloud.dirty', '1');
  if (Cloud) Cloud.dirty();
}
const cloudCfg = () => load(K.cloud, null);
function parseCloudCfg(text) {
  const t = text.trim();
  try { const o = JSON.parse(t); if (o.apiKey && o.projectId) return o; } catch {}
  const o = {}; for (const m of t.matchAll(/(\w+)\s*:\s*["']([^"']+)["']/g)) o[m[1]] = m[2];
  return o.apiKey && o.projectId ? o : null;
}
const cloudData = () => ({ [K.lists]: lists, [K.profiles]: profiles, [K.progress]: progress, [K.days]: days, [K.mastery]: mastery });
const cloudRefs = () => Object.entries(refs).flatMap(([pid, rs]) => rs.map((r) => ({ ...r, pid, c: 1 })));
function cloudSet(data, refArr) {
  cloudQuiet = true;
  try {
    if (data) {
      if (data[K.lists]) lists = data[K.lists];
      if (data[K.profiles]) profiles = data[K.profiles];
      if (data[K.progress]) progress = data[K.progress];
      if (data[K.days]) days = data[K.days];
      if (data[K.mastery]) mastery = data[K.mastery];
      saveAll(); save(K.mastery, mastery);
    }
    if (refArr) {
      for (const k of Object.keys(refs)) delete refs[k];
      for (const { pid, ...r } of refArr) (refs[pid] ||= []).push(r);
      for (const rs of Object.values(refs)) rs.sort((a, b) => a.id.localeCompare(b.id));
      saveRefs();
    }
    if (profiles.length && !profiles.some((p) => p.id === settings.profileId)) { settings.profileId = profiles[0].id; save(K.settings, settings); }
  } finally { cloudQuiet = false; }
  if ($('#home').classList.contains('active') && profile()) renderHome();
}
const mergeMap = (a = {}, b = {}, f) => { const o = { ...a }; for (const k in b) o[k] = k in o ? f(o[k], b[k]) : b[k]; return o; };
function cloudMerge(remote, remoteRefs, uid) { // first sign-in on this device, or offline edits: keep both sides
  const local = cloudData(), localRefs = cloudRefs();
  if (!Object.keys(remote).length && !remoteRefs.length) return;
  const first = localStorage.getItem('twd.cloud.uid') !== uid, dirty = localStorage.getItem('twd.cloud.dirty') === '1';
  localStorage.setItem('twd.cloud.uid', uid);
  if (!first && !dirty) { // the cloud is the truth; keep only photos made here that never reached it
    const ids = new Set(remoteRefs.map((r) => r.id));
    cloudSet(remote, [...remoteRefs, ...localRefs.filter((r) => !ids.has(r.id) && !findRef(r.id)?.c)]);
    return;
  }
  const rp = remote[K.profiles] || [], map = {};
  const profs = [...rp];
  for (const p of local[K.profiles]) {
    const m = rp.find((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
    if (m) map[p.id] = m.id; else profs.push(p);
  }
  const rk = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [map[k] || k, v]));
  const byId = new Map((remote[K.lists] || []).map((l) => [l.id, l]));
  for (const l of local[K.lists]) if (!byId.has(l.id)) byId.set(l.id, l);
  const best = (x, y) => (y.score > x.score ? y : x);
  const data = {
    [K.profiles]: profs,
    [K.lists]: [...byId.values()],
    [K.progress]: mergeMap(remote[K.progress], rk(local[K.progress]), (x, y) => mergeMap(x, y, (u, v) => mergeMap(u, v, best))),
    [K.days]: mergeMap(remote[K.days], rk(local[K.days]), (x, y) => mergeMap(x, y, (u, v) => mergeMap(u, v, (a, b) => (typeof a === 'number' ? Math.max(a, b) : a)))),
    [K.mastery]: mergeMap(remote[K.mastery], rk(local[K.mastery]), (x, y) => ({ skill: mergeMap(x.skill, y.skill, Math.max), words: mergeMap(x.words, y.words, (a, b) => (b.n > a.n ? b : a)) })),
  };
  const rr = new Map(remoteRefs.map((r) => [r.id, r]));
  for (const r of localRefs) if (!rr.has(r.id)) rr.set(r.id, { ...r, pid: map[r.pid] || r.pid });
  if (map[settings.profileId]) { settings.profileId = map[settings.profileId]; save(K.settings, settings); }
  cloudSet(data, [...rr.values()]);
  localStorage.setItem('twd.cloud.dirty', '1');
}
const findRef = (id) => Object.values(refs).flat().find((r) => r.id === id);
function cloudPushed() {
  cloudQuiet = true;
  let changed = false;
  for (const r of Object.values(refs).flat()) if (!r.c) { r.c = 1; changed = true; }
  if (changed) saveRefs();
  cloudQuiet = false;
  localStorage.setItem('twd.cloud.dirty', '0');
}
async function cloudPhotos() { // upload the big photo of each page once
  if (!Cloud || !cloudState.user) return;
  for (const r of Object.values(refs).flat()) {
    if (r.up) continue;
    const url = await idb.get(r.id);
    if (!url) continue;
    try { await Cloud.putPhoto(r.id, url); r.up = 1; saveRefs(); } catch (e) { console.warn('photo upload', e); return; }
  }
}
function renderCloud() {
  const cfg = cloudCfg(), u = cloudState.user;
  $('#cloudStatus').textContent = !cfg ? 'Not set up yet' : u ? `Signed in as ${u.email || u.displayName}${cloudState.msg ? ' · ' + cloudState.msg : ''}` : cloudState.msg || 'Not signed in';
  $('#cloudSignIn').classList.toggle('hidden', !cfg || !!u);
  $('#cloudSignOut').classList.toggle('hidden', !u);
  $('#cloudLink').classList.toggle('hidden', !cfg);
  $('#cloudSetup').open = !cfg;
  $('#cloudBtn').textContent = u ? '☁️' : '☁️?';
  $('#cloudBtn').title = u ? `Synced with ${u.email || 'Google'}` : 'Sign in with Google to keep photos on every device';
}
async function cloudStart() {
  const cfg = cloudCfg();
  if (!cfg || Cloud) return;
  try {
    const m = await import('./cloud.js');
    Cloud = m.start(cfg, {
      device: (localStorage.getItem('twd.device') || (localStorage.setItem('twd.device', 'd' + Date.now()), localStorage.getItem('twd.device'))),
      data: cloudData, refs: cloudRefs, merge: cloudMerge, apply: cloudSet, pushed: cloudPushed,
      status: (user, msg = '') => { cloudState.user = user; cloudState.msg = msg; renderCloud(); if (user && msg === 'synced') cloudPhotos(); },
    });
  } catch (e) { cloudState.msg = 'Could not load sync: ' + e.message; renderCloud(); }
}
$('#cloudSave').onclick = () => {
  const cfg = parseCloudCfg($('#cloudConfig').value);
  if (!cfg) { toast('Paste the firebaseConfig from the Firebase console'); return; }
  save(K.cloud, cfg); $('#cloudConfig').value = ''; toast('Saved. Now tap “Sign in with Google”'); renderCloud(); cloudStart();
};
$('#cloudSignIn').onclick = async () => {
  if (!Cloud) await cloudStart();
  try { await Cloud.signIn(); } catch (e) { toast('Sign-in failed: ' + (e.code || e.message), 4000); }
};
$('#cloudSignOut').onclick = () => Cloud && confirm('Sign out? This device keeps its copy.') && Cloud.signOut();
$('#cloudLink').onclick = async () => {
  const url = location.origin + location.pathname + '#cloud=' + btoa(unescape(encodeURIComponent(JSON.stringify(cloudCfg()))));
  try { if (navigator.share) await navigator.share({ title: 'Word Drop sync', url }); else { await navigator.clipboard.writeText(url); toast('Link copied. Open it on the other device, then sign in with Google.', 4000); } }
  catch { prompt('Open this link on the other device:', url); }
};
$('#cloudBtn').onclick = () => { showTab('me'); document.getElementById('cloudBox').scrollIntoView({ behavior: 'smooth' }); if (Cloud && !cloudState.user) $('#cloudSignIn').click(); };
function checkCloudHash() {
  const m = location.hash.match(/cloud=([^&]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try { const cfg = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (!cfg.apiKey) throw 0; save(K.cloud, cfg); toast('Sync is set up on this device. Sign in with Google in Settings.', 4000); }
  catch { toast('Could not read the sync link'); }
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', () => { checkCloudHash(); checkHashImport(); renderHome(); cloudStart(); });
window.addEventListener('hashchange', () => { checkCloudHash(); checkHashImport(); renderHome(); cloudStart(); });
window.__twd = { player, praise, smartWords, wordPool, learn, skillOf, cloudMerge, cloudData, cloudRefs, get mastery() { return mastery; }, soundKey, thaiNum, say, recog, refs, bookGrade, bookList, addRef, guessGrade, G, splitText, encodeList, decodeList, onHeard, correctActive, levelItems, getList, numbersIn, parseExpr, matches, mathItem, streak, days, progress };
