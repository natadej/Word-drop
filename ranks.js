'use strict';
// Global leaderboard on Firebase (Firestore REST + anonymous sign-in). The web config is public by design;
// the Firestore security rules (firestore.rules) protect the data.
const FIREBASE_CONFIG = null;
const FB = FIREBASE_CONFIG;
const NICK_A = ['Speedy', 'Happy', 'Brave', 'Lucky', 'Clever', 'Super', 'Mighty', 'Sunny', 'Jolly', 'Rocket', 'Ninja', 'Magic', 'Turbo', 'Cosmic'];
const NICK_B = ['Tiger', 'Panda', 'Eagle', 'Dragon', 'Koala', 'Otter', 'Falcon', 'Puffin', 'Lion', 'Fox', 'Owl', 'Shark', 'Gecko', 'Mango'];
const rollNick = () => `${NICK_A[rand(0, NICK_A.length - 1)]} ${NICK_B[rand(0, NICK_B.length - 1)]} ${rand(1, 99)}`;
const fsBase = () => `projects/${FB.projectId}/databases/(default)/documents`;
const fsUrl = (path) => `https://firestore.googleapis.com/v1/${path}`;

async function fbToken() {
  let a = load('twd.fbauth', null);
  if (a && a.exp > Date.now() + 60e3) return a;
  const keep = (uid, id, refresh, sec) => { a = { uid, id, refresh, exp: Date.now() + sec * 1000 }; save('twd.fbauth', a); return a; };
  if (a?.refresh) {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.refresh),
    });
    if (r.ok) { const j = await r.json(); return keep(j.user_id, j.id_token, j.refresh_token, +j.expires_in); }
  }
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'sign-in failed');
  return keep(j.localId, j.idToken, j.refreshToken, +j.expiresIn);
}
const myDocId = (a) => `${a.uid}_${profile().id}`;

let pushing = null;
async function pushScore() {
  const f = F();
  if (!FB || !f.board?.on) return;
  if (pushing) return pushing;
  pushing = (async () => {
    try {
      const a = await fbToken(), w = weekKey();
      if (f.week !== w) { f.week = w; f.weekXp = 0; }
      const xp = Math.min(f.xp, f.board.synced == null ? 20000 : f.board.synced + 3000);
      const int = (n) => ({ integerValue: String(Math.max(0, Math.round(n))) });
      const fields = { name: { stringValue: f.board.nick }, avatar: { stringValue: f.avatar }, xp: int(xp), weekXp: int(Math.min(f.weekXp, xp)),
        week: { stringValue: w }, trophies: int(Object.keys(f.trophies).length), streak: int(streak()) };
      const r = await fetch(fsUrl(`${fsBase()}:commit`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.id },
        body: JSON.stringify({ writes: [{ update: { name: `${fsBase()}/players/${myDocId(a)}`, fields }, updateTransforms: [{ fieldPath: 'updated', setToServerValue: 'REQUEST_TIME' }] }] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || r.status);
      f.board.synced = xp; saveFun();
      if (xp < f.xp) setTimeout(pushScore, 500);
    } catch (e) { console.warn('leaderboard sync failed', e); } finally { pushing = null; }
  })();
  return pushing;
}
async function fetchBoard(kind) {
  const r = await fetch(fsUrl(`${fsBase()}:runQuery?key=${FB.apiKey}`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'players' }], orderBy: [{ field: { fieldPath: kind === 'week' ? 'weekXp' : 'xp' }, direction: 'DESCENDING' }], limit: 100 } }),
  });
  if (!r.ok) throw new Error('Could not load the leaderboard');
  const val = (v) => (v.integerValue != null ? +v.integerValue : v.stringValue ?? v.timestampValue ?? null);
  let rows = (await r.json()).filter((x) => x.document).map((x) => {
    const o = { id: x.document.name.split('/').pop() };
    for (const [k, v] of Object.entries(x.document.fields || {})) o[k] = val(v);
    return o;
  });
  if (kind === 'week') rows = rows.filter((x) => x.week === weekKey() && x.weekXp > 0).map((x) => ({ ...x, score: x.weekXp }));
  else rows = rows.map((x) => ({ ...x, score: x.xp }));
  return rows;
}

