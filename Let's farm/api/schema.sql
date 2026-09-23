-- 番茄钟同步 API 数据表
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT UNIQUE NOT NULL,
  nickname   TEXT NOT NULL,
  pwd_hash   TEXT NOT NULL,
  salt       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  user_id INTEGER NOT NULL,
  type    TEXT    NOT NULL,
  start   INTEGER NOT NULL,
  end     INTEGER NOT NULL,
  PRIMARY KEY (user_id, type, start, end)
);
CREATE INDEX IF NOT EXISTS idx_records_user_start ON records(user_id, start);

CREATE TABLE IF NOT EXISTS login_fails (
  email     TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  last_fail INTEGER NOT NULL
);
