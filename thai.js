'use strict';
// Thai phonics: consonants, vowels, lessons (สระ, แม่ ก กา, มาตราตัวสะกด, วรรณยุกต์ …), syllable breakdown and spelling aloud.
const TH = (() => {
  const CONS = 'ก ไก่ m|ข ไข่ h|ฃ ขวด h|ค ควาย l|ฅ คน l|ฆ ระฆัง l|ง งู l|จ จาน m|ฉ ฉิ่ง h|ช ช้าง l|ซ โซ่ l|ฌ เฌอ l|ญ หญิง l|ฎ ชฎา m|ฏ ปฏัก m|ฐ ฐาน h|ฑ มณโฑ l|ฒ ผู้เฒ่า l|ณ เณร l|ด เด็ก m|ต เต่า m|ถ ถุง h|ท ทหาร l|ธ ธง l|น หนู l|บ ใบไม้ m|ป ปลา m|ผ ผึ้ง h|ฝ ฝา h|พ พาน l|ฟ ฟัน l|ภ สำเภา l|ม ม้า l|ย ยักษ์ l|ร เรือ l|ล ลิง l|ว แหวน l|ศ ศาลา h|ษ ฤๅษี h|ส เสือ h|ห หีบ h|ฬ จุฬา l|อ อ่าง m|ฮ นกฮูก l'
    .split('|').map((s) => s.split(' '));
  const CNAME = Object.fromEntries(CONS.map(([c, n]) => [c, n]));
  const CLASS = Object.fromEntries(CONS.map(([c, , k]) => [c, k]));
  const CLASS_NAME = { m: 'อักษรกลาง', h: 'อักษรสูง', l: 'อักษรต่ำ' };
  const VOWELS = ['อะ', 'อา', 'อิ', 'อี', 'อึ', 'อือ', 'อุ', 'อู', 'เอะ', 'เอ', 'แอะ', 'แอ', 'โอะ', 'โอ', 'เอาะ', 'ออ', 'เออะ', 'เออ', 'เอียะ', 'เอีย', 'เอือะ', 'เอือ', 'อัวะ', 'อัว', 'อำ', 'ใอ', 'ไอ', 'เอา', 'ฤ', 'ฤๅ', 'ฦ', 'ฦๅ'];
  const RUE = { 'ฤ': 'รึ', 'ฤๅ': 'รือ', 'ฦ': 'ลึ', 'ฦๅ': 'ลือ' };
  const SHORT = new Set(['อะ', 'อิ', 'อึ', 'อุ', 'เอะ', 'แอะ', 'โอะ', 'เอาะ', 'เออะ', 'เอียะ', 'เอือะ', 'อัวะ']);
  const TONE = { '\u0E48': 'ไม้เอก', '\u0E49': 'ไม้โท', '\u0E4A': 'ไม้ตรี', '\u0E4B': 'ไม้จัตวา' };
  const MAT = { 'กก': 'กขคฆ', 'กด': 'ดจชซฎฏฐฑฒตถทธศษส', 'กบ': 'บปพฟภ', 'กง': 'ง', 'กน': 'นญณรลฬ', 'กม': 'ม', 'เกย': 'ย', 'เกอว': 'ว' };
  const matOf = (c) => Object.keys(MAT).find((k) => MAT[k].includes(c));
  const sound = (c) => c + 'อ';

  const LOW1 = 'งญณนมยรลวฬ';
  const L = (id, title, en, note, d, words, extra = {}) => ({ id, title, en, note, d, words, ...extra });
  const LESSONS = [
    ...[
      ['cons-m', 'อักษรกลาง 9 ตัว', 'Middle class', 'อักษรกลาง ก จ ฎ ฏ ด ต บ ป อ: ผันวรรณยุกต์ได้ครบ 5 เสียง', (c, k) => k === 'm'],
      ['cons-h', 'อักษรสูง 11 ตัว', 'High class', 'อักษรสูง ข ฃ ฉ ฐ ถ ผ ฝ ศ ษ ส ห', (c, k) => k === 'h'],
      ['cons-lp', 'อักษรต่ำคู่ 14 ตัว', 'Low class (paired)', 'อักษรต่ำคู่ มีเสียงคู่กับอักษรสูง เช่น ค คู่กับ ข, ท คู่กับ ถ', (c, k) => k === 'l' && !LOW1.includes(c)],
      ['cons-ls', 'อักษรต่ำเดี่ยว 10 ตัว', 'Low class (single)', 'อักษรต่ำเดี่ยว ง ญ ณ น ม ย ร ล ว ฬ ไม่มีคู่ในอักษรสูง', (c, k) => k === 'l' && LOW1.includes(c)],
    ].map(([id, title, en, note, f]) => L(id, 'พยัญชนะ: ' + title, 'Consonants: ' + en, note, 0, CONS.filter(([c, , k]) => f(c, k)).map(([c]) => c), { letters: 'cons' })),
    ...[
      ['vow-s', 'สระเสียงสั้น 12 ตัว', 'Short vowels', 'สระเสียงสั้น อ่านสั้นและหยุดทันที: อะ อิ อึ อุ เอะ แอะ โอะ เอาะ เออะ เอียะ เอือะ อัวะ', VOWELS.slice(0, 24).filter((v, i) => i % 2 === 0)],
      ['vow-l', 'สระเสียงยาว 12 ตัว', 'Long vowels', 'สระเสียงยาว คู่กับสระเสียงสั้น: อา อี อือ อู เอ แอ โอ ออ เออ เอีย เอือ อัว', VOWELS.slice(0, 24).filter((v, i) => i % 2 === 1)],
      ['vow-x', 'สระเกิน 8 ตัว', 'Extra vowels', 'สระเกิน มีเสียงพยัญชนะรวมอยู่ด้วย: อำ ใอ ไอ เอา ฤ ฤๅ ฦ ฦๅ', VOWELS.slice(24)],
    ].map(([id, title, en, note, words]) => L(id, 'สระ: ' + title, 'Vowels: ' + en, note, 0, words, { letters: 'vowel' })),
    L('ka-long', 'แม่ ก กา: อา อี อือ อู', 'Long vowels, no final', 'แม่ ก กา คือคำที่ไม่มีตัวสะกด พยัญชนะ + สระ เช่น กอ-อา-กา', 0, ['กา', 'ตา', 'มา', 'ยา', 'นา', 'ขา', 'ดี', 'มี', 'ปี', 'สี', 'ที', 'มือ', 'ถือ', 'คือ', 'ดู', 'งู', 'ปู', 'หู', 'รู']),
    L('ka-eo', 'แม่ ก กา: เอ แอ โอ ออ', 'e, ae, o, or', 'สระ เ- แ- โ- เขียนหน้าพยัญชนะ แต่ออกเสียงหลังพยัญชนะ', 0.2, ['เท', 'เก', 'เต', 'แก', 'แพ', 'แล', 'โต', 'โบ', 'โจ', 'พอ', 'รอ', 'ขอ', 'หอ']),
    L('ka-short', 'สระเสียงสั้น อะ อิ อึ อุ', 'Short vowels', 'สระเสียงสั้นอ่านเร็วๆ สั้นๆ เช่น จอ-อะ-จะ', 0.3, ['จะ', 'นะ', 'คะ', 'มะ', 'ปะ', 'ติ', 'ดุ', 'ผุ', 'ลุ']),
    L('ka-extra', 'สระ อำ ใอ ไอ เอา', 'am, ai, ao', 'สระเกิน: อำ ใอ ไอ เอา มีเสียงตัวสะกดอยู่ในตัว แต่ยังเป็นแม่ ก กา', 0.4, ['ทำ', 'จำ', 'ขำ', 'รำ', 'ใบ', 'ใจ', 'ใส', 'ไป', 'ไฟ', 'ไข', 'เขา', 'เรา', 'เสา', 'เมา']),
    L('ka-dip', 'สระ เอีย เอือ อัว', 'ia, uea, ua', 'สระประสม: เ-ีย เ-ือ -ัว', 0.6, ['เมีย', 'เสีย', 'เปีย', 'เรือ', 'เสือ', 'ตัว', 'วัว', 'หัว', 'มัว', 'รัว']),
    L('tone', 'วรรณยุกต์ ่ ้ ๊ ๋', 'Tone marks', 'ไม้เอก ่ ไม้โท ้ ไม้ตรี ๊ ไม้จัตวา ๋ เขียนบนพยัญชนะ เปลี่ยนเสียงสูงต่ำ', 0.6, ['ไก่', 'แม่', 'พ่อ', 'ป่า', 'ห้า', 'ป้า', 'น้า', 'ไม้', 'โต๊ะ', 'จ๊ะ', 'เก๋', 'จ๋า']),
    L('tone-ladder', 'ผันวรรณยุกต์', 'Tone ladder', 'อักษรกลางผันได้ครบ 5 เสียง: กา ก่า ก้า ก๊า ก๋า (สามัญ เอก โท ตรี จัตวา)', 0.7, ['กา', 'ก่า', 'ก้า', 'ก๊า', 'ก๋า', 'ปา', 'ป่า', 'ป้า', 'ป๊า', 'ป๋า', 'ตา', 'ต่า', 'ต้า', 'ต๊า', 'ต๋า'], { pool: false, order: true }),
    L('kong', 'แม่ กง', 'Final ง', 'ตัวสะกด ง อ่านเสียง ง เช่น ลอ-อิ-งอ-ลิง', 1, ['ลิง', 'ยุง', 'ถุง', 'ขิง', 'ช้าง', 'ยาง', 'ทาง', 'บาง', 'กาง', 'ร้อง']),
    L('kon', 'แม่ กน', 'Final น (ญ ณ ร ล ฬ)', 'ตัวสะกด น ญ ณ ร ล ฬ อ่านเสียง น เช่น การ อ่านว่า กาน', 1, ['กิน', 'บิน', 'ดิน', 'หิน', 'จาน', 'บ้าน', 'คน', 'ฝน', 'คุณ', 'ผล', 'การ']),
    L('kom', 'แม่ กม', 'Final ม', 'ตัวสะกด ม อ่านเสียง ม', 1, ['ส้ม', 'ลม', 'ผม', 'นม', 'ชม', 'ตาม', 'ถาม', 'งาม', 'ยิ้ม', 'ห้าม']),
    L('koei', 'แม่ เกย', 'Final ย', 'ตัวสะกด ย อ่านเสียง ย เช่น ยอ-อา-ยอ-ยาย', 1.1, ['ยาย', 'ขาย', 'ลาย', 'สาย', 'ทาย', 'เลย', 'เคย', 'เนย', 'โดย', 'คอย']),
    L('koeo', 'แม่ เกอว', 'Final ว', 'ตัวสะกด ว อ่านเสียง ว เช่น ขาว แมว', 1.1, ['ขาว', 'ยาว', 'ดาว', 'สาว', 'ข้าว', 'แมว', 'แถว', 'หิว', 'ผิว', 'นิ้ว']),
    L('kok', 'แม่ กก', 'Final ก (ข ค ฆ)', 'ตัวสะกด ก ข ค ฆ อ่านเสียง ก เช่น โชค เมฆ', 1.2, ['นก', 'ปาก', 'ลูก', 'ผัก', 'รัก', 'มาก', 'ยาก', 'ฝาก', 'โชค', 'เมฆ']),
    L('kod', 'แม่ กด', 'Final ด (จ ช ซ ต ถ ท ศ ษ ส …)', 'ตัวสะกด ด จ ช ซ ฎ ฏ ฐ ฑ ฒ ต ถ ท ธ ศ ษ ส อ่านเสียง ด เช่น รถ บาท ราช', 1.3, ['มด', 'กด', 'ปิด', 'พูด', 'เป็ด', 'รถ', 'บาท', 'ราช', 'ทาส', 'จืด']),
    L('kob', 'แม่ กบ', 'Final บ (ป พ ฟ ภ)', 'ตัวสะกด บ ป พ ฟ ภ อ่านเสียง บ เช่น ภาพ บาป', 1.3, ['กบ', 'จับ', 'รับ', 'ดับ', 'ชอบ', 'สิบ', 'ภาพ', 'บาป', 'ลาภ', 'ชีพ']),
    L('cluster', 'คำควบกล้ำ', 'Clusters (ร ล ว)', 'พยัญชนะ 2 ตัวออกเสียงพร้อมกัน เช่น ปล กร คร กล กว ขว', 1.6, ['ปลา', 'ครู', 'กลอง', 'ไกล', 'ใกล้', 'ขวา', 'ปลูก', 'ตรง', 'ครัว', 'กว้าง', 'ความ', 'แปลง']),
    L('lead', 'อักษรนำ', 'Leading ห / อ', 'ห หรือ อ นำหน้า ไม่ออกเสียงตัวเอง แต่ทำให้เสียงวรรณยุกต์เปลี่ยน เช่น หมา หนู อยาก', 1.6, ['หมา', 'หมู', 'หนู', 'หนา', 'หมอ', 'หลับ', 'หวาน', 'หยุด', 'อยาก', 'อย่า']),
    L('multi', 'คำหลายพยางค์', 'Syllables', 'อ่านทีละพยางค์ แล้วอ่านรวมกัน เช่น ทะ-เล', 2, ['ทะ-เล', 'มะ-ลิ', 'ดอก-ไม้', 'ต้น-ไม้', 'แม่-น้ำ', 'ปาก-กา', 'กา-แฟ', 'ชาว-นา', 'มะ-ม่วง', 'ตู้-เย็น', 'ห้อง-เรียน', 'นา-ฬิ-กา']),
    L('karan', 'ตัวการันต์ ์', 'Silent letters', 'ตัวที่มีไม้ทัณฑฆาต ์ อยู่ข้างบน ไม่ต้องออกเสียง เช่น จันทร์ อ่านว่า จัน', 2.5, ['การ์ตูน', 'จันทร์', 'อาทิตย์', 'รถยนต์', 'สัตว์', 'เบอร์', 'ไมค์', 'ฟิล์ม']),
  ];
  const SYL = {};
  for (const l of LESSONS) l.words = l.words.map((w) => { const p = w.split('-'); const t = p.join(''); if (p.length > 1) SYL[t] = p; return t; });

  // ---- one syllable → initial consonant(s), vowel, final consonant (มาตรา), tone ----
  const C = '([ก-ฮ])';
  const BODY = {
    'เ': [[/^าะ$/, 'เอาะ'], [/^า$/, 'เอา'], [/^ียะ$/, 'เอียะ'], [new RegExp(`^ีย${C}?$`), 'เอีย'], [/^ือะ$/, 'เอือะ'], [new RegExp(`^ือ${C}?$`), 'เอือ'],
      [/^อะ$/, 'เออะ'], [/^อ$/, 'เออ'], [new RegExp(`^ิ${C}$`), 'เออ'], [new RegExp(`^็${C}$`), 'เอะ'], [/^ะ$/, 'เอะ'], [/^(ย)$/, 'เออ'], [new RegExp(`^${C}?$`), 'เอ']],
    'แ': [[new RegExp(`^็${C}$`), 'แอะ'], [/^ะ$/, 'แอะ'], [new RegExp(`^${C}?$`), 'แอ']],
    'โ': [[/^ะ$/, 'โอะ'], [new RegExp(`^${C}?$`), 'โอ']],
    'ใ': [[/^$/, 'ใอ']], 'ไ': [[/^$/, 'ไอ']],
    '': [[new RegExp(`^ัว${C}?$`), 'อัว'], [new RegExp(`^ั${C}$`), 'อะ'], [/^ำ$/, 'อำ'], [/^ะ$/, 'อะ'], [new RegExp(`^า${C}?$`), 'อา'],
      [new RegExp(`^ิ${C}?$`), 'อิ'], [new RegExp(`^ี${C}?$`), 'อี'], [new RegExp(`^ึ${C}?$`), 'อึ'], [/^ือ$/, 'อือ'], [new RegExp(`^ื${C}$`), 'อือ'],
      [new RegExp(`^ุ${C}?$`), 'อุ'], [new RegExp(`^ู${C}?$`), 'อู'], [new RegExp(`^อ${C}?$`), 'ออ'], [new RegExp(`^ว${C}$`), 'อัว'], [new RegExp(`^${C}$`), '~โอะ']],
  };
  function body(lead, rest) {
    for (const [re, v] of BODY[lead]) { const m = rest.match(re); if (m) return { vowel: v, final: m[1] || null }; }
    return null;
  }
  function parse(syl) {
    if (!syl || /[^\u0E01-\u0E4E]/.test(syl) || /\u0E4C/.test(syl)) return null;
    const tm = syl.match(/[\u0E48-\u0E4B]/), s = syl.replace(/[\u0E48-\u0E4B]/g, '');
    const lm = s.match(/^([เแโใไ])(.+)$/), lead = lm ? lm[1] : '', r = lm ? lm[2] : s;
    if (!/^[ก-ฮ]/.test(r)) return null;
    const tries = [];
    if (/^ห[งญนมยรลว]./.test(r) || /^อย./.test(r)) tries.push({ init: r.slice(0, 2), lead2: true });
    if (/^([กขค][รลว]|ตร|[ปพ][รล])/.test(r)) tries.push({ init: r.slice(0, 2), cluster: true });
    tries.push({ init: r[0] });
    for (const t of tries) {
      const b = body(lead, r.slice(t.init.length));
      if (!b || (t.cluster && b.vowel === '~โอะ' && !b.final) || (t.cluster && !lead && r.length === 2)) continue;
      if (b.vowel === 'อัว' && b.final == null && /^ว/.test(r.slice(t.init.length)) && !/^ัว/.test(r.slice(t.init.length))) continue;
      const mat = b.final ? matOf(b.final) : null;
      if (b.final && !mat) continue;
      return { syl, plain: s, lead, init: t.init, nam: !!t.lead2, cluster: !!t.cluster, vowel: b.vowel, short: SHORT.has(b.vowel), final: b.final, mat: mat || 'ก กา', tone: tm ? tm[0] : null };
    }
    return null;
  }
  const syllables = (w) => SYL[w] || [w];
  function parts(word) { // pieces to show, or null when the word can't be broken down
    const out = [];
    for (const syl of syllables(word)) {
      const p = parse(syl);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }
  function spellText(word) { // e.g. บ้าน → "บอ อา นอ บาน ไม้โท บ้าน"
    const ps = parts(word); if (!ps) return null;
    const bits = ps.map((p) => {
      const init = p.nam ? [p.init[0], p.init[1]] : [...p.init];
      const seq = [...init.map(sound), ...(p.vowel === '~โอะ' ? [] : [p.vowel]), ...(p.final ? [sound(p.final)] : [])];
      return [...seq, p.plain, ...(p.tone ? [TONE[p.tone], p.syl] : [])].join(' ');
    });
    return bits.join(', ') + (ps.length > 1 ? ', ' + word : '');
  }
  const letterKind = (t) => (CNAME[t] ? 'cons' : VOWELS.includes(t) ? 'vowel' : null);
  function sayFor(t) {
    if (CNAME[t]) return `${sound(t)} ${CNAME[t]}`;
    if (RUE[t]) return `ตัว ${RUE[t]}`;
    if (VOWELS.includes(t)) return `สระ ${t}`;
    return null;
  }
  function accept(t) { // extra things the child may say for a letter
    if (CNAME[t]) return { strict: true, alt: [sound(t) + CNAME[t], CNAME[t]] };
    if (RUE[t]) return { strict: true, alt: [RUE[t]] };
    return null;
  }
  function explain(word) { // [{t, k, label}] for the warm-up card
    const k = letterKind(word);
    if (k === 'cons') return [{ t: word, k: 'init', label: `${sound(word)} ${CNAME[word]} · ${CLASS_NAME[CLASS[word]]}` }];
    if (k === 'vowel') return [{ t: word, k: 'vowel', label: RUE[word] ? `อ่านว่า ${RUE[word]}` : `สระ${word} · ${SHORT.has(word) ? 'เสียงสั้น' : 'เสียงยาว'}` }];
    if (/\u0E4C/.test(word)) {
      const SIL = /(ทร|[ก-ฮ][ิุ]?)์/g, silent = word.match(SIL) || [];
      return [{ t: word.replace(SIL, ''), k: 'plain', label: 'อ่านว่า' }, ...silent.map((s) => ({ t: s, k: 'silent', label: 'ตัวการันต์ ไม่ออกเสียง' }))];
    }
    const ps = parts(word); if (!ps) return null;
    const out = [];
    ps.forEach((p, i) => {
      if (ps.length > 1) out.push({ t: p.syl, k: 'syl', label: `พยางค์ที่ ${i + 1}` });
      out.push({ t: p.init, k: 'init', label: p.nam ? `อักษรนำ ${p.init[0]} + ${p.init[1]}` : p.cluster ? 'คำควบกล้ำ' : `พยัญชนะต้น · ${CLASS_NAME[CLASS[p.init]]}` });
      out.push({ t: p.vowel === '~โอะ' ? '(โอะ)' : p.vowel, k: 'vowel', label: p.vowel === '~โอะ' ? 'สระโอะ ลดรูป (ไม่เขียน)' : `สระ${p.vowel}${p.short ? ' (สั้น)' : ''}` });
      out.push(p.final ? { t: p.final, k: 'final', label: `ตัวสะกด · แม่ ${p.mat}` } : { t: 'ก กา', k: 'final', label: 'ไม่มีตัวสะกด · แม่ ก กา' });
      if (p.tone) out.push({ t: p.tone, k: 'tone', label: TONE[p.tone] });
    });
    return out;
  }
  const lessonOf = Object.fromEntries(LESSONS.filter((l) => !l.letters).flatMap((l) => l.words.map((w) => [w, l])).reverse());
  return { LESSONS, CONS, VOWELS, parse, parts, explain, spellText, sayFor, accept, letterKind, lessonOf, matOf };
})();
if (typeof module !== 'undefined') module.exports = TH;
