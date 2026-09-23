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

CREATE TABLE IF NOT EXISTS notes (
  user_id    INTEGER NOT NULL,
  id         TEXT NOT NULL,      -- 客户端 UUID，追加条目的幂等主键
  rid        TEXT NOT NULL,      -- 关联记录的三元组 "type:start:end"
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_notes_user_rid ON notes(user_id, rid);
