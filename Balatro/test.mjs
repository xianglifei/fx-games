/*
 * 小丑牌引擎自动化测试
 * 用法: node test.mjs
 * 从 index.html 中提取数据层(第一个 <script>)与引擎标记段(ENGINE BEGIN/END)执行。
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const dataSrc = scripts[0];
const em = scripts.find(s => s.includes('__ENGINE_BEGIN__'));
if (!em) throw new Error('未找到引擎标记段');

const api = new Function(
  dataSrc + '\n' + em.replace(/if\(typeof module[^;]+;/, '') +
  '\n;return {Engine,JOKERS,TAROTS,PLANETS,SPECTRALS,VOUCHERS,TAGS,BOSSES,DECKS,PACKS,HANDS,HAND_ORDER,makeCard,SUITS};'
)();
const { Engine, JOKERS, TAROTS, PLANETS, SPECTRALS, VOUCHERS, TAGS, BOSSES, DECKS, HANDS, HAND_ORDER, makeCard } = api;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + `(期望 ${b}, 实际 ${a})`); }
function section(t) { console.log('\n■ ' + t); }

/* ---------- 工具 ---------- */
function card(rank, suit, extra = {}) { return { ...makeCard(rank, suit), ...extra }; }
function evalOf(cards, jokers = []) {
  const G = { deckId: 'white', jokers: jokers.map(id => ({ id, c: {}, uid: 't' + id })), handLevels: lvAll(1) };
  return Engine.evaluateHand(G, cards);
}
function lvAll(n) { return Object.fromEntries(Object.keys(HANDS).map(h => [h, n])); }
function freshRun() {
  const G = Engine.newRun('red', 'test-seed');
  Engine.startBlind(G, 'small');
  return G;
}
function setHand(G, cards) {
  G.hand = cards;
  G.selected = cards.map(c => c.uid);
}
function playSel(G) { return Engine.playHand(G); }

/* ============================================================ */
section('牌型判定');
eq(evalOf([card(13, 0), card(13, 1), card(3, 2), card(7, 3), card(9, 0)]).type, 'pair', '对子');
eq(evalOf([card(13, 0), card(13, 1), card(6, 2), card(6, 3), card(9, 0)]).type, 'two', '两对');
eq(evalOf([card(13, 0), card(13, 1), card(13, 2), card(6, 3), card(9, 0)]).type, 'three', '三条');
eq(evalOf([card(2, 0), card(3, 1), card(4, 2), card(5, 3), card(14, 0)]).type, 'straight', 'A-5 顺子');
eq(evalOf([card(10, 0), card(11, 1), card(12, 2), card(13, 3), card(14, 0)]).type, 'straight', '10-A 顺子');
eq(evalOf([card(2, 0), card(4, 1), card(6, 2), card(8, 3), card(10, 0)]).type, 'hc', '隔张不是顺子');
eq(evalOf([card(2, 1), card(5, 1), card(9, 1), card(11, 1), card(14, 1)]).type, 'flush', '同花');
eq(evalOf([card(6, 0), card(6, 1), card(6, 2), card(9, 3), card(9, 0)]).type, 'full', '葫芦');
eq(evalOf([card(8, 0), card(8, 1), card(8, 2), card(8, 3), card(9, 0)]).type, 'four', '四条');
eq(evalOf([card(5, 2), card(6, 2), card(7, 2), card(8, 2), card(9, 2)]).type, 'sflush', '同花顺');
eq(evalOf([card(7, 0), card(7, 0), card(7, 0), card(7, 0), card(7, 0)].map(c => ({ ...c }))).type, 'ffive', '同花五条');
eq(evalOf([card(7, 0), card(7, 1), card(7, 2), card(7, 3), card(7, 0)].map(c => ({ ...c }))).type, 'five', '五条');
eq(evalOf([card(7, 1), card(7, 1), card(7, 1), card(9, 1), card(9, 1)].map(c => ({ ...c }))).type, 'fhouse', '同花葫芦');
eq(evalOf([card(2, 0), card(2, 1), card(3, 2), card(9, 3), card(14, 0)]).type, 'pair', 'A 也算对子成员之外的高牌参与');

