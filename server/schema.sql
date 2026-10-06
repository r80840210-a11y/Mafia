CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(20) UNIQUE NOT NULL,
  nickname VARCHAR(16) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar VARCHAR(10) DEFAULT '😎',
  coins INT DEFAULT 100,
  skins TEXT DEFAULT '[]',
  emotes TEXT DEFAULT '[]',
  frames TEXT DEFAULT '[]',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  games_lost INT DEFAULT 0,
  kills INT DEFAULT 0,
  checks INT DEFAULT 0,
  saves INT DEFAULT 0,
  last_survivor INT DEFAULT 0,
  rating INT DEFAULT 1000,
  favorite_role VARCHAR(20),
  settings TEXT DEFAULT '{"sound":true,"music":true,"lang":"ru"}',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_results (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30),
  won BOOLEAN NOT NULL DEFAULT FALSE,
  kills INT DEFAULT 0,
  checks INT DEFAULT 0,
  saves INT DEFAULT 0,
  votes_cast INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
