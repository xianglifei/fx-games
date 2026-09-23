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
      return json({ reqHeaders: request.headers }, 404, { error: '接口不存在' });
    }catch(e){
      return json({ reqHeaders: request.headers }, 500, { error: '服务器开小差了，稍后再试' });
    }
  },
};
