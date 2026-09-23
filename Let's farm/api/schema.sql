-- 番茄钟同步 API 数据表
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT UNIQUE NOT NULL,
  nickname   TEXT NOT NULL,
  pwd_hash   TEXT NOT NULL,
  salt       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  timezone   TEXT    NOT NULL DEFAULT 'Asia/Shanghai'   -- 日报按用户本地日历日归档
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

-- 每日工作日报（AI 生成，每个用户每天最多一行，当天滚动覆盖更新）
CREATE TABLE IF NOT EXISTS daily_reports (
  user_id          INTEGER NOT NULL,
  date_key         TEXT    NOT NULL,   -- 用户本地日期 YYYY-MM-DD
  content          TEXT    NOT NULL,
  note_count       INTEGER NOT NULL,   -- 生成时基于的备注条数（展示用）
  generated_at     INTEGER NOT NULL,
  based_on_note_ts INTEGER NOT NULL,   -- 生成时该日最新一条备注时间，增量触发判断用
  PRIMARY KEY (user_id, date_key)
);

-- 已有库升级时执行（全新安装走上面的 CREATE 即可，不必执行这条）：
-- ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai';
