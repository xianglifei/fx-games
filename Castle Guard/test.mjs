/*
 * 王城守卫（Castle Guard）引擎自动化测试
 * 用法: node test.mjs
 * 从 index.html 中提取引擎标记段(ENGINE BEGIN / END)之间的纯逻辑代码执行，
 * 覆盖：地图与建塔校验、伤害数值(护甲/破甲/灼烧/溅射/减速)、索敌弹道、
 *       波次控制、经济守恒、出售升级、确定性/序列化、全 AI 整局模拟与性能。
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\*__ENGINE_BEGIN__\*\/([\s\S]*?)\/\*__ENGINE_END__\*\//);
if(!m) throw new Error('未找到引擎标记段');
const api = new Function(
  m[1] +
  '\n;return {TILE,COLS,ROWS,W,H,MAP,PATH_LEN,PATH_CELLS,BLOCKED,pointOnPath,ENEMIES,TOWERS,WAVES,' +
  'START_GOLD,LIVES,BUILD_SECS,SELL_RATIO,createGame,makeEndlessWave,tick,canBuild,build,upgrade,sell,' +
  'callNext,serialize,deserialize,applyDamage,spawnEnemy,rand};'
)();
const { TILE,COLS,ROWS,MAP,PATH_LEN,PATH_CELLS,BLOCKED,pointOnPath,ENEMIES,TOWERS,WAVES,
  START_GOLD,LIVES,BUILD_SECS,SELL_RATIO,createGame,makeEndlessWave,tick,canBuild,build,upgrade,sell,
  callNext,serialize,deserialize,applyDamage,spawnEnemy } = api;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg){
  if(cond){ pass++; }
  else { fail++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function section(t){ console.log('\n■ ' + t); }

/* ───────── 测试工具 ───────── */
// 生成一只敌人并摆到路径 dist 处（白盒：清掉横向偏移，保证几何断言精确）
function place(g, type, dist){
  spawnEnemy(g, type);
  const e = g.enemies[g.enemies.length - 1];
  e.nx = 0; e.ny = 0;
  e.dist = dist;
  const p = pointOnPath(dist);
  e.x = p.x; e.y = p.y; e.ang = p.ang;
  return e;
}
// 白盒造塔（绕过金币）
function putTower(g, type, c, r, lv=0){
  const tw = { id: g.nextId++, type, lv, c, r, cd: 0, ang: 0, invested: 0 };
  g.towers.push(tw);
  return tw;
}
function hit(g, e, raw, pierce=0, isTrue=false){
  const ev = [];
  const d = applyDamage(g, e, raw, pierce, isTrue, ev);
  return { d, ev };
}
function near(a, b, eps, msg){ ok(Math.abs(a - b) <= eps, `${msg}(实测 ${a} vs 期望 ${b}±${eps})`); }
// 单测里让战斗逻辑跑起来（备战阶段 tick 只倒计时不推进战斗）
function combat(g){ g.phase = 'combat'; return g; }

