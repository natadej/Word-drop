'use strict';
// Global leaderboard on Supabase. The URL and publishable key are public by design; the table is closed to the
// browser and only reachable through the wd_* functions in supabase/leaderboard.sql, which check each player's secret.
const SB = { url: 'https://wbsqcvgzhkbhimfjzbef.supabase.co', key: 'sb_publishable_Y_m8UCHzI91O4VrL-kATbg_ijLP_332' };
const NICK_A = ['Speedy', 'Happy', 'Brave', 'Lucky', 'Clever', 'Super', 'Mighty', 'Sunny', 'Jolly', 'Rocket', 'Ninja', 'Magic', 'Turbo', 'Cosmic'];
const NICK_B = ['Tiger', 'Panda', 'Eagle', 'Dragon', 'Koala', 'Otter', 'Falcon', 'Puffin', 'Lion', 'Fox', 'Owl', 'Shark', 'Gecko', 'Mango'];
const rollNick = () => `${NICK_A[rand(0, NICK_A.length - 1)]} ${NICK_B[rand(0, NICK_B.length - 1)]} ${rand(1, 99)}`;
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, '0')).join('');
const newUuid = () => (crypto.randomUUID ? crypto.randomUUID() : randHex(16).replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12})$/, '$1-$2-4$3-a$4-$5'));
async function rpc(fn, args) {
  const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || 'leaderboard error ' + r.status);
  return j;
}

let pushing = null;
async function pushScore() {
  const f = F();
  if (!f.board?.on) return;
  if (pushing) return pushing;
  pushing = (async () => {
    try {
      const w = weekKey(), bd = f.board;
      if (f.week !== w) { f.week = w; f.weekXp = 0; }
      const xp = Math.min(f.xp, bd.synced == null ? 20000 : bd.synced + 3000);
      bd.synced = await rpc('wd_submit', { p_id: bd.id, p_secret: bd.secret, p_name: bd.nick, p_avatar: f.avatar, p_xp: xp, p_week_xp: Math.min(f.weekXp, xp),
        p_week: w, p_trophies: Object.keys(f.trophies).length, p_streak: streak() });
      saveFun();
      if (bd.synced < f.xp) setTimeout(pushScore, 500);
    } catch (e) { console.warn('leaderboard sync failed', e); } finally { pushing = null; }
  })();
  return pushing;
}
async function fetchBoard(kind) {
  return (await rpc('wd_board', { p_kind: kind, p_week: weekKey() })) || [];
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
  const joined = !!f.board?.on;
  $('#rankJoin').classList.toggle('hidden', joined);
  if (!joined) { f.board ||= { nick: rollNick() }; $('#joinNick').textContent = f.board.nick; $('#joinAvatar').textContent = f.avatar; }
  let rows;
  {
    list.innerHTML = '<li class="loading">Loading…</li>'; note.textContent = '';
    try {
      if (joined) await pushScore();
      rows = await fetchBoard(boardKind);
      rows.forEach((r) => { r.me = joined && r.id === f.board.id; });
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
  me.classList.remove('hidden');
  me.innerHTML = `<span class="avatar big">${f.avatar}</span><div><b>${escapeHtml(joined ? f.board.nick : profile().name)}</b>
    <small>${myRank ? `#${myRank} ${boardKind === 'week' ? 'this week' : 'all time'}` : 'Play a level to get on the board'}</small></div>
    <button id="shareBtn" class="btn primary small">📤 Share</button>${joined ? '<button id="leaveBtn" class="btn ghost small" title="Leave leaderboard">✕</button>' : ''}`;
  $('#shareBtn').onclick = shareCard;
  const lv = $('#leaveBtn'); if (lv) lv.onclick = leaveBoard;
}
$$('#boardSeg button').forEach((b) => (b.onclick = () => { boardKind = b.dataset.board; renderRanks(); }));
$('#nickRoll').onclick = () => { F().board = { ...(F().board || {}), nick: rollNick() }; saveFun(); $('#joinNick').textContent = F().board.nick; };
$('#joinBtn').onclick = async () => {
  const f = F(); f.board = { nick: f.board?.nick || rollNick(), id: f.board?.id || newUuid(), secret: f.board?.secret || randHex(24), on: true, synced: null }; saveFun();
  $('#joinBtn').disabled = true;
  await pushScore(); $('#joinBtn').disabled = false;
  renderRanks();
};
async function leaveBoard() {
  if (!confirm('Leave the global leaderboard? Your name will be removed.')) return;
  const f = F();
  try { await rpc('wd_leave', { p_id: f.board.id, p_secret: f.board.secret }); } catch {}
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
