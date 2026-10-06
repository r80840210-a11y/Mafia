'use strict';
// Авторитетная серверная логика комнат и игры (Socket.IO). Клиент только отправляет намерения.
const crypto = require('crypto'), E = require('../shared/engine'), db = require('./db');
const rooms = new Map(), roomOf = new Map();
let io;
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const clamp = (v, a, b, d) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const DEF = { maxPlayers: 6, mode: 'classic', revealRoles: true, anonymous: true, allowTie: true, tieMode: 'none', spectators: true, autoStart: false, friendsOnly: false, deadChat: true, selfHeal: true, healRepeat: false, dayTime: 90, nightTime: 45, voteTime: 30, extras: [], customRoles: null };
function clean(s, prev) {
  const o = { ...prev }; s = s || {};
  o.maxPlayers = clamp(s.maxPlayers, 4, 10, o.maxPlayers);
  if (['classic', 'fast', 'chaos', 'friends'].includes(s.mode)) o.mode = s.mode;
  for (const k of ['revealRoles', 'anonymous', 'allowTie', 'spectators', 'autoStart', 'friendsOnly', 'deadChat', 'selfHeal', 'healRepeat']) if (typeof s[k] === 'boolean') o[k] = s[k];
  if (['none', 'revote', 'random'].includes(s.tieMode)) o.tieMode = s.tieMode;
  o.dayTime = clamp(s.dayTime, 30, 180, o.dayTime); o.nightTime = clamp(s.nightTime, 20, 120, o.nightTime); o.voteTime = clamp(s.voteTime, 15, 90, o.voteTime);
  if (Array.isArray(s.extras)) o.extras = s.extras.filter(x => E.EXTRA.includes(x));
  if ('customRoles' in s) {
    if (s.customRoles === null) o.customRoles = null;
    else if (typeof s.customRoles === 'object') { const c = {}; for (const k in s.customRoles) if (E.ROLES[k]) c[k] = clamp(s.customRoles[k], 0, 10, 0); o.customRoles = c; }
  }
  if (o.mode === 'friends') o.friendsOnly = true;
  return o;
}
const genCode = () => { for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += CH[crypto.randomInt(CH.length)]; if (!rooms.has(c)) return c; } };
const members = r => [...r.players.values(), ...r.spectators.values()];
const send = (m, ev, d) => { if (m && m.sid && m.connected !== false) io.to(m.sid).emit(ev, d); };
const emitAll = (r, ev, d) => members(r).forEach(m => send(m, ev, d));
const log = (r, text, kind) => { r.log.push({ text, kind: kind || '', day: r.day }); if (r.log.length > 80) r.log.shift(); };
const isMafia = p => p && p.role && E.TEAM(p.role) === 'mafia';
const alive = r => [...r.players.values()].filter(p => p.alive !== false && !p.left);

function view(r, uid) {
  const me = r.players.get(uid), over = r.phase === 'GAME_OVER', started = r.phase !== 'LOBBY', maf = isMafia(me);
  const players = [...r.players.values()].map(p => ({
    id: p.id, nick: p.nick, avatar: p.avatar, ready: p.ready, connected: p.connected, host: p.id === r.hostId, alive: p.alive !== false, cause: p.alive === false ? p.cause : undefined,
    role: over || p.id === uid || (maf && isMafia(p)) || (started && p.alive === false && r.settings.revealRoles) ? p.role || null : null
  }));
  const chat = {};
  if (!started) chat.lobby = r.chat.lobby; else {
    chat.day = r.chat.day; if (maf || over) chat.mafia = r.chat.mafia;
    if ((me && me.alive === false && r.settings.deadChat) || over) chat.dead = r.chat.dead;
  }
  const mine = {}, team = {};
  for (const a of r.actions.values()) { if (a.actor === uid) mine[a.kind] = a.target; if (maf && a.kind === 'kill' && isMafia(r.players.get(a.actor))) team[r.players.get(a.actor).nick] = r.players.get(a.target).nick; }
  const v = {
    code: r.code, phase: r.phase, day: r.day, endsAt: r.endsAt, settings: r.settings, players, spectator: !me, log: r.log.slice(-25), chat,
    me: me ? { id: uid, role: me.role || null, alive: me.alive !== false, kinds: me.alive !== false && me.role ? E.ROLES[me.role].kinds : [], witch: r.st && r.st.witch[uid], shot: r.st && r.st.shot[uid], lastHeal: r.st && r.st.lastHeal[uid] } : null,
    picks: mine, teamPicks: team, priv: r.priv[uid] || [], morning: r.morning, lastVote: r.lastVote, candidates: r.candidates, winner: r.winner, final: r.final
  };
  if (r.phase === 'VOTING') { v.myVote = r.votes[uid] === undefined ? undefined : r.votes[uid]; v.votedCount = Object.keys(r.votes).length; v.voters = alive(r).length; }
  return v;
}
const broadcast = r => members(r).forEach(m => send(m, 'state', view(r, m.id)));

