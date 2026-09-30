// 番茄钟同步 API — Cloudflare Worker + D1
// 端点：POST /register、POST /login、GET|POST /sync
// 密码协议：浏览器端 PBKDF2-SHA256(password, 固定应用盐, 210000) 派生后上传 derived；
//           服务器只存 SHA-256(derived + 每用户随机盐)，数据库泄露也无法登录。
'use strict';

const KDF_APP_SALT = 'letsfarm.pomodoro.v1';   // 与前端、reset-password.mjs 保持一致
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;    // 30 天
const LOCK_WINDOW_MS = 15 * 60 * 1000;         // 失败计数窗口
const LOCK_MAX_FAILS = 5;
const SYNC_BATCH_LIMIT = 2000;                 // 单次上传条数上限

const AI_MODEL = '@cf/zai-org/glm-5.3-flash';  // 日报模型，固定写死；被下线时只改这一处
const TZ_DEFAULT = 'Asia/Shanghai';
const DAY_HOUR_START = 9, DAY_HOUR_END = 21;   // 白天档：本地 9–21 点整点跑
const NIGHT_HOURS = new Set([0, 3, 6]);        // 夜间档：0/3/6 点（0 点兼做昨日收尾）
const REGEN_LIMIT_MS = 60 * 1000;              // 手动重新生成限流

const ALLOWED_ORIGINS = new Set([
  'https://pomodoro-6ih.pages.dev',
  'http://localhost:8735',
  'http://127.0.0.1:8735',
]);

// ---------- 工具 ----------
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const sha256Hex = async str => hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));

function json(res, status, obj){
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  const origin = res.reqHeaders.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(obj), { status, headers });
}

// ---------- 会话 token：payload.b64url + HMAC 签名 ----------
async function makeToken(env, uid){
  const payload = b64url(enc.encode(JSON.stringify({ u: uid, e: Date.now() + TOKEN_TTL_MS })));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  return payload + '.' + sig;
}
async function verifyToken(env, token){
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expect = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  // 常数时间比较（长度不同直接失败）
  if (sig.length !== expect.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return null;
  try{
    const data = JSON.parse(fromB64url(payload));
    if (typeof data.u !== 'number' || typeof data.e !== 'number' || data.e < Date.now()) return null;
    return data.u;
  }catch(e){ return null; }
}

// ---------- 防暴力破解 ----------
async function checkLocked(db, email){
  const row = await db.prepare('SELECT count AS c, last_fail AS t FROM login_fails WHERE email = ?')
    .bind(email).first();
  return !!(row && row.c >= LOCK_MAX_FAILS && Date.now() - row.t < LOCK_WINDOW_MS);
}
async function recordFail(db, email){
  await db.prepare(`
    INSERT INTO login_fails (email, count, last_fail) VALUES (?, 1, ?)
    ON CONFLICT(email) DO UPDATE SET count = count + 1, last_fail = ?
  `).bind(email, Date.now(), Date.now()).run();
}
const clearFails = (db, email) =>
  db.prepare('DELETE FROM login_fails WHERE email = ?').bind(email);

// ---------- 校验 ----------
function validDerived(d){
  return typeof d === 'string' && /^[A-Za-z0-9+/]{43}={0,2}$/.test(d);   // 32 字节 base64
}
function validRecord(r){
  return r && typeof r === 'object'
    && (r.type === 'work' || r.type === 'rest')
    && Number.isInteger(r.start) && Number.isInteger(r.end)
    && r.start > 0 && r.end > r.start && r.end - r.start <= 24 * 3600 * 1000;
}
// 备注：追加条目 {id, rid, text, at}，rid 必须是合法记录的三元组
function validNote(n){
  return n && typeof n === 'object'
    && typeof n.id === 'string' && n.id.length >= 8 && n.id.length <= 64
    && typeof n.rid === 'string' && /^[a-z]+:\d+:\d+$/.test(n.rid)
    && validRecord({ type: n.rid.split(':')[0], start: +n.rid.split(':')[1], end: +n.rid.split(':')[2] })
    && typeof n.text === 'string' && n.text.trim().length >= 1 && n.text.length <= 200
    && Number.isInteger(n.at);
}

// ---------- 时区与本地日期 ----------
function validTz(tz){
  if (typeof tz !== 'string' || tz.length < 3 || tz.length > 64 || !/^[A-Za-z0-9_+\-\/]+$/.test(tz)) return null;
  try{ new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; }catch(e){ return null; }
}
// 用户时区下的日期键 YYYY-MM-DD
function dayKeyIn(tz, ts){
  try{
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ts));
  }catch(e){ return dayKeyIn(TZ_DEFAULT, ts); }
}
// 用户时区下的钟点（0–23）
function localHourIn(tz, ts){
  try{
    return +new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })
      .format(new Date(ts));
  }catch(e){ return new Date(ts).getUTCHours(); }
}
// 用户时区下的 HH:MM
function fmtHM(tz, ts){
  try{
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(ts));
  }catch(e){ return new Date(ts).toISOString().slice(11, 16); }
}
// 该时区某本地日的偏移量（毫秒）。DST 边缘可能差一小时，对按天归档无影响
function tzOffsetMs(tz, ts){
  try{
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ts)).reduce((m, p) => { m[p.type] = p.value; return m; }, {});
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - ts;
  }catch(e){ return 8 * 3600 * 1000; }
}
// 本地日 date_key 的 00:00 对应的 UTC 毫秒时间戳
function dayStartUtc(tz, dateKey){
  return Date.parse(dateKey + 'T00:00:00Z') - tzOffsetMs(tz, Date.parse(dateKey + 'T12:00:00Z'));
}
const shouldRunAtHour = h => (h >= DAY_HOUR_START && h <= DAY_HOUR_END) || NIGHT_HOURS.has(h);

