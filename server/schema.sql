CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(20) NOT NULL UNIQUE,        -- логин (в нижнем регистре)
  nickname      VARCHAR(16) NOT NULL,
  password_hash TEXT NOT NULL,                      -- bcrypt, пароль НЕ хранится
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ,
  games_played  INT NOT NULL DEFAULT 0,
  games_won     INT NOT NULL DEFAULT 0,
  games_lost    INT NOT NULL DEFAULT 0,
  rating        INT NOT NULL DEFAULT 1000,
  favorite_role VARCHAR(20),
  avatar        VARCHAR(8) NOT NULL DEFAULT '😎',
  kills         INT NOT NULL DEFAULT 0,
  checks        INT NOT NULL DEFAULT 0,
  saves         INT NOT NULL DEFAULT 0,
  last_survivor INT NOT NULL DEFAULT 0,
  settings      JSONB NOT NULL DEFAULT '{"sound":true,"music":false,"lang":"ru"}'
);
CREATE UNIQUE INDEX IF NOT EXISTS users_nick_lower ON users (lower(nickname));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS game_results (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL,
  won        BOOLEAN NOT NULL,
  kills      INT NOT NULL DEFAULT 0,
  checks     INT NOT NULL DEFAULT 0,
  saves      INT NOT NULL DEFAULT 0,
  votes_cast INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS results_user ON game_results (user_id);