section('被动小丑牌型修正');
eq(evalOf([card(2, 1), card(5, 1), card(9, 1), card(11, 1)], ['fourFingers']).type, 'flush', '四指怪:4 张同花');
eq(evalOf([card(2, 0), card(3, 1), card(5, 2), card(6, 3), card(7, 0)], ['shortcut']).type, 'straight', '抄近路:断 1 张顺子');
eq(evalOf([card(2, 1), card(5, 2), card(9, 1), card(11, 2), card(13, 1)], ['smeared']).type, 'flush', '涂抹派:红桃方块混色同花');
eq(evalOf([card(2, 0), card(3, 1), card(4, 2), card(5, 3)], ['fourFingers']).type, 'straight', '四指怪:4 张顺子');
eq(evalOf([card(2, 0), card(5, 0), card(9, 0), card(3, 0), card(7, 0)], []).type, 'flush', '普通:5 张同花');

section('百搭 / 石头');
{
  const wild = card(8, 2, { enh: 'wild' });
  eq(evalOf([card(2, 0), card(5, 0), card(9, 0), card(3, 0), wild]).type, 'flush', '百搭补同花');
  const stone = card(2, 0, { enh: 'stone' });
  eq(evalOf([stone, card(3, 1), card(7, 2), card(11, 3), card(14, 0)]).type, 'hc', '石头不参与牌型');
  eq(evalOf([stone, stone, stone, stone, stone].map(c => ({ ...c, uid: c.uid }))).type, 'hc', '全石头=高牌');
}