/* ───────── 模拟框架（供确定性/整局模拟节使用） ───────── */
const REF_PLAN = [
  { w: 1,  b: ['arrow', 2, 3] },
  { w: 1,  b: ['oil', 4, 4] },
  { w: 2,  b: ['ballista', 10, 6] },
  { w: 2,  b: ['arrow', 8, 7] },
  { w: 3,  b: ['treb', 6, 6] },
  { w: 3,  u: [2, 3] },
  { w: 4,  b: ['arrow', 4, 6] },
  { w: 4,  u: [10, 6] },
  { w: 5,  b: ['oil', 12, 6] },
  { w: 5,  u: [6, 6] },
  { w: 6,  b: ['ballista', 2, 4] },
  { w: 6,  u: [2, 3] },
  { w: 7,  b: ['arrow', 12, 3] },
  { w: 7,  u: [4, 4] },
  { w: 8,  b: ['oil', 8, 9] },
  { w: 8,  u: [10, 6] },
  { w: 9,  b: ['ballista', 12, 7] },
  { w: 9,  u: [6, 6] },
  { w: 10, b: ['treb', 9, 7] },
  { w: 10, u: [8, 7] },
  { w: 11, b: ['arrow', 4, 2] },
  { w: 11, u: [4, 4] },
  { w: 12, b: ['oil', 6, 4] },
  { w: 12, u: [4, 6] },
  { w: 13, u: [12, 6] },
  { w: 13, u: [12, 3] },
  { w: 14, u: [12, 7] },
  { w: 15, u: [9, 7] },
  { w: 16, u: [8, 9] },
  { w: 17, u: [6, 4] },
];
function aiBuild(g, plan){
  let again = true;
  while(again){
    again = false;
    for(const p of plan){
      if(g.wave < p.w) continue;
      if(p.b){
        const [type, c, r] = p.b;
        if(!g.towers.some(t => t.c === c && t.r === r) && build(g, c, r, type).ok) again = true;
      }else{
        const tw = g.towers.find(t => t.c === p.u[0] && t.r === p.u[1]);
        if(tw && tw.lv < 2 && upgrade(g, tw.id).ok) again = true;
      }
    }
  }
}
function guard(g, tag){
  if(!(g.gold >= 0 && isFinite(g.gold))) throw new Error(`${tag} 金币异常 ${g.gold}`);
  if(!(g.lives >= 0 && g.lives <= LIVES)) throw new Error(`${tag} 耐久异常 ${g.lives}`);
  if(g.enemies.some(e => !isFinite(e.hp) || !isFinite(e.dist))) throw new Error(`${tag} 敌人状态异常`);
  if(g.enemies.length > 400) throw new Error(`${tag} 敌人数量失控`);
}
function runCampaign(seed, plan, opts){
  const { noBuild = false, endless = false, maxW = Infinity, tag = '模拟' } = opts || {};
  const g = createGame({ seed, endless });
  let it = 0;
  while(g.phase !== 'won' && g.phase !== 'lost'){
    if(++it > 400000) throw new Error(tag + ' 迭代超限');
    if(g.phase === 'build'){
      if(endless && g.wave > maxW) break;
      if(!noBuild) aiBuild(g, plan);
      callNext(g);
    }else tick(g, 1/30);
    guard(g, tag);
  }
  return g;
}
function runUntilBuildWave(seed, plan, waveStop){
  const g = createGame({ seed });
  let it = 0;
  while(!(g.phase === 'build' && g.wave === waveStop) && ++it < 400000){
    if(g.phase === 'build'){ aiBuild(g, plan); callNext(g); }
    else tick(g, 1/30);
  }
  return g;
}

/* ───────────────── 1. 地图与路径 ───────────────── */
section('地图与路径');
ok(COLS === 16 && ROWS === 11, '棋盘 16×11');
ok(PATH_LEN === 1248, `路径全长 1248px=26 格(实测 ${PATH_LEN})`);
ok(PATH_CELLS.size === 27, `路径占 27 格(实测 ${PATH_CELLS.size})`);
ok(PATH_CELLS.has('0,2') && PATH_CELLS.has('7,8') && PATH_CELLS.has('13,5'), '路径关键格在集内');
ok(!PATH_CELLS.has('2,3') && !PATH_CELLS.has('6,6'), '推荐塔位不在路上');
let buildable = 0;
for(let c = 0; c < COLS; c++) for(let r = 0; r < ROWS; r++) if(!BLOCKED.has(c + ',' + r)) buildable++;
ok(buildable >= 120, `可建格充裕(${buildable} ≥ 120)`);
{
  const p0 = pointOnPath(0), p1 = pointOnPath(PATH_LEN - 0.001);
  near(p0.x, -24, 0.01, '路径起点在图外左缘 x');
  near(p0.y, 120, 0.01, '路径起点 y');
  near(p1.x, 696, 0.5, '路径终点为城门 x');
  near(p1.y, 264, 0.5, '路径终点为城门 y');
}
{ // 连续性：相邻采样点距离有界
  let maxGap = 0;
  for(let d = 0; d < PATH_LEN; d += 7){
    const a = pointOnPath(d), b = pointOnPath(d + 7);
    maxGap = Math.max(maxGap, Math.hypot(a.x - b.x, a.y - b.y));
  }
  ok(maxGap < 8.5, `路径参数化连续(最大采样缺口 ${maxGap.toFixed(2)}px)`);
}