// ---------- 端点 ----------
async function handleRegister(req, env){
  const body = await req.json().catch(() => null);
  if (!body) return json({ reqHeaders: req.headers }, 400, { error: '请求格式不对' });
  const R = { reqHeaders: req.headers };
  const email = String(body.email || '').trim().toLowerCase();
  const nickname = String(body.nickname || '').trim();
  const derived = body.derived;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(R, 400, { error: '邮箱格式不对' });
  if (nickname.length < 1 || nickname.length > 16) return json(R, 400, { error: '昵称需要 1–16 个字' });
  if (!validDerived(derived)) return json(R, 400, { error: '密码派生数据无效' });

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json(R, 409, { error: '这个邮箱已经注册过了' });

  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const pwdHash = await sha256Hex(derived + salt);
  let id;
  try{
    const r = await env.DB.prepare(
      'INSERT INTO users (email, nickname, pwd_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, nickname, pwdHash, salt, Date.now()).run();
    id = r.meta.last_row_id;
  }catch(e){
    return json(R, 409, { error: '这个邮箱已经注册过了' });   // 并发唯一约束兜底
  }
  return json(R, 200, { token: await makeToken(env, id), email, nickname });
}

async function handleLogin(req, env){
  const body = await req.json().catch(() => null);
  if (!body) return json({ reqHeaders: req.headers }, 400, { error: '请求格式不对' });
  const R = { reqHeaders: req.headers };
  const email = String(body.email || '').trim().toLowerCase();
  const derived = body.derived;

  if (await checkLocked(env.DB, email))
    return json(R, 429, { error: '尝试太频繁，请 15 分钟后再试' });

  const user = await env.DB.prepare('SELECT id, nickname, pwd_hash, salt FROM users WHERE email = ?')
    .bind(email).first();
  const ok = user && validDerived(derived)
    && (await sha256Hex(derived + user.salt)) === user.pwd_hash;

  if (!ok){
    if (user) await recordFail(env.DB, email);
    return json(R, 401, { error: '邮箱或密码不对' });
  }
  await clearFails(env.DB, email);
  return json(R, 200, { token: await makeToken(env, user.id), email, nickname: user.nickname });
}

async function handleSync(req, env){
  const R = { reqHeaders: req.headers };
  const auth = req.headers.get('Authorization') || '';
  const uid = await verifyToken(env, auth.replace(/^Bearer\s+/i, ''));
  if (!uid) return json(R, 401, { error: '登录已过期，请重新登录' });

  // 顺带落时区（GET/POST 均带 ?tz=，变了才写），日报按用户本地日历日归档
  const tz = validTz(new URL(req.url).searchParams.get('tz'));
  if (tz){
    const cur = await env.DB.prepare('SELECT timezone FROM users WHERE id = ?').bind(uid).first();
    if (!cur || cur.timezone !== tz)
      await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(tz, uid).run();
  }

  if (req.method === 'POST'){
    const body = await req.json().catch(() => null);
    const records = body && Array.isArray(body.records) ? body.records : [];
    const notes = body && Array.isArray(body.notes) ? body.notes : [];
    if (records.length > SYNC_BATCH_LIMIT || notes.length > SYNC_BATCH_LIMIT)
      return json(R, 400, { error: '单次最多上传 ' + SYNC_BATCH_LIMIT + ' 条' });
    const stmts = [];
    for (const r of records){
      if (!validRecord(r)) continue;   // 脏数据静默跳过
      stmts.push(env.DB.prepare(
        'INSERT OR IGNORE INTO records (user_id, type, start, end) VALUES (?, ?, ?, ?)'
      ).bind(uid, r.type, r.start, r.end));
    }
    for (const n of notes){
      if (!validNote(n)) continue;
      stmts.push(env.DB.prepare(
        'INSERT OR IGNORE INTO notes (user_id, id, rid, text, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(uid, n.id, n.rid, n.text, n.at));
    }
    if (stmts.length) await env.DB.batch(stmts);
  }

  const recs = await env.DB.prepare(
    'SELECT type, start, end FROM records WHERE user_id = ? ORDER BY start'
  ).bind(uid).all();
  const nts = await env.DB.prepare(
    'SELECT id, rid, text, created_at AS at FROM notes WHERE user_id = ? ORDER BY created_at'
  ).bind(uid).all();
  return json(R, 200, { records: recs.results || [], notes: nts.results || [] });
}

// ---------- 每日工作日报（Workers AI + Cron） ----------
// 只处理「今天」；0/3/6 点额外对「昨天」做增量检查，把 21 点后写的备注收进昨日定稿。
// 历史日期（上线前的日子）永不回填。
async function runAI(env, messages, maxTokens){
  try{
    return await env.AI.run(AI_MODEL, { messages, max_tokens: maxTokens });
  }catch(e){
    console.error('AI run error:', e && (e.stack || e.message || e));
    return null;
  }
}
const pickContent = out =>
  String((out && (out.choices?.[0]?.message?.content ?? out.response)) || '').trim();

async function generateReport(env, tz, dateKey, dayNotes, st){
  const wk = ['日', '一', '二', '三', '四', '五', '六'][new Date(dateKey + 'T00:00:00Z').getUTCDay()];
  const lines = ['日期：' + dateKey + '（周' + wk + '）'];
  if (st.workN || st.restN){
    lines.push('番茄钟：工作 ' + st.workN + ' 轮 / ' + Math.round(st.workMs / 60000) + ' 分钟，'
      + '休息 ' + st.restN + ' 轮 / ' + Math.round(st.restMs / 60000) + ' 分钟'
      + (st.rounds.length <= 15 ? '；工作时段：' + (st.rounds.join('、') || '无') : ''));
  }else{
    lines.push('番茄钟：当天没有计时记录');
  }
  lines.push('备注（' + dayNotes.length + ' 条，按时间排列，时间为用户本地时间）：');
  for (const n of dayNotes) lines.push('- ' + fmtHM(tz, n.created_at) + ' ' + n.text);

  const messages = [
    { role: 'system', content:
      '你是番茄钟应用里的日报助手，帮用户把一天的工作记录整理成一份简短的工作日报。' +
      '要求：中文；第一人称；3~5 行；按时间或主题归纳当天做了什么；' +
      '只依据给出的数据，绝不编造备注之外的内容；不要标题、不要列表符号、没有客套和空话，直接输出日报正文。' },
    { role: 'user', content: lines.join('\n') },
  ];

  // glm-5.3-flash 先思考后作答，思考可能吃光 max_tokens（finish_reason=length、content 为空）：
  // 上限给足，空内容时再加量自动重试一次
  let out = await runAI(env, messages, 2000);
  let clean = pickContent(out);
  if (!clean && out){
    out = await runAI(env, messages, 4000);
    clean = pickContent(out);
  }
  if (!clean){
    console.error('AI empty response:', JSON.stringify(out).slice(0, 300));
    return null;
  }
  return clean;
}

// 处理某用户某一天：无新增备注直接跳过（零 AI 消耗）；force 用于手动立即重新生成
async function processUserDay(env, uid, tz, dateKey, force){
  const start = dayStartUtc(tz, dateKey), end = start + 86400000;
  const notes = await env.DB.prepare(
    'SELECT text, created_at FROM notes WHERE user_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at'
  ).bind(uid, start, end).all();
  const dayNotes = notes.results || [];
  if (!dayNotes.length) return 'skip';   // 没备注没得总结
  const maxNoteTs = dayNotes[dayNotes.length - 1].created_at;

  const row = await env.DB.prepare(
    'SELECT based_on_note_ts FROM daily_reports WHERE user_id = ? AND date_key = ?'
  ).bind(uid, dateKey).first();
  if (!force && row && row.based_on_note_ts >= maxNoteTs) return 'skip';   // 无新增

  // 番茄统计（裁剪到当天本地日）
  const recs = await env.DB.prepare(
    'SELECT type, start, end FROM records WHERE user_id = ? AND start < ? AND end > ?'
  ).bind(uid, end, start).all();
  const st = { workN: 0, workMs: 0, restN: 0, restMs: 0, rounds: [] };
  for (const r of (recs.results || [])){
    const s = Math.max(r.start, start), e = Math.min(r.end, end);
    if (e <= s) continue;
    if (r.type === 'work'){ st.workN++; st.workMs += e - s; st.rounds.push(fmtHM(tz, s) + '–' + fmtHM(tz, e)); }
    else{ st.restN++; st.restMs += e - s; }
  }

  const content = await generateReport(env, tz, dateKey, dayNotes, st);
  if (content == null) return 'error';   // AI 失败保留旧日报，下次触发自然重试

  await env.DB.prepare(`
    INSERT INTO daily_reports (user_id, date_key, content, note_count, generated_at, based_on_note_ts)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date_key) DO UPDATE SET
      content = excluded.content, note_count = excluded.note_count,
      generated_at = excluded.generated_at, based_on_note_ts = excluded.based_on_note_ts
  `).bind(uid, dateKey, content, dayNotes.length, Date.now(), maxNoteTs).run();
  return 'generated';
}

async function handleReport(req, env){
  const R = { reqHeaders: req.headers };
  const uid = await verifyToken(env, (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!uid) return json(R, 401, { error: '登录已过期，请重新登录' });
  const date = new URL(req.url).searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(R, 400, { error: '日期格式不对' });
  const row = await env.DB.prepare(
    'SELECT content, note_count, generated_at FROM daily_reports WHERE user_id = ? AND date_key = ?'
  ).bind(uid, date).first();
  return json(R, 200, { date, report: row || null });
}

const regenAt = new Map();   // uid → 上次手动生成时间（isolate 内存级轻限流）
async function handleRegenerate(req, env){
  const R = { reqHeaders: req.headers };
  const uid = await verifyToken(env, (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!uid) return json(R, 401, { error: '登录已过期，请重新登录' });
  const last = regenAt.get(uid) || 0;
  if (Date.now() - last < REGEN_LIMIT_MS) return json(R, 429, { error: '刚刚生成过，稍等一分钟再试' });

  const u = await env.DB.prepare('SELECT timezone FROM users WHERE id = ?').bind(uid).first();
  const tz = validTz(u && u.timezone) || TZ_DEFAULT;
  const date = dayKeyIn(tz, Date.now());
  const row = await env.DB.prepare(
    'SELECT generated_at FROM daily_reports WHERE user_id = ? AND date_key = ?'
  ).bind(uid, date).first();
  if (row && Date.now() - row.generated_at < REGEN_LIMIT_MS)
    return json(R, 429, { error: '刚刚生成过，稍等一分钟再试' });
  regenAt.set(uid, Date.now());

  const r = await processUserDay(env, uid, tz, date, true);
  if (r === 'skip') return json(R, 400, { error: '今天还没有备注，先记一条再生成吧' });
  if (r !== 'generated') return json(R, 502, { error: 'AI 暂时不可用，稍后再试' });
  const fresh = await env.DB.prepare(
    'SELECT content, note_count, generated_at FROM daily_reports WHERE user_id = ? AND date_key = ?'
  ).bind(uid, date).first();
  return json(R, 200, { date, report: fresh });
}

// ---------- 入口 ----------
export default {
  async fetch(request, env){
    if (request.method === 'OPTIONS'){
      const origin = request.headers.get('Origin');
      const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
      if (origin && ALLOWED_ORIGINS.has(origin)){
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        headers['Access-Control-Max-Age'] = '86400';
      }
      return new Response(null, { status: 204, headers });
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    try{
      if (path === '/register' && request.method === 'POST') return await handleRegister(request, env);
      if (path === '/login'    && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/sync'     && (request.method === 'GET' || request.method === 'POST'))
        return await handleSync(request, env);
      if (path === '/report'   && request.method === 'GET') return await handleReport(request, env);
      if (path === '/report/regenerate' && request.method === 'POST') return await handleRegenerate(request, env);
      return json({ reqHeaders: request.headers }, 404, { error: '接口不存在' });
    }catch(e){
      console.error('handler error:', e && e.stack || e);
      return json({ reqHeaders: request.headers }, 500, { error: '服务器开小差了，稍后再试' });
    }
  },

  // Cron 每小时醒一次；按用户本地钟点门控后只处理「今天」（0/3/6 点兼收昨日尾）
  async scheduled(controller, env){
    const now = Date.now();
    const stats = { users: 0, ran: 0, generated: 0, skipped: 0, errors: 0 };
    const users = await env.DB.prepare('SELECT id, timezone FROM users').all();
    for (const u of (users.results || [])){
      stats.users++;
      const tz = validTz(u.timezone) || TZ_DEFAULT;
      const h = localHourIn(tz, now);
      if (!shouldRunAtHour(h)) continue;
      stats.ran++;
      const todayKey = dayKeyIn(tz, now);
      const dates = [todayKey];
      if (NIGHT_HOURS.has(h)) dates.push(dayKeyIn(tz, dayStartUtc(tz, todayKey) - 1000));   // 昨日收尾
      for (const d of [...new Set(dates)]){
        try{
          const r = await processUserDay(env, u.id, tz, d);
          if (r === 'generated') stats.generated++;
          else if (r === 'error') stats.errors++;
          else stats.skipped++;
        }catch(e){ stats.errors++; }
      }
    }
    console.log('cron hourly ' + JSON.stringify(stats));   // wrangler tail 可观测
  },
};