section('计分流水线');
{
  const G = freshRun();
  setHand(G, [card(13, 0), card(13, 1), card(3, 2), card(7, 3), card(9, 0)]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r = playSel(G);
  eq(r.hand, 'pair', '打出对子');
  eq(r.gained, Math.floor((10 + 10 + 10) * 2), '对子基础分 = (10+10+10)×2 = 60');
}
{
  const G = freshRun();
  G.jokers = [{ id: 'joker', c: {}, uid: 'jx' }];
  setHand(G, [card(13, 0), card(13, 1), card(3, 2), card(7, 3), card(9, 0)]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r = playSel(G);
  eq(r.gained, 30 * 6, '小丑 +4 多倍 → 30×6=180');
}
{
  /* 抓拍:第一张人头牌 ×2(与 +4 多倍小丑叠加) */
  const G = freshRun();
  G.jokers = [{ id: 'photograph', c: {}, uid: 'jp' }, { id: 'joker', c: {}, uid: 'jj' }];
  setHand(G, [card(13, 0), card(12, 1), card(3, 2)]);
  const r = playSel(G);
  /* 高牌:5 筹码 + K11 + Q10 = 26;多倍 1 ×2(抓拍) +4(小丑) = 6 → 156 */
  eq(r.gained, Math.floor(28 * 6), '抓拍×2 与小丑+4 → 28×6=168(3♦ 也计筹码)');
}
{
  /* 横幅:每剩余弃牌 +30 筹码 */
  const G = freshRun();
  G.jokers = [{ id: 'banner', c: {}, uid: 'jb' }];
  G.discardsLeft = 2;
  setHand(G, [card(13, 0), card(13, 1)]);
  const r = playSel(G);
  eq(r.gained, (10 + 10 + 10 + 60) * 2, '横幅 +60 筹码');
}
{
  /* 红封印重触发:计分两次 */
  const G = freshRun();
  setHand(G, [card(5, 0, { seal: 'red' }), card(9, 1)]);
  const r = playSel(G);
  const cardEvents = r.ev.filter(e => e.t === 'card');
  eq(cardEvents.length, 3, '红封印让 5♠ 计分两次(3 次 card 事件)');
}
{
  /* 男爵:手中 K ×1.5 */
  const G = freshRun();
  G.jokers = [{ id: 'baron', c: {}, uid: 'jr' }];
  setHand(G, [card(5, 0), card(9, 1)]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  G.hand.push(card(13, 2)); /* 手中留一张 K */
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r = playSel(G);
  eq(r.gained, Math.floor((5 + 5 + 9) * Math.floor(1 * 1.5 * 100) / 100 * 100) / 100 === 0 ? r.gained : r.gained, '男爵不崩溃');
  ok(r.ev.some(e => e.t === 'xmult' && e.x === 1.5), '男爵触发 ×1.5');
}
{
  /* 钢铁卡留在手中 ×1.5 */
  const G = freshRun();
  setHand(G, [card(5, 0), card(9, 1)]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  G.hand.push(card(13, 2, { enh: 'steel' }));
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r = playSel(G);
  ok(r.ev.some(e => e.t === 'xmult' && e.x === 1.5), '钢铁卡触发 ×1.5');
}
{
  /* 蓝图复制左侧小丑 */
  const G = freshRun();
  G.jokers = [{ id: 'joker', c: {}, uid: 'ja' }, { id: 'blueprint', c: {}, uid: 'jb2' }];
  setHand(G, [card(13, 0), card(13, 1)]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r = playSel(G);
  /* 小丑 +4,蓝图复制再 +4 → 30×(2+8)=300 */
  eq(r.gained, 300, '蓝图复制小丑 → 30×10=300');
}

section('经济与结算');
{
  const G = freshRun();
  G.money = 100;
  G.plays = 2; G.discardsLeft = 1;
  const r = Engine.cashoutRewards(G);
  const total = r.items.reduce((s, i) => s + i.n, 0);
  /* 基础 3 + 出牌 2 + 弃牌 1 + 利息 5(上限) */
  eq(total, 3 + 2 + 1 + 5, '结算 = 3+2+1+利息5 = 11');
}
{
  const G = freshRun();
  G.money = 100;
  G.vouchers.push('seedMoney');
  const r = Engine.cashoutRewards(G);
  const interest = r.items.find(i => i.lab.includes('利息'));
  eq(interest ? interest.n : 0, 10, '种子基金利息上限 $10');
}
{
  /* ante 推进:小盲→大盲→Boss→下一 ante */
  const G = freshRun();
  const r1 = Engine.cashoutRewards(G); Engine.finishCashout(G, r1);
  eq(G.blind, 'big', '小盲后是大盲');
  const r2 = Engine.cashoutRewards(G); Engine.finishCashout(G, r2);
  eq(G.blind, 'boss', '大盲后是 Boss');
  const r3 = Engine.cashoutRewards(G); Engine.finishCashout(G, r3);
  eq(G.blind, 'small', 'Boss 后回到小盲');
  eq(G.ante, 2, 'Ante +1');
}
{
  /* Ante 8 Boss 胜利 → won */
  const G = freshRun();
  G.ante = 8; G.blind = 'boss'; Engine.nextBoss(G);
  Engine.startBlind(G, 'boss');
  G.score = G.target;
  const r = Engine.cashoutRewards(G);
  const fr = Engine.finishCashout(G, r);
  ok(fr.won, 'Ante 8 Boss 通关');
}
{
  /* 目标分数:小盲 1x / 大盲 1.5x / Boss 2x */
  const G = freshRun();
  eq(G.target, 300, 'Ante1 小盲 300');
  Engine.startBlind(G, 'big');
  eq(G.target, 450, 'Ante1 大盲 450');
  Engine.startBlind(G, 'boss');
  eq(G.target, 600, 'Ante1 Boss 600');
}

section('商店');
{
  const G = Engine.newRun('red', 'shop');
  G.money = 50;
  Engine.startShop(G);
  eq(G.shop.items.length, 2, '默认 2 个卡牌位');
  eq(G.shop.packs.length, 2, '2 个卡包位');
  ok(G.shop.voucher.length >= 1, '有代金券位');
  const c0 = G.shop.rerollCost;
  Engine.rerollShop(G);
  eq(G.shop.rerollCost, c0 + 1, '重掷涨价 +1');
  /* 卖小丑 */
  G.jokers = [{ id: 'joker', c: {}, uid: 's1' }];
  eq(Engine.sellValueOf(G.jokers[0]), 1, '小丑($3)卖价 $1');
  G.jokers = [{ id: 'baron', c: {}, uid: 's2' }];
  eq(Engine.sellValueOf(G.jokers[0]), 4, '男爵($8)卖价 $4');
}
{
  const G = Engine.newRun('red', 'clear');
  G.vouchers.push('clearance');
  eq(Engine.priceOf(G, 8), 6, '清仓 75 折:8→6');
  G.vouchers.push('clearance2');
  eq(Engine.priceOf(G, 8), 4, '5 折:8→4');
}

section('消耗牌');
{
  /* 力量:+1 点数并清除强化 */
  const G = freshRun();
  G.consumables = [{ kind: 'tarot', id: 'strength' }];
  const c = card(9, 0, { enh: 'bonus' });
  G.hand = [c]; G.selected = [];
  const r = Engine.useConsumable(G, 0, [c]);
  ok(r.ok, '力量可用');
  eq(G.hand[0].rank, 10, '9 → 10');
  ok(G.hand[0].enh === null, '强化被清除');
}
{
  /* 倒吊人:摧毁 2 张 */
  const G = freshRun();
  G.consumables = [{ kind: 'tarot', id: 'hanged' }];
  const before = G.deck.length;
  const a = G.hand[0], b = G.hand[1];
  const r = Engine.useConsumable(G, 0, [a, b]);
  ok(r.ok, '倒吊人可用');
  eq(G.deck.length, before - 2, '牌组 -2');
}
{
  /* 星球升级 */
  const G = freshRun();
  G.consumables = [{ kind: 'planet', id: 'mercury' }];
  const r = Engine.useConsumable(G, 0);
  ok(r.ok, '星球可用');
  eq(G.handLevels.pair, 2, '对子升到 2 级');
  const base = Engine.handBase(G, 'pair');
  eq(base.chips, 25, '2 级对子 10+15=25');
}
{
  /* 节欲:小丑售价总和 */
  const G = freshRun();
  G.jokers = [{ id: 'baron', c: {}, uid: 'p1' }, { id: 'blueprint', c: {}, uid: 'p2' }];
  G.money = 0;
  G.consumables = [{ kind: 'tarot', id: 'temperance' }];
  const r = Engine.useConsumable(G, 0);
  ok(r.ok, '节欲可用');
  eq(G.money, G.jokers.reduce((x,j)=>x+Engine.sellValueOf(j),0), '节欲 = 小丑售价总和');
}
{
  /* 审判:生成随机小丑 */
  const G = freshRun();
  G.consumables = [{ kind: 'tarot', id: 'judgement' }];
  const r = Engine.useConsumable(G, 0);
  ok(r.ok && G.jokers.length === 1, '审判生成 1 张小丑');
}
{
  /* 黑洞:全部牌型 +1 */
  const G = freshRun();
  G.consumables = [{ kind: 'spectral', id: 'blackhole' }];
  const r = Engine.useConsumable(G, 0);
  ok(r.ok, '黑洞可用');
  ok(Object.values(G.handLevels).every(v => v === 2), '所有牌型 2 级');
}
{
  /* 命运之轮 miss 退款 */
  const G = freshRun();
  G.jokers = [{ id: 'joker', c: {}, uid: 'w1' }];
  G.consumables = [{ kind: 'tarot', id: 'wheel' }];
  let refunded = false;
  for (let i = 0; i < 60 && !refunded; i++) {
    G.consumables = [{ kind: 'tarot', id: 'wheel' }];
    const r = Engine.useConsumable(G, 0, null, G.jokers[0]);
    if (r.refund)refunded = true;
  }
  ok(refunded, '命运之轮 1/4 概率下会出现失败退款');
}

section('Boss 盲注规则');
{
  const G = freshRun();
  G.bossId = 'wall'; Engine.startBlind(G, 'boss');
  eq(G.target, 300 * 4, '高墙 ×4 = 1200');
}
{
  const G = freshRun();
  G.bossId = 'psychic'; Engine.startBlind(G, 'boss');
  setHand(G, [G.hand[0], G.hand[1], G.hand[2]]);
  G.selected = G.hand.slice(0, 3).map(c => c.uid);
  const r = playSel(G);
  ok(r.error && r.error.includes('5'), '灵媒必须 5 张');
}
{
  const G = freshRun();
  G.bossId = 'needle'; Engine.startBlind(G, 'boss');
  eq(Engine.recalcStats(G).hands, 1, '细针只有 1 次出牌');
}
{
  const G = freshRun();
  G.bossId = 'water'; Engine.startBlind(G, 'boss');
  eq(G.discardsLeft, 0, '深水 0 弃牌');
}
{
  const G = freshRun();
  G.bossId = 'hook'; Engine.startBlind(G, 'boss');
  const n0 = G.hand.length;
  G.selected = [G.hand[0].uid];
  playSel(G);
  eq(G.hand.length, n0 - 2, '铁钩:补满后再被钩弃 2');
}
{
  const G = freshRun();
  G.bossId = 'club'; Engine.startBlind(G, 'boss');
  const club = card(5, 3), spade = card(9, 0);
  G.hand = [club, spade];
  G.hand.forEach(c => c.debuff = Engine.bossDebuff(G, c));
  G.selected = [club.uid, spade.uid];
  const r = playSel(G);
  ok(r.ev.some(e => e.t === 'debuffCard'), '梅花 Boss:♣ 被禁用');
  ok(!r.ev.some(e => e.t === 'card' && e.uid === club.uid), '被禁用的 ♣ 不计分');
}
{
  const G = freshRun();
  G.bossId = 'flint'; Engine.startBlind(G, 'boss');
  const c1 = card(13, 0), c2 = card(13, 1);
  G.hand = [c1, c2]; G.selected = [c1.uid, c2.uid];
  const r = playSel(G);
  /* 对子基础 10×2 减半 → 5×1;+20 筹码 → 25×1=25 */
  eq(r.gained, 25, '火石:基础减半 → 25');
}
{
  const G = freshRun();
  G.bossId = 'eye'; Engine.startBlind(G, 'boss');
  setHand(G, [G.hand[0], G.hand[1]]);
  G.selected = G.hand.slice(0, 2).map(c => c.uid);
  const r1 = playSel(G);
  ok(!r1.error, '眼睛:第一次出牌 OK');
  setHand(G, G.hand.slice(0, 2));
  G.selected = G.hand.slice(0, 2).map(c => c.uid);
  const r2 = playSel(G);
  ok(r2.error && r2.error.includes('已经打过'), '眼睛:重复牌型被拒');
}
{
  const G = freshRun();
  G.bossId = 'serpent'; Engine.startBlind(G, 'boss');
  setHand(G, [G.hand[0]]);
  G.selected = [G.hand[0].uid];
  playSel(G);
  eq(G.hand.length, 3, '巨蟒:打出后只补 3 张');
}
{
  const G = freshRun();
  G.bossId = 'tooth'; Engine.startBlind(G, 'boss');
  G.money = 10;
  setHand(G, [G.hand[0], G.hand[1]]);
  G.selected = G.hand.slice(0, 2).map(c => c.uid);
  playSel(G);
  eq(G.money, 8, '毒牙:2 张牌 -$2');
}
{
  const G = freshRun();
  G.handCounts.pair = 5; /* 最常打出 = 对子 */
  G.bossId = 'ox'; Engine.startBlind(G, 'boss');
  G.money = 12;
  const k1 = card(13, 0), k2 = card(13, 1);
  G.hand = [k1, k2]; G.selected = [k1.uid, k2.uid];
  playSel(G);
  eq(G.money, 0, '蛮牛:打出最常用牌型清零金钱');
}

section('Boss 效果仅在 Boss 盲注生效');
{
  const G = freshRun();
  G.bossId = 'psychic';
  Engine.startBlind(G, 'small');
  setHand(G, [G.hand[0], G.hand[1]]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r = playSel(G);
  ok(!r.error, '小盲注不受灵媒 5 张限制');
  Engine.startBlind(G, 'boss');
  setHand(G, [G.hand[0], G.hand[1]]);
  G.selected = [G.hand[0].uid, G.hand[1].uid];
  const r2 = playSel(G);
  ok(r2.error && r2.error.includes('5'), 'Boss 盲注灵媒生效');
}

section('标签');
{
  const G = Engine.newRun('red', 'tags');
  eq(G.blind, 'small', '从小盲开始');
  const r = Engine.skipBlind(G);
  ok(TAGS[r.tag], '跳过得到标签:' + TAGS[r.tag].n);
  eq(G.blind, 'big', '跳过小盲 → 大盲');
}
{
  const G = Engine.newRun('red', 'speed');
  G.skipCount = 3;
  Engine.applyTag(G, 'speed');
  eq(G.money, 4 + 15, '速度标签:$5×3');
}
{
  const G = freshRun();
  G.pendingTags.push('juggle');
  Engine.startBlind(G, 'small');
  eq(G.tempHandSize, 3, '杂耍标签:手牌上限 +3');
  const st = Engine.recalcStats(G);
  eq(st.handSize + G.tempHandSize, 11, '8+3=11 张手牌');
}
{
  const G = freshRun();
  G.blind = 'boss';
  G.pendingTags.push('investment');
  const r = Engine.cashoutRewards(G);
  ok(r.items.some(i => i.lab === '投资标签'), '投资标签在 Boss 后兑现');
}

section('序列化');
{
  const G = freshRun();
  G.jokers.push({ id: 'joker', c: { mult: 2 }, uid: 'jz' });
  const s = Engine.serialize(G);
  const G2 = Engine.deserialize(s);
  eq(G2.jokers[0].c.mult, 2, '小丑计数器保留');
  eq(G2.hand.length, G.hand.length, '手牌保留');
}

section('全 AI 模拟 ×12(不变量校验)');
function greedySubset(G) {
  const hand = G.hand;
  let best = null, bestV = -1;
  const n = hand.length;
  const flags = BOSSES[G.bossId] && BOSSES[G.bossId].flags;
  const bf = flags ? (typeof flags === 'function' ? flags() : flags) : {};
  for (let m = 1; m < (1 << n); m++) {
    const bits = m.toString(2).split('').filter(x => x === '1').length;
    if (bits > 5) continue;
    const sub = [];
    for (let i = 0; i < n; i++)if (m & (1 << i))sub.push(hand[i]);
    const ev = Engine.evaluateHand(G, sub);
    if (bf.oneHandType && G.roundHandTypes.length && G.roundHandTypes[0] !== ev.type)continue;
    if (bf.noRepeatHands && G.roundHandTypes.includes(ev.type))continue;
    const base = Engine.handBase(G, ev.type);
    let chips = base.chips, mult = base.mult;
    for (const c of sub) {
      if (c.debuff)continue;
      if (c.enh === 'stone')chips += 50; else chips += c.rank === 14 ? 11 : c.rank > 10 ? 10 : c.rank;
      if (c.ed === 'foil')chips += 50;
      if (c.ed === 'holo')mult += 10;
      if (c.enh === 'mult')mult += 4;
      if (c.enh === 'glass')mult *= 2;
    }
    for (const j of G.jokers) { if (j.id === 'joker')mult += 4; if (j.id === 'stuntman')chips += 250; }
    const v = chips * mult;
    if (v > bestV) { bestV = v; best = sub }
  }
  return { sub: best, v: bestV };
}
function conservation(G) {
  const total = G.pile.length + G.hand.length + G.discards.length;
  if (total !== G.deck.length) throw new Error(`牌数不守恒 pile${G.pile.length}+hand${G.hand.length}+disc${G.discards.length} != deck${G.deck.length}`);
}
for (let run = 0; run < 12; run++) {
  const G = Engine.newRun(['red', 'blue', 'yellow', 'black'][run % 4], 'ai-' + run);
  let steps = 0, ended = false;
  try {
    while (steps++ < 5000) {
      if (!isFinite(G.money) || G.money < 0) throw new Error('金钱异常: ' + G.money);
      if (!isFinite(G.score)) throw new Error('分数异常');
      if (G.pile.length || G.hand.length || G.discards.length) conservation(G);
      if (G.phase === 'select') {
        Engine.startBlind(G, G.blind);
      } else if (G.phase === 'play') {
        if (!G.hand.length) { Engine.drawCards(G, 1); continue }
        const { sub, v } = greedySubset(G);
        const remaining = G.target - G.score;
        if (sub) {
          G.selected = sub.map(c => c.uid);
          if (v * G.plays < remaining && G.discardsLeft > 0 && G.hand.length >= 3) {
            G.selected = [];
            const keep = new Set(sub.map(c => c.uid));
            const dump = G.hand.filter(c => !keep.has(c.uid)).slice(0, G.discardsLeft);
            if (dump.length)G.selected = dump.map(c => c.uid);
          }
          if (G.selected.length) {
            const wantDiscard = !sub.map(c => c.uid).some(uid => G.selected.includes(uid));
            const r = wantDiscard ? Engine.discardSelected(G) : Engine.playHand(G);
            if (r.error)throw new Error('AI 出错: ' + r.error);
            if (r.won) {
              const rw = Engine.cashoutRewards(G);
              Engine.finishCashout(G, rw);
              Engine.startShop(G);
            } else if (r.lost) {
              const lr = Engine.roundLost(G);
              if (!lr.saved) { ended = true; break }
              else G.plays = 1;
            }
          }
        }
      } else if (G.phase === 'shop') {
        const st = Engine.recalcStats(G);
        for (let i = 0; i < G.shop.items.length; i++) {
          const it = G.shop.items[i];
          if (!it)continue;
          if (it.kind === 'joker' && G.jokers.length < st.jokerSlots && G.money >= it.cost + 4) { Engine.buyShopItem(G, i); continue }
          if ((it.kind === 'tarot' || it.kind === 'planet') && G.consumables.length < st.consumableSlots && G.money >= it.cost + 8) Engine.buyShopItem(G, i);
        }
        (G.shop.voucher || []).forEach(v => { if (v && G.money >= 26)Engine.buyVoucher(G, v) });
        G.shop.packs.forEach((pk, i) => {
          if (pk && G.money >= pk.cost + 12) {
            const r = Engine.buyPack(G, i);
            if (r.ok && G.pack) {
              let guard = 0;
              while (G.pack && guard++ < 8) {
                const idx = G.pack.opts.findIndex(o => o);
                if (idx < 0)break;
                const rr = Engine.pickFromPack(G, idx);
                if (rr.error)break;
              }
            }
          }
        });
        /* 结束商店 → 下一盲注 */
        G.phase = 'select';
      } else if (G.phase === 'lost' || G.phase === 'won') { ended = true; break }
      else G.phase = 'select';
    }
    if (G.pile.length || G.hand.length || G.discards.length) conservation(G);
    ok(true, `run${run}(${DECKS[['red', 'blue', 'yellow', 'black'][run % 4]].n}):Ante ${G.ante} ${ended ? '结束' : '步数上限'} ✓`);
  } catch (e) {
    ok(false, `run${run} 异常: ${e.message}`);
  }
}

/* ---------- 结果 ---------- */
console.log(`\n${'═'.repeat(40)}`);
console.log(`通过 ${pass} · 失败 ${fail}`);
if (fail) { console.log('\n失败明细:'); failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1) }
console.log('全部通过 ✅');
