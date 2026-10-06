'use strict';
const crypto = require('crypto'), bcrypt = require('bcryptjs'), express = require('express'), rateLimit = require('express-rate-limit');
const db = require('./db');
const AVATARS = ['😎', '🕵️', '🦊', '🐺', '🦉', '🐍', '🎩', '👑', '🧛', '🎭', '🦇', '🐱'];
const SESSION_DAYS = 30, PROD = process.env.NODE_ENV === 'production';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY = bcrypt.hashSync('dummy-password-for-timing', 12);

function parseCookies(h) { const o = {}; (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
async function userByToken(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const r = await db.q(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [sha(token)]);
  return r.rows[0] || null;
}
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.q('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3||\' days\')::interval)', [sha(token), userId, SESSION_DAYS]);
  res.cookie('sid', token, { httpOnly: true, secure: PROD, sameSite: 'lax', maxAge: SESSION_DAYS * 864e5, path: '/' });
}
const publicUser = u => ({ id: String(u.id), username: u.username, nickname: u.nickname, avatar: u.avatar, rating: u.rating, settings: u.settings });
function vUsername(s) { return typeof s === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(s) ? null : 'Логин: 3–20 символов, только латиница, цифры и _'; }
function vNick(s) { return typeof s === 'string' && /^[\p{L}\p{N}_\- ]{2,16}$/u.test(s.trim()) ? null : 'Никнейм: 2–16 символов, буквы, цифры, пробел, _ и -'; }
function vPass(s) {
  if (typeof s !== 'string' || s.length < 8) return 'Пароль: минимум 8 символов';
  if (s.length > 64) return 'Пароль: максимум 64 символа';
  if (!/[A-Za-zА-Яа-яЁё]/.test(s) || !/\d/.test(s)) return 'Пароль должен содержать букву и цифру';
  return null;
}
const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); });
const strict = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Слишком много попыток. Подождите 15 минут.' } });
const general = rateLimit({ windowMs: 60 * 1000, limit: 120, message: { error: 'Слишком много запросов' } });

const router = express.Router();
router.use(express.json({ limit: '10kb' }));
router.use(general);
router.use(async (req, res, next) => { try { req.user = await userByToken(parseCookies(req.headers.cookie).sid); next(); } catch (e) { next(e); } });
const need = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Требуется вход' });

router.post('/register', strict, wrap(async (req, res) => {
  const { username, nickname, password, password2 } = req.body || {};
  if (!username || !nickname || !password || !password2) return res.status(400).json({ error: 'Заполните все поля' });
  const err = vUsername(username) || vNick(nickname) || vPass(password) || (password !== password2 ? 'Пароли не совпадают' : null);
  if (err) return res.status(400).json({ error: err });
  const hash = await bcrypt.hash(password, 12);
  try {
    const r = await db.q('INSERT INTO users(username,nickname,password_hash,last_login) VALUES($1,$2,$3,now()) RETURNING *', [username.toLowerCase(), nickname.trim().replace(/\s+/g, ' '), hash]);
    await startSession(res, r.rows[0].id);
    res.json({ user: publicUser(r.rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: /nick/.test(e.constraint || '') ? 'Этот никнейм уже занят' : 'Этот логин уже занят' });
    throw e;
  }
}));
router.post('/login', strict, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 200) return res.status(400).json({ error: 'Неверный логин или пароль.' });
  const r = await db.q('SELECT * FROM users WHERE username=$1', [username.toLowerCase()]);
  const u = r.rows[0], ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY);
  if (!u || !ok) return res.status(401).json({ error: 'Неверный логин или пароль.' });
  await db.q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  await startSession(res, u.id);
  res.json({ user: publicUser(u) });
}));
router.post('/logout', wrap(async (req, res) => {
  const t = parseCookies(req.headers.cookie).sid; if (t) await db.q('DELETE FROM sessions WHERE token_hash=$1', [sha(t)]);
  res.clearCookie('sid', { path: '/' }); res.json({ ok: true });
}));
router.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
router.post('/forgot', strict, (req, res) => res.status(501).json({ error: 'Восстановление пароля будет доступно после настройки email-сервиса' }));