/* ───────────────── 2. 建塔校验 ───────────────── */
section('建塔校验');
{
  const g = createGame({ seed: 1 });
  ok(canBuild(g, -1, 0).why === 'oob', '界外拒绝');
  ok(canBuild(g, 16, 3).why === 'oob', '界外拒绝(右)');
  ok(!canBuild(g, 0, 2).ok, '路面不可建');
  ok(!canBuild(g, 14, 4).ok, '王城格不可建');
  ok(!canBuild(g, 0, 0).ok, '树格不可建');
  ok(!canBuild(g, 0, 5).ok, '岩石格不可建');
  ok(canBuild(g, 2, 3).ok, '草地可建');
  ok(build(g, 2, 3, 'arrow').ok, '建箭塔成功');
  ok(!canBuild(g, 2, 3).ok && canBuild(g, 2, 3).why === 'occupied', '重复占格拒绝');
  ok(g.gold === START_GOLD - 70, `建塔扣款(实测 ${g.gold})`);
  g.gold = 10;
  ok(build(g, 4, 4, 'treb').why === 'gold', '金币不足拒绝');
  g.gold = 500;
  ok(build(g, 4, 4, 'oil').ok, '补金后可建');
}

/* ───────────────── 3. 伤害数值 ───────────────── */
section('伤害数值：护甲/破甲/灼烧/下限');
{
  const g = createGame({ seed: 2 });
  const mil = place(g, 'militia', 100);
  const foot = place(g, 'footman', 200);
  const shd = place(g, 'shield', 300);
  const baron = place(g, 'baron', 400);
  ok(hit(g, mil, 8).d === 8, '无甲全额伤害');
  ok(hit(g, foot, 8).d === 6, '步兵甲2 减伤 8→6');
  ok(hit(g, shd, 8).d === 2, '盾卫甲6 减伤 8→2');
  ok(hit(g, shd, 3).d === 1, '伤害下限 1(3-6<1)');
  near(hit(g, shd, 36, 0.5).d, 33, 1e-9, '弩炮破甲50%: 36-3=33');
  ok(hit(g, baron, 98, 1).d === 98, '弩炮3级破甲100%无视甲10');
  ok(hit(g, baron, 5, 0, true).d === 5, '灼烧真实伤害无视护甲');
  ok(hit(g, shd, 36, 0.75).d === 34.5, '破甲75%: 36-1.5=34.5');
}
section('溅射衰减');
{
  const g = combat(createGame({ seed: 3 }));
  const A = place(g, 'militia', 600);
  const B = place(g, 'militia', 624);
  const C = place(g, 'militia', 646);
  const D = place(g, 'militia', 660);
  const p = pointOnPath(600);
  g.shots.push({ kind:'rock', x0:0, y0:0, x1:p.x, y1:p.y, t:0.9 - 1e-5, ft:0.9, dmg:20, radius:48, dead:false });
  const evs = tick(g, 1e-5);
  ok(evs.some(e => e.k === 'land'), '落点事件');
  near(A.hp, 38 - 20, 0.02, '中心 100%');
  near(B.hp, 38 - 14, 0.02, '半程 70%');
  ok(C.hp > 38 - 10 && C.hp < 38 - 7, `边缘约40%~45%(实测伤害 ${(38 - C.hp).toFixed(2)})`);
  ok(D.hp === 38, '溅射半径外不受伤');
  ok(g.shots.length === 0, '石弹落地后消失');
}
section('减速与灼烧标记');
{
  const g = combat(createGame({ seed: 4 }));
  const A = place(g, 'militia', 500);   // 油塔(6,4)射程内
  const B = place(g, 'militia', 100);   // 射程外参照
  putTower(g, 'oil', 6, 4);
  const evs = tick(g, 1/60);
  ok(evs.some(e => e.k === 'fire' && e.type === 'oil'), '火油脉冲事件');
  near(A.slowF, 0.30, 1e-9, '减速 30%');
  ok(A.slowUntil > g.t, '减速有持续时间');
  ok(A.burnT > g.t - 1, '灼烧标记');
  ok(B.slowF === 0, '范围外不减速');
  const d0 = A.dist, b0 = B.dist;
  tick(g, 1);
  const ratio = (A.dist - d0) / (B.dist - b0);
  ok(ratio > 0.65 && ratio < 0.75, `减速后速度比 ≈0.7(实测 ${ratio.toFixed(3)})`);
  // 不叠加只刷新：等级不变时二脉冲 slowF 不变
  const before = A.slowF;
  for(let i = 0; i < 70; i++) tick(g, 1/30);
  near(A.slowF, before, 1e-9, '重复脉冲不叠加减速');
}

