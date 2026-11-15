// Thai + English printed-text OCR in the browser: OpenThai 2.0 OCR Text (iApp, Apache-2.0)
// on ONNX Runtime Web. A JavaScript port of the core of the model's runtime/line_engine.py:
// DB text-line detector -> line crops -> CTC line recognizer -> Thai normalisation.
const OpenThai = (() => {
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const BASE = new URL('openthai/', document.baseURI).href;
  const CACHE = 'openthai-v1';
  const DET = { limit: 1280, thresh: 0.2, boxThresh: 0.4, unclip: 1.4, minSize: 3 };
  const REC = { height: 48, maxW: 3200, dropBelow: 0.8, minChars: 2, junkBelow: 0.9, junkInvalid: 0.05 };
  const MEAN = [0.406, 0.456, 0.485], STD = [0.225, 0.224, 0.229]; // RGB order of the BGR-trained detector
  let ready;

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  async function fetchCached(name) {
    const url = BASE + name;
    let cache = null;
    try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return hit; } catch { /* no Cache Storage */ }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`could not download ${name} (${r.status})`);
    if (cache) await cache.put(url, r.clone()).catch(() => {});
    return r;
  }
  function load() {
    return (ready ||= (async () => {
      if (!window.ort) await loadScript(ORT + 'ort.wasm.min.js');
      ort.env.wasm.wasmPaths = ORT;
      ort.env.logLevel = 'error';
      const [det, rec, dict] = await Promise.all(['det.onnx', 'rec.onnx', 'rec_dict.txt'].map(fetchCached));
      const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      return {
        det: await ort.InferenceSession.create(new Uint8Array(await det.arrayBuffer()), opts),
        rec: await ort.InferenceSession.create(new Uint8Array(await rec.arrayBuffer()), opts),
        chars: ['', ...(await dict.text()).split(/\r?\n/).filter(Boolean), ' '],
      };
    })().catch((e) => { ready = null; throw e; }));
  }

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---- detection ----
  function hull(pts) { // monotone chain, pts sorted by x then y
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function minRect(h) { // rotating calipers -> {c, ux, uy, w, h} with u the edge direction nearest horizontal
    let best = null;
    const n = h.length;
    for (let i = 0; i < Math.max(n, 1); i++) {
      const a = h[i], b = h[(i + 1) % n];
      let dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (!L) { dx = 1; dy = 0; L = 1; }
      dx /= L; dy /= L;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of h) { const u = p[0] * dx + p[1] * dy, v = -p[0] * dy + p[1] * dx; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) best = { area, dx, dy, u0, u1, v0, v1 };
    }
    let { dx, dy, u0, u1, v0, v1 } = best;
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    let c = [uc * dx - vc * dy, uc * dy + vc * dx], w = u1 - u0, ht = v1 - v0;
    if (Math.abs(dy) > Math.abs(dx)) { [dx, dy] = [-dy, dx]; [w, ht] = [ht, w]; }
    if (dx < 0) { dx = -dx; dy = -dy; }
    return { c, ux: dx, uy: dy, w, h: ht };
  }
  const corners = (r) => { // tl, tr, br, bl
    const ax = r.ux * r.w / 2, ay = r.uy * r.w / 2, bx = -r.uy * r.h / 2, by = r.ux * r.h / 2;
    return [[r.c[0] - ax - bx, r.c[1] - ay - by], [r.c[0] + ax - bx, r.c[1] + ay - by], [r.c[0] + ax + bx, r.c[1] + ay + by], [r.c[0] - ax + bx, r.c[1] - ay + by]];
  };
  function boxScore(prob, W, H, r) {
    const q = corners(r), xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    let s = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = (x - r.c[0]) * r.ux + (y - r.c[1]) * r.uy, v = -(x - r.c[0]) * r.uy + (y - r.c[1]) * r.ux;
      if (Math.abs(u) <= r.w / 2 + 0.5 && Math.abs(v) <= r.h / 2 + 0.5) { s += prob[y * W + x]; n++; }
    }
    return n ? s / n : 0;
  }
  async function detect(m, src) {
    const W0 = src.width, H0 = src.height, pad = Math.max(8, Math.floor(0.05 * Math.min(W0, H0)));
    const w = W0 + 2 * pad, h = H0 + 2 * pad, s = Math.min(DET.limit / Math.max(h, w), 4);
    const rw = Math.max(32, Math.round(w * s / 32) * 32), rh = Math.max(32, Math.round(h * s / 32) * 32);
    const cv = canvas(rw, rh), ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rw, rh);
    ctx.drawImage(src, pad * rw / w, pad * rh / h, W0 * rw / w, H0 * rh / h);
    const px = ctx.getImageData(0, 0, rw, rh).data, N = rw * rh, x = new Float32Array(3 * N);
    // channel order B, G, R (the model was trained on OpenCV BGR images)
    for (let i = 0; i < N; i++) for (let ch = 0; ch < 3; ch++) x[ch * N + i] = (px[i * 4 + 2 - ch] / 255 - MEAN[2 - ch]) / STD[2 - ch];
    const out = await m.det.run({ [m.det.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, rh, rw]) });
    const t = out[m.det.outputNames[0]], PH = t.dims[2], PW = t.dims[3], prob = t.data;
    const lab = new Int32Array(PW * PH), stack = new Int32Array(PW * PH), boxes = [];
    const sx = w / PW, sy = h / PH;
    let id = 0;
    for (let start = 0; start < PW * PH; start++) {
      if (lab[start] || prob[start] <= DET.thresh) continue;
      id++; let sp = 0; stack[sp++] = start; lab[start] = id;
      const rowMin = new Map(), rowMax = new Map();
      while (sp) {
        const p = stack[--sp], py = (p / PW) | 0, pxx = p - py * PW;
        if (!rowMin.has(py) || pxx < rowMin.get(py)) rowMin.set(py, pxx);
        if (!rowMax.has(py) || pxx > rowMax.get(py)) rowMax.set(py, pxx);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = py + dy, xx = pxx + dx;
          if (yy < 0 || yy >= PH || xx < 0 || xx >= PW) continue;
          const q = yy * PW + xx;
          if (!lab[q] && prob[q] > DET.thresh) { lab[q] = id; stack[sp++] = q; }
        }
      }
      const pts = [];
      for (const [yy, x0] of rowMin) { const x1 = rowMax.get(yy); pts.push([x0, yy], [x0 + 1, yy], [x0, yy + 1], [x1 + 1, yy], [x1 + 1, yy + 1], [x1, yy + 1]); }
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const r = minRect(hull(pts));
      if (Math.min(r.w, r.h) < DET.minSize || boxScore(prob, PW, PH, r) < DET.boxThresh) continue;
      const d = (r.w * r.h) * DET.unclip / (2 * (r.w + r.h)); // offset of a rectangle, as pyclipper does it
      r.w += 2 * d; r.h += 2 * d;
      if (Math.min(r.w, r.h) < DET.minSize + 2) continue;
      const q = corners(r).map(([X, Y]) => [Math.min(W0 - 1, Math.max(0, X * sx - pad)), Math.min(H0 - 1, Math.max(0, Y * sy - pad))]);
      if (Math.max(...q.map((p) => p[0])) - Math.min(...q.map((p) => p[0])) >= 2 && Math.max(...q.map((p) => p[1])) - Math.min(...q.map((p) => p[1])) >= 2) boxes.push(q);
    }
    return boxes;
  }

  // ---- recognition ----
  function crop(src, b) { // quad -> grey line image REC.height tall
    const bw = Math.max(1, Math.max(dist(b[0], b[1]), dist(b[3], b[2]))), bh = Math.max(1, Math.max(dist(b[0], b[3]), dist(b[1], b[2])));
    const H = REC.height, W = Math.min(REC.maxW, Math.max(1, Math.ceil(H * bw / bh)));
    const ex = [(b[1][0] - b[0][0]) / W, (b[1][1] - b[0][1]) / W], ey = [(b[3][0] - b[0][0]) / H, (b[3][1] - b[0][1]) / H];
    const det = ex[0] * ey[1] - ey[0] * ex[1];
    const ia = ey[1] / det, ib = -ex[1] / det, ic = -ey[0] / det, id = ex[0] / det; // inverse of [ex ey]
    const cv = canvas(W, H), ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(ia, ib, ic, id, -(ia * b[0][0] + ic * b[0][1]), -(ib * b[0][0] + id * b[0][1]));
    ctx.drawImage(src, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = px[i * 4 + 3] ? 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2] : NaN;
    // outside the photo: repeat the nearest row (like BORDER_REPLICATE)
    for (let xx = 0; xx < W; xx++) for (let pass = 0; pass < 2; pass++) {
      let last = NaN;
      for (let k = 0; k < H; k++) { const yy = pass ? H - 1 - k : k, i = yy * W + xx; if (Number.isNaN(g[i])) { if (!Number.isNaN(last)) g[i] = last; } else last = g[i]; }
    }
    for (let i = 0; i < g.length; i++) if (Number.isNaN(g[i])) g[i] = 255;
    return { g: flatten(g, W, H), W, H };
  }
  function flatten(g, W, H) { // dark text on white from any background (runtime _flatten)
    const k = Math.max(2, (H / 6) | 0), col = new Float32Array(W);
    for (let xx = 0; xx < W; xx++) { const v = []; for (let yy = 0; yy < k; yy++) v.push(Math.round(g[yy * W + xx]), Math.round(g[(H - 1 - yy) * W + xx])); col[xx] = median(v); }
    const win = Math.max(3, Math.min(H | 1, 255)), r = win >> 1, bg = new Float32Array(W);
    for (let xx = 0; xx < W; xx++) { const v = []; for (let j = xx - r; j <= xx + r; j++) v.push(col[Math.min(W - 1, Math.max(0, j))]); bg[xx] = median(v); }
    const d = new Float32Array(W * H), hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i++) { d[i] = Math.abs(g[i] - bg[i % W]); hist[Math.min(255, d[i] | 0)]++; }
    let acc = 0, hi = 0;
    for (; hi < 256; hi++) { acc += hist[hi]; if (acc >= 0.98 * d.length) break; }
    hi = Math.max(hi, 24);
    for (let i = 0; i < d.length; i++) d[i] = 255 - Math.min(255, d[i] * 255 / hi);
    return d;
  }
  async function recognize(m, line) {
    const { g, W, H } = line, N = W * H, x = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) x[i] = x[N + i] = x[2 * N + i] = (g[i] / 255 - 0.5) / 0.5;
    const out = await m.rec.run({ [m.rec.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, H, W]) });
    const t = out[m.rec.outputNames[0]], T = t.dims[1], C = t.dims[2], p = t.data;
    let text = '', sum = 0, n = 0, prev = -1;
    for (let s = 0; s < T; s++) {
      let best = 0, bv = -Infinity;
      for (let c = 0; c < C; c++) { const v = p[s * C + c]; if (v > bv) { bv = v; best = c; } }
      if (best !== prev && best !== 0) { text += m.chars[best] || ''; sum += bv; n++; }
      prev = best;
    }
    return [text, n ? sum / n : 0];
  }

  // ---- text clean-up (runtime thai_norm.canonical / fix_scripts / invalid_share) ----
  const VOWEL = 'ัิีึืฺุู็', TONE = '่้๊๋์๎', NIK = 'ํ';
  const isCons = (ch) => ch >= '\u0E01' && ch <= '\u0E2E', isThai = (ch) => ch >= '\u0E00' && ch <= '\u0E7F';
  function canonical(s) {
    s = s.replace(/[\u200B-\u200D\u2060\u00AD\uFEFF]/g, '').replace(/\u00A0/g, ' ').normalize('NFC');
    s = s.replace(new RegExp(`[${VOWEL}${TONE}${NIK}]{2,}`, 'g'), (run) => {
      const rank = (c) => (VOWEL.includes(c) ? 0 : TONE.includes(c) ? 1 : 2);
      return [...run].sort((a, b) => rank(a) - rank(b)).filter((c, i, a) => c !== a[i - 1]).join('');
    });
    s = s.replace(/([่-๋]?)ํ([่-๋]?)า/g, '$1$2ำ').replace(/เเ/g, 'แ').replace(/ำำ/g, 'ำ');
    return s.replace(/[ \t\f\v]+/g, ' ').trim();
  }
  const fixScripts = (s) => s.replace(/(?<![A-Za-z])[Ww](?=\.?[\u0E01-\u0E2E\u0E40-\u0E44])/g, 'พ').replace(/(?<=[๐-๙])[Oo0]|[Oo0](?=[๐-๙])/g, '๐');
  function invalidShare(s) {
    const MARKS = VOWEL.replace('็', '') + '็่้๊๋์ํ๎', LEAD = 'เแโใไ';
    let thai = 0, bad = 0;
    [...s].forEach((ch, i, a) => {
      if (!isThai(ch)) return;
      thai++;
      const prev = a[i - 1] || ' ';
      if (MARKS.includes(ch) && !(isCons(prev) || (MARKS.includes(prev) && i >= 2 && isCons(a[i - 2])))) bad++;
      else if (LEAD.includes(ch) && !(i + 1 < a.length && isCons(a[i + 1]))) bad++;
    });
    return thai ? bad / thai : 0;
  }

  // ---- page ----
  const lineH = (b) => dist(b[0], b[3]), lineW = (b) => dist(b[0], b[1]);
  function skew(boxes) {
    const a = boxes.filter((b) => lineW(b) >= 3 * Math.max(lineH(b), 1)).map((b) => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]) * 180 / Math.PI);
    return a.length ? median(a) : 0;
  }
  function rotate(src, deg) {
    const a = deg * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const W = Math.ceil(src.width * cos + src.height * sin), H = Math.ceil(src.width * sin + src.height * cos);
    const cv = canvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.rotate(-a); ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return cv;
  }
  function rows(boxes) { // top to bottom, each left to right, in deskewed coordinates
    const a = -skew(boxes) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const ext = boxes.map((b) => { const ys = b.map((p) => p[0] * s + p[1] * c), xs = b.map((p) => p[0] * c - p[1] * s); return { cy: (Math.min(...ys) + Math.max(...ys)) / 2, cx: (Math.min(...xs) + Math.max(...xs)) / 2 }; });
    const hs = boxes.map(lineH), hmed = median(hs.filter((h, i) => lineW(boxes[i]) >= 2 * h).length >= 3 ? hs.filter((h, i) => lineW(boxes[i]) >= 2 * h) : hs) || 1;
    const out = [];
    for (const i of boxes.map((_, i) => i).sort((p, q) => ext[p].cy - ext[q].cy)) {
      const r = out[out.length - 1];
      if (r && Math.abs(ext[i].cy - r.reduce((t, j) => t + ext[j].cy, 0) / r.length) <= 0.5 * hmed) r.push(i); else out.push([i]);
    }
    return { rows: out.map((r) => r.sort((p, q) => ext[p].cx - ext[q].cx)), hmed };
  }
  function fragments(boxes, texts, hmed) { // stacked marks detected on their own, next to a full line
    const out = new Set();
    if (boxes.length < 3) return out;
    boxes.forEach((b, i) => {
      if (lineH(b) >= 0.35 * hmed || texts[i].replace(/ /g, '').length > 3) return;
      const ext = (q) => [Math.min(...q.map((p) => p[0])), Math.max(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[1]))];
      const [x0, x1, y0, y1] = ext(b);
      if (boxes.some((c, j) => { if (j === i || lineH(c) < 0.6 * hmed) return false; const [cx0, cx1, cy0, cy1] = ext(c); return cx0 <= x1 && x0 <= cx1 && Math.min(Math.abs(y0 - cy1), Math.abs(cy0 - y1)) <= 0.5 * hmed; })) out.add(i);
    });
    return out;
  }

  async function read(src, onProgress = () => {}) {
    onProgress(0.05, 'Loading Thai reader (first time only, about 6 MB)…');
    const m = await load();
    onProgress(0.3, 'Finding the lines…');
    let boxes = await detect(m, src);
    const sk = skew(boxes);
    if (Math.abs(sk) >= 2.5) { src = rotate(src, sk); boxes = await detect(m, src); }
    const texts = [], confs = [];
    for (const [i, b] of boxes.entries()) {
      onProgress(0.35 + 0.6 * i / Math.max(1, boxes.length), `Reading line ${i + 1} of ${boxes.length}…`);
      const [t, c] = await recognize(m, crop(src, b));
      texts.push(fixScripts(canonical(t))); confs.push(c);
    }
    const { rows: order, hmed } = rows(boxes), frag = fragments(boxes, texts, hmed), lines = [];
    const text = order.map((r) => r.filter((i) => {
      const t = texts[i], c = confs[i];
      const ok = !frag.has(i) && t && c >= REC.dropBelow && t.replace(/ /g, '').length >= REC.minChars && !(c < REC.junkBelow && invalidShare(t) > REC.junkInvalid);
      if (ok) lines.push({ text: t, confidence: c });
      return ok;
    }).map((i) => texts[i]).join(' ')).filter(Boolean).join('\n');
    onProgress(1, 'Done');
    return { text, lines };
  }
  return { load, read, langs: ['th', 'en'] };
})();