let boardKind = 'week', lastRows = [], myRank = null;
function localRows(kind) {
  return profiles.map((p) => {
    const f = fun[p.id] || { xp: 0, weekXp: 0, avatar: '🐵', trophies: {} };
    return { id: 'local_' + p.id, name: p.name, avatar: f.avatar, score: kind === 'week' ? (f.week === weekKey() ? f.weekXp : 0) : f.xp, me: p.id === profile().id };
  }).sort((a, b) => b.score - a.score);
}
async function renderRanks() {
  const f = F(), list = $('#rankList'), note = $('#rankNote');
  $$('#boardSeg button').forEach((b) => b.classList.toggle('sel', b.dataset.board === boardKind));
  const joined = FB && f.board?.on;
  $('#rankJoin').classList.toggle('hidden', !FB || joined);
  if (FB && !joined) { f.board ||= { nick: rollNick() }; $('#joinNick').textContent = f.board.nick; $('#joinAvatar').textContent = f.avatar; }
  let rows;
  if (!FB) { rows = localRows(boardKind); note.textContent = 'Players on this device. The global leaderboard is coming soon.'; }
  else {
    list.innerHTML = '<li class="loading">Loading…</li>'; note.textContent = '';
    try {
      if (joined) await pushScore();
      rows = await fetchBoard(boardKind);
      const a = load('twd.fbauth', null), mine = a && joined ? myDocId(a) : null;
      rows.forEach((r) => { r.me = r.id === mine; });
      note.textContent = boardKind === 'week' ? 'Weekly league: everyone starts from 0 every Monday.' : 'Top 100 players of all time.';
    } catch (e) { rows = localRows(boardKind); note.textContent = 'Offline: showing players on this device.'; }
  }
  lastRows = rows;
  list.innerHTML = '';
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'rank-row' + (r.me ? ' me' : '');
    li.innerHTML = `<span class="pos">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="avatar">${escapeHtml(r.avatar || '🐵')}</span>
      <span class="nm">${escapeHtml(r.name || '?')}</span><b>${(r.score || 0).toLocaleString()} XP</b>`;
    list.appendChild(li);
  });
  if (!rows.length) list.innerHTML = '<li class="loading">No one yet this week. Be the first!</li>';
  const meIdx = rows.findIndex((r) => r.me); myRank = meIdx >= 0 ? meIdx + 1 : null;
  const me = $('#rankMe');
  me.classList.toggle('hidden', !(joined || !FB));
  me.innerHTML = `<span class="avatar big">${f.avatar}</span><div><b>${escapeHtml(joined ? f.board.nick : profile().name)}</b>
    <small>${myRank ? `#${myRank} ${boardKind === 'week' ? 'this week' : 'all time'}` : 'Play a level to get on the board'}</small></div>
    <button id="shareBtn" class="btn primary small">📤 Share</button>${joined ? '<button id="leaveBtn" class="btn ghost small" title="Leave leaderboard">✕</button>' : ''}`;
  $('#shareBtn').onclick = shareCard;
  const lv = $('#leaveBtn'); if (lv) lv.onclick = leaveBoard;
}
$$('#boardSeg button').forEach((b) => (b.onclick = () => { boardKind = b.dataset.board; renderRanks(); }));
$('#nickRoll').onclick = () => { F().board = { nick: rollNick() }; saveFun(); $('#joinNick').textContent = F().board.nick; };
$('#joinBtn').onclick = async () => {
  const f = F(); f.board = { ...(f.board || { nick: rollNick() }), on: true, synced: null }; saveFun();
  $('#joinBtn').disabled = true;
  await pushScore(); $('#joinBtn').disabled = false;
  renderRanks();
};
async function leaveBoard() {
  if (!confirm('Leave the global leaderboard? Your name will be removed.')) return;
  const f = F();
  try { const a = await fbToken(); await fetch(fsUrl(`${fsBase()}/players/${myDocId(a)}`), { method: 'DELETE', headers: { Authorization: 'Bearer ' + a.id } }); } catch {}
  f.board = null; saveFun(); renderRanks();
}

// ---------- trophy card ----------
function shareCard() {
  const f = F(), t = TIERS[tierOf(f.xp)], c = document.createElement('canvas'), W = 720, H = 900;
  c.width = W; c.height = H;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#5a45c9'); grad.addColorStop(1, '#1b1f3b');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.fillStyle = '#ffcc33';
  g.font = '800 44px "Baloo 2", sans-serif'; g.fillText('Word Drop', W / 2, 80);
  g.font = '200px serif'; g.fillText(f.avatar, W / 2, 310);
  g.fillStyle = '#fff'; g.font = '800 54px "Baloo 2", sans-serif';
  g.fillText(f.board?.on ? f.board.nick : profile().name, W / 2, 400);
  g.font = '700 40px "Baloo 2", sans-serif'; g.fillStyle = '#ffcc33';
  g.fillText(`${t[2]} ${t[1]} rank`, W / 2, 460);
  const stats = [[`${f.xp.toLocaleString()}`, 'XP'], [`🔥 ${streak()}`, 'day streak'], [`🏆 ${Object.keys(f.trophies).length}`, 'trophies']];
  stats.forEach(([v, k], i) => {
    const x = W / 6 + i * W / 3;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(x - 100, 510, 200, 140, 24); g.fill();
    g.fillStyle = '#fff'; g.font = '800 44px "Baloo 2", sans-serif'; g.fillText(v, x, 580);
    g.fillStyle = '#a9addb'; g.font = '600 26px "Baloo 2", sans-serif'; g.fillText(k, x, 620);
  });
  if (myRank) { g.fillStyle = '#3ddc84'; g.font = '800 46px "Baloo 2", sans-serif'; g.fillText(`#${myRank} ${boardKind === 'week' ? 'this week' : 'all time'}`, W / 2, 730); }
  const trophyIcons = TROPHIES.filter(([id]) => f.trophies[id]).map(([, i]) => i).join(' ');
  g.font = '44px serif'; g.fillText(trophyIcons.slice(0, 40), W / 2, 800);
  g.fillStyle = '#a9addb'; g.font = '600 26px "Baloo 2", sans-serif'; g.fillText('Can you beat me? natadej.github.io/Word-drop', W / 2, 865);
  const url = c.toDataURL('image/png');
  $('#shareImg').src = url; $('#shareSave').href = url;
  $('#shareOverlay').classList.remove('hidden');
  $('#shareGo').onclick = async () => {
    const blob = await (await fetch(url)).blob(), file = new File([blob], 'word-drop.png', { type: 'image/png' });
    const data = { files: [file], title: 'Word Drop', text: `I'm ${t[1]} rank in Word Drop with ${f.xp} XP! Can you beat me? https://natadej.github.io/Word-drop/` };
    if (navigator.canShare?.(data)) navigator.share(data).catch(() => {});
    else if (navigator.share) navigator.share({ title: data.title, text: data.text }).catch(() => {});
    else toast('Tap Save to download the picture, then share it');
  };
}
$('#shareClose').onclick = () => $('#shareOverlay').classList.add('hidden');
window.__ranks = { pushScore, fetchBoard, renderRanks, rollNick };