/* ───────────────── 4. 索敌与弹道 ───────────────── */
section('索敌：最前优先/射程边界/转火');
{
  const g = combat(createGame({ seed: 5 }));
  putTower(g, 'arrow', 2, 3);
  const A = place(g, 'militia', 100);
  const B = place(g, 'militia', 150);
  tick(g, 1/60);
  ok(g.shots.length === 1 && g.shots[0].tid === B.id, '优先射击路径进度最前者');
  // 目标死亡立即转火
  const ev0 = [];
  applyDamage(g, B, 9999, 0, false, ev0);
  ok(!B.alive, '目标被击杀');
  g.shots.length = 0;
  g.towers[0].cd = 0;
  tick(g, 1/60);
  ok(g.shots.length === 1 && g.shots[0].tid === A.id, '目标死后转火次前目标');
  // 击杀赏金只发一次
  const goldAfter = g.gold;
  applyDamage(g, B, 100, 0, false, []);
  ok(g.gold === goldAfter, '尸体不再发赏金');
}
section('射程边界');
{
  const g = combat(createGame({ seed: 6 }));
  putTower(g, 'arrow', 2, 3);          // 塔中心 (120,168)，射程 2.6 格 = 124.8px
  const far = place(g, 'militia', 0.5); // 起点 (-24,120)，距离 151.9px
  tick(g, 1/60);
  ok(g.shots.length === 0, '射程外不开火');
  ok(g.towers[0].cd <= 0, '无目标时冷却保持就绪');
  const inR = place(g, 'militia', 100);
  tick(g, 1/60);
  ok(g.shots.length === 1, '射程内开火');
  void far; void inR;
}
section('弹道：命中/目标中途死亡扑空');
{
  const g = combat(createGame({ seed: 7 }));
  putTower(g, 'arrow', 2, 3);
  const far = place(g, 'militia', 0.5); // 射程外钉子户，防止清场触发波次结算
  const A = place(g, 'militia', 100);
  tick(g, 1/60);
  ok(g.shots.length === 1, '箭在飞');
  const evs = [];
  applyDamage(g, A, 9999, 0, false, evs);
  const gold1 = g.gold;
  const killEvents = evs.filter(e => e.k === 'kill').length;
  for(let i = 0; i < 60 && g.shots.length; i++) tick(g, 1/30);
  ok(g.shots.length === 0, '目标死后箭矢扑空消失');
  ok(g.gold === gold1, '扑空不重复结算赏金');
  ok(killEvents === 1, '击杀事件仅一次');
  // 正常命中
  const B = place(g, 'militia', 120);
  const hp0 = B.hp;
  for(let i = 0; i < 60 && g.shots.length === 0; i++) tick(g, 1/60);
  for(let i = 0; i < 90 && g.shots.length; i++) tick(g, 1/60);
  ok(B.hp < hp0, '箭矢命中造成伤害');
  void far;
}

