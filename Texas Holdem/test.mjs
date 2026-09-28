/*
 * 德州扑克引擎自动化测试
 * 用法: node test.mjs
 * 从 index.html 中提取引擎标记段(ENGINE BEGIN / END)之间的纯引擎代码执行。
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\*__ENGINE_BEGIN__\*\/([\s\S]*?)\/\*__ENGINE_END__\*\//);
if(!m) throw new Error('未找到引擎标记段');
const api = new Function(
  m[1] +
  '\n;return {Engine, eval5, eval7, mcEquity, chenScore, handName, PERSONAS, RANKS, rankOf, suitOf};'
)();
const { Engine, eval5, eval7, mcEquity, chenScore, handName, PERSONAS } = api;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg){
  if(cond){ pass++; }
  else { fail++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function section(t){ console.log('\n■ ' + t); }

// 'As'/'Td'/'2c' → 整数牌
const SUIT_MAP = { s: 0, h: 1, d: 2, c: 3 };
const H = (...strs) => strs.map(s => SUIT_MAP[s[1]] * 13 + '23456789TJQKA'.indexOf(s[0]));

/* ───────────────────────── 1. 牌力评估 ───────────────────────── */
section('牌力评估 eval5');
ok(eval5(...H('As','Kd','9h','5c','2s')) < eval5(...H('2s','2d','9h','5c','As')), '一对 > 高牌');
ok(eval5(...H('2s','2d','9h','9c','As')) > eval5(...H('3s','3d','8h','8c','Ks')), '两对先比大牌:99+22 > 88+33');
ok(eval5(...H('2s','2d','9h','9c','As')) < eval5(...H('As','Ad','9h','9c','Ks')), 'AA+99 > 99+22');
ok(eval5(...H('2s','2d','2h','9c','As')) < eval5(...H('3s','3d','3h','8c','Ks')), '三条之间比点数');
ok(eval5(...H('2s','3d','4h','5c','Ad')) < eval5(...H('2s','3d','4h','5c','6d')), 'A5432 是最小顺子');
ok(eval5(...H('2s','3d','4h','5c','6d')) < eval5(...H('2s','4s','6s','8s','Ts')), '顺子 < 同花');
ok(eval5(...H('2s','4d','6h','8c','Ts')) < eval5(...H('2s','2d','2h','9c','9s')), '同花 < 葫芦');
ok(eval5(...H('2s','2d','2h','9c','9s')) < eval5(...H('As','Ad','Ah','Kc','Ks')), '葫芦比点数(22299 < AAAKK)');
ok(eval5(...H('As','Ad','Ah','Ac','2s')) > eval5(...H('Ks','Kd','Kh','Qc','Qs')), '四条 > 葫芦');
ok(eval5(...H('2s','2d','2h','2c','Ks')) < eval5(...H('As','Ad','Ah','Ac','2s')), '四条比点数');
ok(eval5(...H('2s','3d','4h','5c','6s')) < eval5(...H('Ad','Kd','Qd','Jd','Td')), '同花顺压顺子');
ok(eval5(...H('Ad','Kd','Qd','Jd','Td')) > eval5(...H('Ac','2c','3c','4c','5c')), '皇家同花顺 > 钢轮');
ok(eval5(...H('As','Ks','9s','5s','2s')) < eval5(...H('Ah','Kh','9h','6h','2h')), '同花比最大点');
ok(eval5(...H('As','Ks','9s','5s','2s')) === eval5(...H('Ac','Kc','9c','5c','2c')), '不同花色同点数平局');
ok(eval5(...H('2s','2d','Kh','Qc','Js')) < eval5(...H('2c','2h','Kd','Qc','As')), '一对比踢脚');
ok(eval5(...H('5s','5d','5h','2c','2s')) > eval5(...H('4s','4d','4h','Ac','Ad')), '55522 > 444AA(先比三条)');

section('牌型名称');
ok(handName(eval7(H('As','Ks'), H('Qs','Js','Ts','2d','2c'))) === '皇家同花顺', '皇家同花顺识别');
ok(handName(eval7(H('Ac','2c'), H('3c','4c','5c','Kd','Ks'))) === '同花顺', '钢轮识别(取最优五张)');
ok(handName(eval7(H('2c','2d'), H('3c','4c','5c','6c','7c'))) === '同花顺', '公共牌成同花顺,底牌无关');
ok(handName(eval7(H('As','Ad'), H('As','Ad','Kc','Kd','Qc'))) === '四条', '四条识别');
ok(handName(eval7(H('7d','8s'), H('7h','7c','8d','8h','2c'))) === '葫芦', '葫芦识别');
ok(handName(eval7(H('2h','4h'), H('9h','Jh','3h','3s','3c'))) === '同花', '同花识别(取最优)');
ok(handName(eval7(H('2s','4d'), H('3h','5c','6h','Ks','Kd'))) === '顺子', '顺子识别');

