# 番茄钟同步 API（Cloudflare Worker + D1）

前端 `../index.html` 的账号与数据同步后端。线上地址由 `wrangler deploy` 输出（`pomodoro-api.<子域>.workers.dev`），需同步填入前端 `SYNC_API` 常量。

## 端点

| 端点 | 方法 | 说明 |
|---|---|---|
| `/register` | POST | `{email, nickname, derived}` → `{token, email, nickname}`，注册即登录 |
| `/login` | POST | `{email, derived}` → `{token, email, nickname}` |
| `/sync` | GET | Bearer token → `{records: [{type, start, end}, ...]}` |
| `/sync` | POST | Bearer token + `{records: [...]}`，INSERT OR IGNORE 合并后返回全量 |
| `/sync` | GET/POST | 均可带 `?tz=Asia/Shanghai`，落库用户时区（日报按本地日历日归档） |
| `/report?date=YYYY-MM-DD` | GET | Bearer token → `{date, report: null}` 或 `{date, report: {content, note_count, generated_at}}` |
| `/report/regenerate` | POST | Bearer token，强制重新生成用户本地「今天」的日报（60 秒轻限流） |

- `derived` = 浏览器端 `PBKDF2-SHA256(密码, "letsfarm.pomodoro.v1", 210000)` 派生的 32 字节 base64；服务器只存 `SHA-256(derived+用户盐)`，密码明文与 derived 均不落库
- token = HMAC-SHA256 签名的 `{u, e}`，30 天有效，密钥在 Worker secret `SESSION_SECRET`
- 同一邮箱 15 分钟内登录失败 5 次锁定 15 分钟
- CORS 仅放行 `pomodoro-6ih.pages.dev` 与 `localhost:8735`

## 每日工作日报（Workers AI + Cron）

- Cron `0 * * * *` 每小时醒一次，按**用户本地时区**门控：9–21 点整点跑，0/3/6 点低频跑（0 点兼做昨日收尾）
- 只总结「今天」；两次运行间无新增备注直接跳过（零 AI 消耗）；上线前的历史日期永不回填
- 模型写死 `@cf/zai-org/glm-5.3-flash`（`AI_MODEL` 常量）；结果存 D1 `daily_reports`，当天滚动覆盖
- 手动测试定时器：`wrangler dev --test-scheduled` 后 `curl 'http://localhost:8787/__scheduled?cron=0+*+*+*+*'`

## 部署 / 更新

```bash
cd "Let's farm/api"

# 首次
wrangler d1 create pomodoro-db          # 把输出的 database_id 填进 wrangler.toml
wrangler d1 execute pomodoro-db --remote --file schema.sql
openssl rand -hex 32 | wrangler secret put SESSION_SECRET
wrangler deploy

# 日常更新
wrangler deploy
```

## 管理员重置密码（密码找回方案）

用户忘记密码时，管理员本地执行：

```bash
node reset-password.mjs 用户邮箱 新密码     # 输出两条 wrangler 命令
# 复制执行即可，重置后同时清除该账号的失败锁定计数
```