/* ───────────────── 5. 波次控制 ───────────────── */
section('波次数据');
ok(WAVES.length === 15, '战役 15 波');
WAVES.forEach((w, i) => {
  ok(w.mul > 0 && w.comp.length > 0, `第 ${i + 1} 波编成非空`);
  ok(w.comp.every(([t, n]) => ENEMIES[t] && n > 0), `第 ${i + 1} 波兵种合法`);
});
ok(WAVES[14].comp.some(([t]) => ENEMIES[t].boss), '第 15 波含 Boss');
ok(WAVES.slice(0, 14).every(w => !w.comp.some(([t]) => ENEMIES[t].boss)), '前 14 波无 Boss');
ok(ENEMIES.ram.cdmg === 3 && ENEMIES.baron.cdmg === 5, '冲车/男爵对城墙伤害 3/5');
section('出怪与提前出战');
{
  const g = createGame({ seed: 8 });
  ok(g.phase === 'build' && !isFinite(g.buildLeft), '首波备战不计时');
  const r = callNext(g);
  ok(r.ok && r.bonus === 0, '首波提前出战无奖励');
  ok(g.phase === 'combat' && g.queue.length === 6, `第 1 波出怪 6(实测 ${g.queue.length})`);
  let guard = 0;
  while(g.queue.length && ++guard < 500) tick(g, 0.5);
  ok(g.queue.length === 0 && g.enemies.length === 6, '全部敌军入场');
  ok(!callNext(g).ok, '战斗中不可再出战');
  // 清场后进入下一波备战
  g.enemies.forEach(e => e.alive = false);
  const evs = tick(g, 1/60);
  ok(g.phase === 'build' && g.wave === 2, '清场进入第 2 波备战');
  ok(isFinite(g.buildLeft) && Math.abs(g.buildLeft - BUILD_SECS) < 1e-9, `备战计时 ${BUILD_SECS}s`);
  ok(evs.some(e => e.k === 'waveClear' && e.bonus === 30 + 5 * 1), '第 1 波通关奖励 35');
  // 提前出战奖励
  g.buildLeft = 17.3;
  const gold0 = g.gold;
  const r2 = callNext(g);
  ok(r2.ok && r2.bonus === 34, `提前出战奖励 floor(17.3)×2=34(实测 ${r2.bonus})`);
  ok(g.gold === gold0 + 34, '奖励入账');
}
section('备战倒计时自动开战');
{
  const g = createGame({ seed: 9 });
  g.phase = 'build'; g.buildLeft = 0.05;
  tick(g, 0.1);
  ok(g.phase === 'combat', '倒计时归零自动开战');
}

/* ───────────────── 6. 升级与出售 ───────────────── */
section('升级与出售');
{
  const g = createGame({ seed: 10 });
  const t = build(g, 2, 3, 'arrow');
  ok(t.ok, '建塔');
  const tw = g.towers[0];
  ok(upgrade(g, tw.id).ok && tw.lv === 1, '升到 2 级');
  ok(g.gold === START_GOLD - 70 - 110, `升级扣款(实测 ${g.gold})`);
  g.gold = 0;
  ok(upgrade(g, tw.id).why === 'gold', '金币不足不可升级');
  g.gold = 1000;
  ok(upgrade(g, tw.id).ok && tw.lv === 2, '升到 3 级');
  ok(upgrade(g, tw.id).why === 'max', '满级不可再升');
  ok(tw.invested === 70 + 110 + 160, '投入金额累计');
  const gold0 = g.gold;
  const s = sell(g, tw.id);
  ok(s.ok && s.refund === Math.floor(340 * SELL_RATIO), `出售返还 70%(实测 ${s.refund})`);
  ok(g.gold === gold0 + s.refund, '返还入账');
  ok(g.towers.length === 0 && canBuild(g, 2, 3).ok, '出售后空格可重建');
  ok(!sell(g, 999).ok, '出售不存在的塔拒绝');
  ok(!upgrade(g, 999).ok, '升级不存在的塔拒绝');
}