section('蒙特卡洛');
{
  const eqAA = mcEquity(H('As','Ad'), [], 1, 2000);
  const eq72 = mcEquity(H('7d','2c'), [], 1, 2000);
  ok(Math.abs(eqAA - 0.852) < 0.05, `AA 单挑胜率≈0.85(实测 ${eqAA.toFixed(3)})`);
  ok(eq72 > 0.28 && eq72 < 0.42, `72o 单挑胜率≈0.35(实测 ${eq72.toFixed(3)})`);
  const eqAA6 = mcEquity(H('As','Ad'), [], 5, 1500);
  ok(eqAA6 > 0.35 && eqAA6 < 0.6, `AA 六人胜率≈0.49(实测 ${eqAA6.toFixed(3)})`);
}
section('Chen 公式');
ok(chenScore(H('As','Ad')) === 20, 'AA=20');
ok(chenScore(H('As','Ks')) > chenScore(H('As','Kd')), '同花 > 不同花');
ok(chenScore(H('As','Ks')) > chenScore(H('7d','2c')), 'AKs > 72o');
ok(chenScore(H('7d','2c')) < 3, '72o 低分');

/* ───────────────────────── 2. 边池 ───────────────────────── */
function makeTestEngine(){
  return new Engine({
    seats: [
      { name: 'P0', persona: PERSONAS.bal }, { name: 'P1', persona: PERSONAS.bal },
      { name: 'P2', persona: PERSONAS.bal }, { name: 'P3', persona: PERSONAS.bal },
      { name: 'P4', persona: PERSONAS.bal }, { name: 'P5', persona: PERSONAS.bal },
    ],
    startChips: 10000,
  });
}
// 手工构造摊牌局面(白盒):设定 committed / handValue / pot
// revealed=true 防止 revealIfNeeded 用真实发牌覆盖测试用牌力值
function stageShowdown(e, committed, handValues, foldedIdx){
  e.pot = committed.reduce((s, x) => s + x, 0);
  e.players.forEach((p, i) => {
    p.committed = committed[i];
    p.handValue = handValues[i] || 1;
    p.folded = foldedIdx.includes(i);
    p.hole = H('As', 'Ks');
    p.out = false;
    p.revealed = true;
  });
  e.board = H('2d', '7h', '9c', 'Jd', 'Qs');
  e.dealerIdx = 0;
}

section('边池:两层全下');
{
  const e = makeTestEngine();
  // P0 全胜;P1/P2 输;P3/P4 弃牌注留池
  stageShowdown(e, [1000, 1000, 500, 300, 200, 0], [100, 90, 80, 0, 0, 0], [3, 4]);
  e.players.forEach(p => { p.chips = 0; });
  const ev = [];
  e.showdown(ev);
  ok(e.players[0].chips === 3000, `P0 独赢整池 3000(实测 ${e.players[0].chips})`);
  ok(e.players[1].chips === 0 && e.players[2].chips === 0, '输家不得筹码');
  ok(e.pot === 0, '底池清空');
  ok(e.totalChips() === 3000, '筹码守恒');
}

section('边池:三层,各层不同赢家');
{
  const e = makeTestEngine();
  // 层800:P2 牌最好;层800-2000:P0;层2000-5000:P0
  stageShowdown(e, [5000, 2000, 800, 300, 150, 50], [90, 50, 100, 0, 0, 0], [3, 4, 5]);
  e.players.forEach(p => { p.chips = 0; });
  e.showdown([]);
  // P2 只有 800:P2 赢 800 及以下的全部层(含弃牌者在 50/150/300 留下的注)
  ok(e.players[2].chips === 2900, `P2 得 800 以内各层共 2900(实测 ${e.players[2].chips})`);
  ok(e.players[0].chips === 5400, `P0 得 2000/5000 层共 5400(实测 ${e.players[0].chips})`);
  ok(e.players[1].chips === 0, 'P1 不得筹码');
}

section('边池:未被跟注部分退回');
{
  const e = makeTestEngine();
  // P0 全下 5000 但只有 P1 跟到 2000,其余弃牌 → 3000 退回 P0
  stageShowdown(e, [5000, 2000, 0, 150, 100, 50], [100, 90, 0, 0, 0, 0], [2, 3, 4, 5]);
  e.players.forEach(p => { p.chips = 0; });
  e.showdown([]);
  ok(e.players[0].chips === 7300, `P0 得全部 7300(实测 ${e.players[0].chips})`);
}

