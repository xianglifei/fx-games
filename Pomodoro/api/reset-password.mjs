// 管理员密码重置脚本（本地运行，不部署）
// 用法：node reset-password.mjs 用户邮箱 新密码
// 输出一条 UPDATE SQL，复制后用 wrangler 在远端 D1 执行即可完成重置。
// 哈希流程与 worker.js / 前端一致：PBKDF2(密码, 应用盐, 210000) → SHA-256(派生值+用户盐)
'use strict';

const KDF_APP_SALT = 'letsfarm.pomodoro.v1';

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('用法：node reset-password.mjs 用户邮箱 新密码');
  process.exit(1);
}

const enc = new TextEncoder();
const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(KDF_APP_SALT), iterations: 210000 },
  key, 256);
const derived = Buffer.from(bits).toString('base64');

const salt = [...crypto.getRandomValues(new Uint8Array(16))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(derived + salt)))]
  .map(b => b.toString(16).padStart(2, '0')).join('');

console.log(`-- 为 ${email} 重置密码，执行以下两条命令：`);
console.log(`wrangler d1 execute pomodoro-db --remote --command "UPDATE users SET pwd_hash='${hash}', salt='${salt}' WHERE email='${email.toLowerCase()}'"`);
console.log(`wrangler d1 execute pomodoro-db --remote --command "DELETE FROM login_fails WHERE email='${email.toLowerCase()}'"`);