/* ───────────────── 7. 经济守恒（事件口径） ───────────────── */
section('经济守恒：期初+击杀+波奖+提前奖励-建造 ≡ 期末');
{
  const g = createGame({ seed: 11 });
  ok(build(g, 2, 3, 'arrow').ok, '前置箭塔1');
  ok(build(g, 4, 4, 'oil').ok, '前置火油台');
  ok(build(g, 4, 6, 'arrow').ok, '前置箭塔2');
  let expect = START_GOLD - 70 - 90 - 70;
  let waves = 0, minGold = Infinity, guard = 0;
  while(waves < 3 && g.phase !== 'lost' && ++guard < 200000){
    if(g.phase === 'build'){
      const r = callNext(g);
      if(r.ok) expect += r.bonus;
    }else{
      for(const e of tick(g, 1/30)){
        if(e.k === 'kill') expect += e.gold;
        if(e.k === 'waveClear'){ expect += e.bonus; waves++; }
      }
    }
    minGold = Math.min(minGold, g.gold);
  }
  ok(expect === g.gold, `账目分毫不差(${expect} vs ${g.gold})`);
  ok(minGold >= 0, '全程金币非负');
  ok(waves === 3, '推进了 3 波');
}

/* ───────────────── 8. 确定性与序列化 ───────────────── */
section('确定性：同种子同轨迹');
{
  const a = runCampaign(7, REF_PLAN, {});
  const b = runCampaign(7, REF_PLAN, {});
  ok(serialize(a) === serialize(b), '同种子两次整局逐字节一致');
}
section('序列化：存档续跑 ≡ 不中断跑完');
{
  const full = runCampaign(7, REF_PLAN, {});
  const snap = runUntilBuildWave(7, REF_PLAN, 5);
  const s = serialize(snap);
  ok(serialize(deserialize(s)) === s, '序列化往返无损');
  const resumed = deserialize(s);
  let it = 0;
  try{
    while(resumed.phase !== 'won' && resumed.phase !== 'lost' && ++it < 400000){
      if(resumed.phase === 'build'){ aiBuild(resumed, REF_PLAN); callNext(resumed); }
      else tick(resumed, 1/30);
    }
    ok(serialize(resumed) === serialize(full), '从第 5 波存档续跑与整局一致');
  }catch(err){ ok(false, '续跑抛错: ' + err.message); }
}
section('存档内容白盒');
{
  const g = runUntilBuildWave(7, REF_PLAN, 3);
  const s = serialize(g);
  ok(s.length > 200 && s.length < 1e6, `存档体量合理(${s.length}B)`);
  const o = JSON.parse(s);
  ok(o.v === 1 && typeof o.gold === 'number' && Array.isArray(o.towers) && Array.isArray(o.enemies), '存档字段齐全');
  ok(o.phase === 'build' && o.wave === 3, '存档点为第 3 波备战');
}
section('首波无限备战期存档往返');
{
  const g = createGame({ seed: 1 });          // 首波 buildLeft=Infinity
  const s = serialize(g);
  const g2 = deserialize(s);
  ok(g2.buildLeft === Infinity, 'buildLeft 无穷往返还原');
  tick(g2, 5);
  ok(g2.phase === 'build' && g2.wave === 1, '读档后首波不会自动开战');
  ok(callNext(g2).ok, '玩家仍可手动出战');
  // 战斗中存档往返
  callNext(g2);
  for(let i = 0; i < 30; i++) tick(g2, 1/30);
  const s2 = serialize(g2);
  const g3 = deserialize(s2);
  ok(g3.phase === 'combat' && Math.abs(g3.waveT - g2.waveT) < 1e-9, '战斗中存档往返一致');
}