section('边池:平分与余数');
{
  const e = makeTestEngine();
  stageShowdown(e, [1001, 1001, 0, 0, 0, 0], [100, 100, 0, 0, 0, 0], [2, 3, 4, 5]);
  e.players.forEach(p => { p.chips = 0; });
  e.showdown([]);
  const got = e.players[0].chips + e.players[1].chips;
  ok(got === 2002, '平分总额不变');
  ok(Math.abs(e.players[0].chips - e.players[1].chips) <= 1, '平分差 ≤1(余数给离庄家近者)');
}

/* ───────────────────────── 3. 下注规则 ───────────────────────── */
section('盲注、行动顺序与最小加注');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  const ev = e.startHand();
  ok(e.sbIdx === 1 && e.bbIdx === 2, '庄0 → 小盲1 大盲2');
  ok(e.players[1].bet === 50 && e.players[2].bet === 100, '盲注入座');
  ok(e.awaiting === 3, '大盲左侧先行动');
  ok(e.curBet === 100, '翻牌前跟注额=大盲');
  const L3 = e.legal(3);
  ok(L3.canRaise && L3.minTo === 200, `开局最小加注到 200(2×BB)(实测 ${L3.minTo})`);
  e.apply(3, 'raise', 300);
  const L4 = e.legal(4);
  ok(L4.minTo === 500, `加注后最小加注到 500(300+200)(实测 ${L4.minTo})`);
  e.apply(4, 'raise', 900);        // 增量 600 ≥ 200 → 满额加注
  ok(e.minRaise === 600, 'minRaise 更新为 600');
  const L5 = e.legal(5);
  ok(L5.minTo === 1500, `再最小加注到 1500(实测 ${L5.minTo})`);
  ok(L5.toCall === 900, 'P5 未下盲注,跟注额 900');
}

section('短码全下不重开加注权');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  e.startHand();
  e.apply(3, 'raise', 300);
  e.apply(4, 'raise', 900);        // seq=3, minRaise=600
  e.apply(5, 'call');
  e.apply(0, 'fold');
  e.apply(1, 'fold');
  e.apply(2, 'call');              // 大盲行权
  const L3 = e.legal(3);
  ok(L3.canRaise === true, '满额加注重开 P3 的加注权');
  // P3 短码全下:到 1100(< 最小加注 1500);差额转给 P4 保持桌面总筹码不变
  const cut = e.players[3].chips - 800;
  e.players[3].chips -= cut;
  e.players[4].chips += cut;
  const L3s = e.legal(3);
  ok(L3s.maxTo === 1100 && L3s.minTo === 1100, `P3 只能全下 1100(实测 ${L3s.minTo})`);
  e.apply(3, 'raise', 1100);       // 增量 200 < 600 → 短码全下
  ok(e.raiseSeq === 3, '短码全下不推进 raiseSeq');
  ok(e.minRaise === 600, '短码全下不改 minRaise');
  ok(e.curBet === 1100, 'curBet 更新为 1100');
  ok(e.legal(5).canRaise === false, '已行动的 P5 不可再加注');
  ok(e.legal(2).canRaise === false, '已行动的 P2 不可再加注');
  ok(e.legal(5).toCall === 200, '仍需对新注额表态 200');
  e.apply(5, 'call');
  e.apply(2, 'call');
  e.apply(4, 'call');
  ok(e.street === 'flop', '下注结束进入翻牌');
  ok(e.awaiting === 2, '翻牌圈从庄家左侧第一个未弃牌者开始');
  ok(e.totalChips() === 60000, '筹码守恒');
}

section('全员过牌到大盲选项');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  e.startHand();
  e.apply(3, 'call'); e.apply(4, 'call'); e.apply(5, 'call'); e.apply(0, 'call'); e.apply(1, 'call');
  ok(e.awaiting === 2, '大盲还有选项');
  const L2 = e.legal(2);
  ok(L2.toCall === 0 && L2.canRaise, '大盲可过牌或加注');
  e.apply(2, 'check');
  ok(e.street === 'flop' && e.board.length === 3, '翻牌发出');
  ok(e.awaiting === 1, '翻牌后从小盲(P1)开始');
}