function setPhase(r, phase, secs) {
  r.phase = phase; r.endsAt = secs ? Date.now() + secs * 1000 : 0; clearTimeout(r.timer);
  if (secs) r.timer = setTimeout(() => onTimer(r), secs * 1000 + 50);
  emitAll(r, 'phaseChanged', { phase, day: r.day }); broadcast(r);
}
function onTimer(r) {
  if (!rooms.has(r.code)) return;
  switch (r.phase) {
    case 'NIGHT': return endNight(r);
    case 'DAY': { const w = E.checkWin(r.st); return w ? gameOver(r, w) : setPhase(r, 'DISCUSSION', r.settings.dayTime); }
    case 'DISCUSSION': r.votes = {}; r.voteRound = 1; r.candidates = null; return setPhase(r, 'VOTING', r.settings.voteTime);
    case 'VOTING': return endVoting(r);
    case 'RESULT': { const w = E.checkWin(r.st); return w ? gameOver(r, w) : startNight(r); }
  }
}
function startNight(r) {
  r.day++; r.actions.clear(); r.morning = null; r.lastVote = null; r.candidates = null;
  log(r, `🌙 Ночь ${r.day}. Город засыпает…`, 'night'); setPhase(r, 'NIGHT', r.settings.nightTime);
}
function endNight(r) {
  const res = E.resolveNight(r.st, [...r.actions.values()]);
  for (const id in res.stats) for (const k in res.stats[id]) r.stats[id][k] += res.stats[id][k];
  for (const id in res.priv) (r.priv[id] = r.priv[id] || []).push(...res.priv[id].map(m => `Ночь ${r.day}: ${m}`));
  r.morning = { deaths: res.deaths.map(d => { const p = r.players.get(d.id); p.cause = 'night'; return { id: d.id, nick: p.nick, role: r.settings.revealRoles ? p.role : null }; }) };
  if (res.deaths.length) { log(r, '☀️ Этой ночью погиб: ' + r.morning.deaths.map(d => d.nick + (d.role ? ` (${E.ROLES[d.role].name})` : '')).join(', '), 'death'); res.deaths.forEach(d => emitAll(r, 'playerDied', { id: d.id })); }
  else log(r, '☀️ Этой ночью никто не погиб.');
  setPhase(r, 'DAY', 7);
}
function endVoting(r) {
  const tieMode = !r.settings.allowTie ? 'random' : (r.settings.tieMode === 'revote' && r.voteRound >= 2 ? 'none' : r.settings.tieMode);
  const t = E.tally(r.votes, tieMode);
  if (t.tie && tieMode === 'revote') {
    r.voteRound = 2; r.candidates = t.top; r.votes = {}; log(r, '⚖️ НИЧЬЯ — повторное голосование', 'tie'); return setPhase(r, 'VOTING', r.settings.voteTime);
  }
  const byId = id => r.players.get(id), name = id => byId(id).nick;
  r.lastVote = { counts: Object.fromEntries(Object.entries(t.counts).map(([id, n]) => [name(id), n])), tie: t.tie, executed: t.executed ? { id: t.executed, nick: name(t.executed), role: r.settings.revealRoles || byId(t.executed).role === 'jester' ? byId(t.executed).role : null } : null, list: r.settings.anonymous ? null : Object.entries(r.votes).map(([v, tg]) => `${name(v)} → ${tg ? name(tg) : 'воздержался'}`) };
  Object.entries(r.votes).forEach(([v]) => { if (r.stats[v]) r.stats[v].votes++; });
  if (t.executed) {
    const p = byId(t.executed); p.alive = false; p.cause = 'vote';
    if (p.role === 'jester') { r.jesterWon[p.id] = true; log(r, `🤡 ${p.nick} был Шутом — он победил! Игра продолжается.`, 'death'); }
    else log(r, `⚖️ ${p.nick} был казнён городом` + (r.settings.revealRoles ? ` (${E.ROLES[p.role].name})` : ''), 'death');
    emitAll(r, 'playerDied', { id: p.id });
  } else log(r, t.tie ? '⚖️ НИЧЬЯ — никто не казнён' : 'Никто не казнён.', 'tie');
  setPhase(r, 'RESULT', 7);
}
function gameOver(r, winner) {
  r.winner = winner; const ps = [...r.players.values()];
  const rows = ps.map(p => ({ id: p.id, nick: p.nick, role: p.role, won: E.didWin(p, winner, r.jesterWon) }));
  const score = p => { const s = r.stats[p.id]; return (r.stats[p.id] ? s.kills * 2 + s.checks + s.saves * 2 : 0); };
  const best = ps.filter(p => rows.find(x => x.id === p.id).won).sort((a, b) => score(b) - score(a))[0] || ps[0];
  r.final = { rows: rows.map(x => ({ nick: x.nick, role: x.role, result: x.won ? 'Победа' : 'Поражение' })), nights: r.day, duration: Math.round((Date.now() - r.startedAt) / 1000), best: best ? `${E.ROLES[best.role].name} ${best.nick}` : '—' };
  log(r, { town: '🏆 ПОБЕДА МИРНЫХ', mafia: '🔴 ПОБЕДА МАФИИ', maniac: '☠️ МАНЬЯК ПОБЕДИЛ' }[winner], 'win');
  db.saveResults(rows.map(x => { const s = r.stats[x.id]; return { userId: Number(x.id), role: x.role, won: x.won, survivor: winner === 'maniac' && x.role === 'maniac', kills: s.kills, checks: s.checks, saves: s.saves, votes: s.votes }; })).catch(() => { });
  emitAll(r, 'gameEnded', { winner }); setPhase(r, 'GAME_OVER', 0);
}
function startGame(r) {
  const ps = [...r.players.values()]; if (ps.length < 4) return 'Нужно минимум 4 игрока';
  if (ps.some(p => !p.ready)) return 'Не все игроки готовы';
  let roles;
  if (r.settings.customRoles) { roles = E.expand(r.settings.customRoles); if (roles.length !== ps.length) return `Набор ролей (${roles.length}) не совпадает с числом игроков (${ps.length})`; }
  else roles = E.autoCounts(ps.length, r.settings.extras, r.settings.mode === 'chaos') && E.expand(E.autoCounts(ps.length, r.settings.extras, r.settings.mode === 'chaos'));
  const mafia = roles.filter(x => E.TEAM(x) === 'mafia').length, others = roles.length - mafia;
  if (mafia < 1 && !roles.includes('maniac')) return 'В наборе должна быть мафия или маньяк';
  if (mafia >= others && mafia > 0) return 'Мафии слишком много для этого набора';
  E.shuffle(roles).forEach((role, i) => { ps[i].role = role; ps[i].cause = null; });
  r.st = E.newState(ps, { selfHeal: r.settings.selfHeal, healRepeat: r.settings.healRepeat });
  r.stats = {}; ps.forEach(p => r.stats[p.id] = { kills: 0, checks: 0, saves: 0, votes: 0 });
  r.priv = {}; r.log = []; r.chat = { lobby: r.chat.lobby, day: [], mafia: [], dead: [] }; r.day = 0; r.winner = null; r.final = null; r.jesterWon = {}; r.startedAt = Date.now();
  emitAll(r, 'roleAssigned', {}); startNight(r); return null;
}
function newRoom(user, settings) {
  const r = { code: genCode(), hostId: user.id, settings: clean(settings, DEF), players: new Map(), spectators: new Map(), phase: 'LOBBY', day: 0, endsAt: 0, timer: null, st: null, actions: new Map(), votes: {}, voteRound: 1, candidates: null, log: [], chat: { lobby: [], day: [], mafia: [], dead: [] }, priv: {}, stats: {}, jesterWon: {}, morning: null, lastVote: null, winner: null, final: null, createdAt: Date.now() };
  rooms.set(r.code, r); addPlayer(r, user, true); return r;
}
function addPlayer(r, user, host) {
  r.players.set(user.id, { id: user.id, nick: user.nick, avatar: user.avatar, ready: !!host, connected: true, sid: user.sid, alive: true });
  roomOf.set(user.id, r.code);
}
function removeRoom(r) { clearTimeout(r.timer); members(r).forEach(m => roomOf.delete(m.id)); rooms.delete(r.code); }
function transferHost(r) {
  if (r.players.has(r.hostId) && !r.players.get(r.hostId).left && r.players.get(r.hostId).connected) return;
  const n = [...r.players.values()].find(p => !p.left && p.connected) || [...r.players.values()].find(p => !p.left);
  if (n) { r.hostId = n.id; n.ready = true; log(r, `👑 ${n.nick} — новый хост`); }
}
function leave(r, uid) {
  const p = r.players.get(uid);
  if (!p) { r.spectators.delete(uid); roomOf.delete(uid); return broadcast(r); }
  roomOf.delete(uid);
  if (r.phase === 'LOBBY' || r.phase === 'GAME_OVER') r.players.delete(uid);
  else { p.left = true; p.connected = false; if (p.alive !== false) { p.alive = false; p.cause = 'left'; log(r, `🚪 ${p.nick} покинул игру`); } }
  if (![...r.players.values()].some(x => !x.left)) return removeRoom(r);
  transferHost(r);
  if (r.st && !['LOBBY', 'GAME_OVER'].includes(r.phase)) { const w = E.checkWin(r.st); if (w) return gameOver(r, w); }
  broadcast(r);
}
const lastMsg = new Map();
function attach(server) {
  io = server;
  setInterval(() => { const now = Date.now(); for (const r of [...rooms.values()]) if (!members(r).some(m => m.connected !== false) && now - (r.emptySince = r.emptySince || now) > 10 * 60e3) removeRoom(r); else if (members(r).some(m => m.connected !== false)) r.emptySince = 0; }, 60e3).unref();
  io.on('connection', socket => {
    const u = { ...socket.data.user, sid: socket.id };
    const code = roomOf.get(u.id), room0 = code && rooms.get(code);
    if (room0) {
      const m = room0.players.get(u.id) || room0.spectators.get(u.id);
      if (m) { if (m.sid && m.sid !== socket.id) io.to(m.sid).emit('kicked', { reason: 'Вы вошли с другого устройства' }); m.sid = socket.id; m.connected = true; m.nick = u.nick; m.avatar = u.avatar; clearTimeout(m.dc); socket.emit('rejoinAvailable', { code, phase: room0.phase }); }
    }
    const R = () => rooms.get(roomOf.get(u.id));
    const on = (ev, fn) => socket.on(ev, (d, cb) => { cb = typeof cb === 'function' ? cb : () => { }; try { const e = fn(d || {}, R()); cb(e && e.error ? e : { ok: true, ...(e || {}) }); } catch (e) { console.error(ev, e); cb({ error: 'Ошибка сервера' }); } });
    const err = error => ({ error });
    const host = r => r && r.hostId === u.id;
    function enter(r) { socket.join('r' + r.code); broadcast(r); }

    on('createRoom', d => { if (roomOf.has(u.id)) return err('Вы уже участвуете в игре. Вернитесь в неё или выйдите.'); const r = newRoom(u, d.settings); enter(r); return { code: r.code }; });
    on('joinRoom', d => {
      if (roomOf.has(u.id)) return err('Вы уже участвуете в игре. Вернитесь в неё или выйдите.');
      const r = rooms.get(String(d.code || '').toUpperCase().trim()); if (!r) return err('Комната не найдена');
      if (r.phase === 'LOBBY') { if (r.players.size >= r.settings.maxPlayers) return err('В комнате нет свободных мест'); addPlayer(r, u); log(r, `${u.nick} присоединился`); }
      else if (r.settings.spectators) { r.spectators.set(u.id, { id: u.id, nick: u.nick, sid: socket.id, connected: true }); roomOf.set(u.id, r.code); }
      else return err('Игра уже началась');
      enter(r); return { code: r.code };
    });
    on('quickPlay', () => {
      if (roomOf.has(u.id)) return err('Вы уже участвуете в игре.');
      let r = [...rooms.values()].find(x => x.phase === 'LOBBY' && !x.settings.friendsOnly && x.players.size < x.settings.maxPlayers);
      if (r) { addPlayer(r, u); log(r, `${u.nick} присоединился`); } else r = newRoom(u, { mode: 'classic' });
      enter(r); return { code: r.code };
    });
    on('reconnect', (d, r) => { if (!r) return err('Игра не найдена'); const m = r.players.get(u.id) || r.spectators.get(u.id); m.sid = socket.id; m.connected = true; enter(r); log(r, `${u.nick} вернулся в игру`); broadcast(r); });
    on('leaveRoom', (d, r) => { if (r) { socket.leave('r' + r.code); leave(r, u.id); } });
    on('playerReady', (d, r) => {
      const p = r && r.players.get(u.id); if (!p || r.phase !== 'LOBBY') return err('Недоступно');
      p.ready = host(r) ? true : !!d.ready; broadcast(r);
      if (r.settings.autoStart && r.players.size === r.settings.maxPlayers && [...r.players.values()].every(x => x.ready)) { const e = startGame(r); if (e) emitAll(r, 'toast', { text: e }); }
    });
    on('updateSettings', (d, r) => {
      if (!host(r) || r.phase !== 'LOBBY') return err('Только хост в лобби');
      const s = clean(d.settings, r.settings); if (s.maxPlayers < r.players.size) return err('Нельзя поставить меньше, чем игроков в комнате');
      r.settings = s; broadcast(r);
    });
    on('kick', (d, r) => {
      if (!host(r) || r.phase !== 'LOBBY' || d.id === u.id) return err('Недоступно');
      const p = r.players.get(String(d.id)); if (!p) return err('Игрок не найден');
      send(p, 'kicked', { reason: 'Хост исключил вас из комнаты' }); r.players.delete(p.id); roomOf.delete(p.id); broadcast(r);
    });
    on('closeRoom', (d, r) => { if (!host(r)) return err('Только хост'); emitAll(r, 'closed', {}); removeRoom(r); });
    on('startGame', (d, r) => { if (!host(r) || r.phase !== 'LOBBY') return err('Только хост в лобби'); const e = startGame(r); if (e) return err(e); });
    on('backToLobby', (d, r) => {
      if (!host(r) || r.phase !== 'GAME_OVER') return err('Только хост после игры');
      for (const p of [...r.players.values()]) { if (p.left || !p.connected) { r.players.delete(p.id); roomOf.delete(p.id); } else { p.ready = p.id === r.hostId; p.alive = true; p.role = null; } }
      r.st = null; r.winner = null; r.final = null; r.log = []; r.priv = {}; r.morning = null; r.lastVote = null; r.day = 0; setPhase(r, 'LOBBY', 0);
    });
    on('nightAction', (d, r) => {
      if (!r || r.phase !== 'NIGHT') return err('Сейчас не ночь');
      const kind = String(d.kind), target = d.target === null ? null : String(d.target), key = u.id + ':' + kind;
      if (target === null) { r.actions.delete(key); return broadcast(r); }
      const e = E.validate(r.st, u.id, kind, target); if (e) return err(e);
      r.actions.set(key, { actor: u.id, kind, target }); broadcast(r);
    });
    on('vote', (d, r) => {
      if (!r || r.phase !== 'VOTING') return err('Сейчас не голосование');
      const me = r.players.get(u.id); if (!me || me.alive === false) return err('Вы не можете голосовать');
      const t = d.target === null ? null : String(d.target);
      if (t !== null) { const tp = r.players.get(t); if (!tp || tp.alive === false) return err('Неверная цель'); if (t === u.id) return err('Нельзя голосовать за себя'); if (r.candidates && !r.candidates.includes(t)) return err('Голосуем только за ничейных'); }
      r.votes[u.id] = t; send(me, 'voteCast', {});
      if (Object.keys(r.votes).length >= alive(r).length) { clearTimeout(r.timer); endVoting(r); } else broadcast(r);
    });
    const chatHandler = forceMafia => (d, r) => {
      if (!r) return err('Нет комнаты'); const text = String(d.text || '').trim().slice(0, 300); if (!text) return err('Пустое сообщение');
      const now = Date.now(); if (now - (lastMsg.get(u.id) || 0) < 600) return err('Не так быстро'); lastMsg.set(u.id, now);
      const me = r.players.get(u.id); let ch, to;
      if (r.phase === 'LOBBY') { ch = 'lobby'; to = members(r); if (!me) return err('Недоступно'); }
      else if (!me) return err('Наблюдатели не пишут');
      else if (me.alive === false && r.phase !== 'GAME_OVER') { if (!r.settings.deadChat) return err('Чат мёртвых выключен'); ch = 'dead'; to = [...r.players.values()].filter(p => p.alive === false); }
      else if (forceMafia) { if (r.phase !== 'NIGHT' || !isMafia(me)) return err('Недоступно'); ch = 'mafia'; to = [...r.players.values()].filter(isMafia); }
      else if (r.phase === 'NIGHT') return err('Ночью город молчит');
      else { ch = 'day'; to = members(r); }
      const msg = { ch, from: me.nick, text, t: now }; r.chat[ch].push(msg); if (r.chat[ch].length > 100) r.chat[ch].shift();
      to.forEach(m => send(m, 'chat', msg));
    };
    on('chatMessage', chatHandler(false)); on('mafiaMessage', chatHandler(true));
    socket.on('disconnect', () => {
      const r = R(); if (!r) return; const m = r.players.get(u.id) || r.spectators.get(u.id); if (!m || m.sid !== socket.id) return;
      m.connected = false;
      if (r.spectators.has(u.id)) { r.spectators.delete(u.id); roomOf.delete(u.id); return; }
      log(r, `${m.nick} отключился`); emitAll(r, 'toast', { text: `${m.nick} отключился` });
      if (r.phase === 'LOBBY') m.dc = setTimeout(() => { if (!m.connected && rooms.has(r.code) && r.players.has(m.id) && r.phase === 'LOBBY') leave(r, m.id); }, 30e3);
      transferHost(r); broadcast(r);
    });
  });
}
module.exports = { attach };

async function awardCoins(userId, survived, won, killed) {
  try {
    // Базовые монеты за игру
    let coins = survived ? 25 : 10;
    
    // Бонус за победу
    if (won) coins += 50;
    
    // Бонус за убийства (если убил за игру)
    if (killed && killed > 0) coins += killed * 15;
    
    // Макс 200 монет за игру
    coins = Math.min(coins, 200);
    
    const result = await db.query(
      'UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins',
      [coins, userId]
    );
    
    return coins;
  } catch (e) {
    console.error('Award coins error:', e);
    return 0;
  }
}

// Экспортируем функцию
module.exports = { awardCoins };