/* ───────────────── 9. 全 AI 整局模拟 ───────────────── */
section('参考构筑必须通关 15 波且余耐久 ≥5');
{
  const t0 = Date.now();
  const g = runCampaign(7, REF_PLAN, { tag: '参考局' });
  const secs = (Date.now() - t0) / 1000;
  ok(g.phase === 'won', `参考构筑通关(终局 ${g.phase}，止步第 ${g.wave} 波，余耐久 ${g.lives})`);
  ok(g.lives >= 5, `通关后剩余耐久 ≥5(实测 ${g.lives})`);
  ok(g.lives <= 16, `通关不至于太轻松(余耐久 ${g.lives} ≤16)`);
  console.log(`  · 参考局结算：耐久 ${g.lives}/20 · 金币 ${g.gold} · 击杀 ${g.kills} · 塔数 ${g.towers.length}`);
  ok(secs < 3, `整局引擎模拟 <3s(实测 ${secs.toFixed(2)}s)`);
}
section('完全不建塔必败');
{
  const g = runCampaign(3, REF_PLAN, { noBuild: true, tag: '裸奔局' });
  ok(g.phase === 'lost', '不建塔城破');
  ok(g.wave <= 6, `撑不过第 6 波(实测止步第 ${g.wave} 波)`);
  ok(g.leaked >= LIVES, `漏怪数 ≥ 初始耐久(实测 ${g.leaked})`);
}
section('无尽模式 25 波不失控');
{
  const g = runCampaign(3, REF_PLAN, { endless: true, maxW: 25, tag: '无尽局' });
  ok(g.wave > 12, `无尽至少推进到 13 波(实测 ${g.wave})`);
  ok(g.phase === 'build' ? g.wave > 25 : true, '跑到 25 波上限或自然败北');
  ok(g.enemies.every(e => isFinite(e.hp) && isFinite(e.dist)), '敌人状态始终有限');
  // 血量系数单调递增、编成合法、男爵只在整十波
  let last = 0;
  for(let n = 1; n <= 40; n++){
    const w = makeEndlessWave(n);
    ok(w.mul > last, `无尽第 ${n} 波强度递增`);
    last = w.mul;
    ok(w.comp.length > 0 && w.comp.every(([t, c]) => ENEMIES[t] && c > 0), `无尽第 ${n} 波编成合法`);
    ok(w.comp.some(([t]) => t === 'baron') === (n % 10 === 0), `无尽第 ${n} 波男爵出场规律`);
  }
}

/* ───────────────── 10. 数据表合法性 ───────────────── */
section('数据表合法性');
{
  for(const [k, T] of Object.entries(TOWERS)){
    ok(T.cost.length === 3 && T.dmg.length === 3 && T.rate.length === 3 && T.range.length === 3, `${T.name} 三级数据齐全`);
    ok(T.cost[0] < T.cost[1] && T.cost[1] < T.cost[2], `${k} 成本递增`);
    ok(T.dmg[0] < T.dmg[2] && T.range[0] <= T.range[2] && T.rate[0] >= T.rate[2], `${k} 成长方向正确`);
    ok(T.cost.every(c => c > 0 && c <= 500), `${k} 成本量级合理`);
  }
  for(const [k, E] of Object.entries(ENEMIES)){
    ok(E.hp > 0 && E.spd > 0 && E.bounty > 0 && E.cdmg >= 1, `${E.name} 基础数值为正`);
    ok(E.armor >= 0 && E.armor <= 12, `${k} 护甲量级合理`);
    ok(E.spd <= 2.3, `${k} 速度不超上限`);
  }
  ok(TOWERS.ballista.pierce[2] === 1 && TOWERS.oil.burn === true, '破甲塔与灼烧塔特性在场');
  ok(ENEMIES.baron.boss === true, '男爵是 Boss');
}

/* ───────────────── 汇总 ───────────────── */
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`通过 ${pass} · 失败 ${fail}`);
if(fail > 0){
  console.log('\n失败用例:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