section('弃牌收池与未跟注退回(无人摊牌)');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  e.startHand();
  const before = e.players[2].chips;
  e.apply(3, 'raise', 600);
  e.apply(4, 'fold'); e.apply(5, 'fold'); e.apply(0, 'fold'); e.apply(1, 'fold');
  e.apply(2, 'fold');
  ok(e.phase === 'handOver', '只剩一人,本局结束');
  ok(e.players[3].chips === 10000 - 600 + 600 + 150, `P3 收回自己的注+盲注(实测 ${e.players[3].chips})`);
  ok(e.pot === 0, '底池清空');
  void before;
}

/* ───────────────────────── 4. 盲注升级与单挑 ───────────────────────── */
section('盲注升级');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  e.startHand();
  e.phase = 'handOver'; e.handNo = 8;
  e.nextHand();
  ok(e.handNo === 9 && e.sb() === 100 && e.bb() === 200, '第 9 局升到 100/200');
  e.phase = 'handOver'; e.handNo = 57;
  e.nextHand();
  ok(e.sb() === 1500 && e.bb() === 3000, '盲注封顶 1500/3000');
}

section('单挑:庄=小盲、行动顺序');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  e.startHand();
  // 强制只剩 P0 与 P1
  for(let i = 2; i < 6; i++){ e.players[i].out = true; e.players[i].chips = 0; }
  e.players[0].chips = 30000; e.players[1].chips = 30000;
  e.phase = 'handOver';
  e.nextHand();
  ok(e.sbIdx === 1 && e.bbIdx === 0, '单挑时庄家是小盲');
  ok(e.awaiting === 1, '翻牌前小盲(庄)先行动');
  e.apply(1, 'call');   // 补齐 200
  const L0 = e.legal(0);
  ok(L0.toCall === 0, '大盲无需再跟');
  e.apply(0, 'check');
  ok(e.street === 'flop' && e.awaiting === 0, '翻牌后大盲先行动');
}

section('全下跑步(无人再可下注)');
{
  const e = makeTestEngine();
  e.dealerIdx = 0;
  e.startHand();
  e.apply(3, 'raise', 10000);      // P3 全下
  e.apply(4, 'raise', 10000);      // P4 全下(跟平)
  e.apply(5, 'fold'); e.apply(0, 'fold'); e.apply(1, 'fold');
  e.apply(2, 'call', undefined);   // 大盲跟注全下?筹码 10000-100=9900 < 10000 → 全下跟
  ok(e.phase === 'handOver' || e.street === 'river', '全下后直接发完到河牌');
  ok(e.board.length === 5, '公共牌发满 5 张');
  ok(e.pot === 0, '底池已分配');
  ok(e.totalChips() === 60000, '筹码守恒');
}

/* ───────────────────────── 5. 整局模拟(不变量) ───────────────────────── */
section('整局模拟:12 局全 AI 对局,筹码守恒 + 必然终局');
{
  const personaList = Object.values(PERSONAS);
  const seats = personaList.map(pl => ({ name: 'AI-' + pl.label, persona: pl }));
  seats.push({ name: 'AI-2', persona: PERSONAS.tag });   // 第 6 人
  let totalHands = 0, maxHands = 0;
  const t0 = Date.now();
  for(let g = 0; g < 12; g++){
    const e = new Engine({
      seats,
      startChips: 10000,
      mcScale: 0.2,
    });
    e.startHand();
    let safety = 0;
    while(e.phase !== 'gameOver'){
      if(++safety > 300000) break;
      if(e.totalChips() !== 60000){
        ok(false, `筹码守恒被破坏:游戏${g} 第${e.handNo}局 total=${e.totalChips()}`);
        process.exit(1);
      }
      if(e.awaiting == null){
        if(e.phase === 'handOver') e.nextHand();
        else { ok(false, '无行动者但未终局(卡死)'); process.exit(1); }
      } else {
        const d = e.decideAI(e.awaiting);
        e.apply(e.awaiting, d.type, d.raiseTo);
      }
    }
    ok(e.phase === 'gameOver', `游戏${g} 正常终局(${e.handNo} 局)`);
    const winner = e.players.find(p => !p.out);
    ok(winner && winner.chips === 60000, `游戏${g} 唯一赢家拿满 60000`);
    totalHands += e.handNo; maxHands = Math.max(maxHands, e.handNo);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  · 12 局模拟完成:平均 ${(totalHands / 12).toFixed(0)} 手/局,最长 ${maxHands} 手,耗时 ${secs}s`);
  ok(maxHands < 600, '对局时长受控(盲注升级有效)');
}

/* ───────────────────────── 汇总 ───────────────────────── */
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`通过 ${pass} · 失败 ${fail}`);
if(fail > 0){
  console.log('\n失败用例:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
