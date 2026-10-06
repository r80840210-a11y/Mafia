CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(20) UNIQUE NOT NULL,
  nickname VARCHAR(16) NOT NULL,
  password TEXT NOT NULL,
  avatar VARCHAR(10) DEFAULT '👤',
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
  rating INT DEFAULT 1000,
  favorite_role VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sid VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_results (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id VARCHAR(64),
  role VARCHAR(20),
  team VARCHAR(20),
  survived BOOLEAN,
  coins_earned INT,
  rating_change INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_sid ON sessions(sid);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