router.get('/profile', need, wrap(async (req, res) => {
  const u = req.user, fav = u.favorite_role;
  const ach = [];
  if (u.games_won >= 1) ach.push('🏆 Первая победа');
  if (u.checks >= 10) ach.push('🔎 Лучший детектив');
  if (u.kills >= 10) ach.push('🔪 Опасный мафиози');
  if (u.saves >= 10) ach.push('❤️ Спаситель');
  if (u.last_survivor >= 1) ach.push('☠️ Последний выживший');
  res.json({ profile: { ...publicUser(u), games: u.games_played, won: u.games_won, lost: u.games_lost, favorite: fav, kills: u.kills, checks: u.checks, saves: u.saves, achievements: ach } });
}));
router.post('/profile', need, wrap(async (req, res) => {
  const { nickname, avatar, settings } = req.body || {};
  const sets = [], vals = [req.user.id];
  const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
  if (nickname !== undefined) { const e = vNick(nickname); if (e) return res.status(400).json({ error: e }); add('nickname', nickname.trim().replace(/\s+/g, ' ')); }
  if (avatar !== undefined) { if (!AVATARS.includes(avatar)) return res.status(400).json({ error: 'Неверный аватар' }); add('avatar', avatar); }
  if (settings !== undefined) {
    const s = { sound: !!settings.sound, music: !!settings.music, lang: ['ru', 'uk'].includes(settings.lang) ? settings.lang : 'ru' };
    add('settings', JSON.stringify(s));
  }
  if (!sets.length) return res.status(400).json({ error: 'Нечего сохранять' });
  try {
    const r = await db.q(`UPDATE users SET ${sets.join(',')} WHERE id=$1 RETURNING *`, vals);
    res.json({ user: publicUser(r.rows[0]) });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Этот никнейм уже занят' }); throw e; }
}));
router.post('/password', need, strict, wrap(async (req, res) => {
  const { oldPassword, newPassword, newPassword2 } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
  if (!(await bcrypt.compare(String(oldPassword), req.user.password_hash))) return res.status(401).json({ error: 'Старый пароль неверен' });
  const e = vPass(newPassword) || (newPassword !== newPassword2 ? 'Пароли не совпадают' : null);
  if (e) return res.status(400).json({ error: e });
  await db.q('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await bcrypt.hash(newPassword, 12)]);
  const cur = parseCookies(req.headers.cookie).sid;
  await db.q('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [req.user.id, sha(cur)]);
  res.json({ ok: true });
}));
router.get('/leaderboard', need, wrap(async (req, res) => {
  const r = await db.q('SELECT nickname,avatar,rating,games_won,games_played FROM users WHERE games_played>0 ORDER BY rating DESC, games_won DESC LIMIT 20');
  res.json({ rows: r.rows });
}));
router.use((req, res) => res.status(404).json({ error: 'Не найдено' }));
module.exports = { router, userByToken, parseCookies, AVATARS };

// 💰 Покупка предметов в магазине
app.post('/api/buy-item', authenticateUser, async (req, res) => {
  const { type, id, price } = req.body;
  if (!type || !id || !price) return res.json({ error: 'Неправильные параметры' });
  
  try {
    const user = await db.query('SELECT coins, skins, emotes, frames FROM users WHERE id = $1', [req.user.id]);
    if (!user.rows.length) return res.json({ error: 'Пользователь не найден' });
    
    const userData = user.rows[0];
    const coins = userData.coins || 0;
    let skins = userData.skins || [];
    let emotes = userData.emotes || [];
    let frames = userData.frames || [];
    
    // Парсим JSON если строка
    if (typeof skins === 'string') skins = JSON.parse(skins || '[]');
    if (typeof emotes === 'string') emotes = JSON.parse(emotes || '[]');
    if (typeof frames === 'string') frames = JSON.parse(frames || '[]');
    
    // Проверяем баланс
    if (coins < price) return res.json({ error: 'Недостаточно монет' });
    
    // Проверяем что предмет не уже куплен
    let itemList = [];
    if (type === 'skin') itemList = skins;
    else if (type === 'emote') itemList = emotes;
    else if (type === 'frame') itemList = frames;
    
    if (itemList.includes(id)) return res.json({ error: 'Предмет уже куплен' });
    
    // Добавляем предмет и вычитаем монеты
    itemList.push(id);
    const newCoins = coins - price;
    
    const result = await db.query(
      'UPDATE users SET coins = $1, skins = $2, emotes = $3, frames = $4 WHERE id = $5 RETURNING *',
      [newCoins, JSON.stringify(skins), JSON.stringify(emotes), JSON.stringify(frames), req.user.id]
    );
    
    const updatedUser = result.rows[0];
    res.json({
      coins: updatedUser.coins,
      skins: JSON.parse(updatedUser.skins || '[]'),
      emotes: JSON.parse(updatedUser.emotes || '[]'),
      frames: JSON.parse(updatedUser.frames || '[]')
    });
  } catch (e) {
    console.error('Buy item error:', e);
    res.json({ error: 'Ошибка при покупке' });
  }
});

// 📊 Лидерборд с монетами
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT nickname, rating, coins, games_won FROM users ORDER BY rating DESC LIMIT 20'
    );
    res.json({ users: result.rows });
  } catch (e) {
    console.error('Leaderboard error:', e);
    res.json({ error: 'Ошибка загрузки лидерборда' });
  }
});
