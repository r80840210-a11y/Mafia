'use strict';
const fs = require('fs'), path = require('path'), { Pool } = require('pg');
const url = process.env.DATABASE_URL;
if (!url) { console.error('❌ Не задана переменная DATABASE_URL (строка подключения PostgreSQL). См. README.'); process.exit(1); }
const local = /localhost|127\.0\.0\.1/.test(url);
const pool = new Pool({ connectionString: url, ssl: local || process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }, max: 10 });
pool.on('error', e => console.error('PG error', e.message));
const q = (text, params) => pool.query(text, params);
async function init() { await q(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')); }

// Сохранение итогов игры: rows=[{userId,role,won,survivor,kills,checks,saves,votes}]
async function saveResults(rows) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const r of rows) {
      await c.query(`UPDATE users SET games_played=games_played+1, games_won=games_won+$2, games_lost=games_lost+$3,
        rating=GREATEST(0, rating+$4), kills=kills+$5, checks=checks+$6, saves=saves+$7, last_survivor=last_survivor+$8 WHERE id=$1`,
        [r.userId, r.won ? 1 : 0, r.won ? 0 : 1, r.won ? 25 : -15, r.kills, r.checks, r.saves, r.survivor ? 1 : 0]);
      await c.query('INSERT INTO game_results(user_id,role,won,kills,checks,saves,votes_cast) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [r.userId, r.role, r.won, r.kills, r.checks, r.saves, r.votes]);
      await c.query(`UPDATE users SET favorite_role=(SELECT role FROM game_results WHERE user_id=$1 GROUP BY role ORDER BY count(*) DESC, max(created_at) DESC LIMIT 1) WHERE id=$1`, [r.userId]);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); console.error('saveResults', e.message); } finally { c.release(); }
}
module.exports = { pool, q, init, saveResults };
