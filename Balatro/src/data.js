/* ============================================================
   数据层:所有游戏内容(原创命名与文案)
   稀有度 r: 1常见 2罕见 3稀有 4传说
   ============================================================ */
'use strict';

const SUITS = ['♠','♥','♦','♣'];               // 0黑桃 1红桃 2方块 3梅花
const SUIT_NAMES = ['黑桃','红桃','方块','梅花'];
const RANK_STR = {11:'J',12:'Q',13:'K',14:'A'};

const HANDS = {
  hc:    {n:'高牌',   base:[5,1],    lv:[10,1],  planet:'pluto'},
  pair:  {n:'对子',   base:[10,2],   lv:[15,1],  planet:'mercury'},
  two:   {n:'两对',   base:[20,2],   lv:[20,1],  planet:'uranus'},
  three: {n:'三条',   base:[30,3],   lv:[20,2],  planet:'venus'},
  straight:{n:'顺子', base:[30,4],   lv:[30,3],  planet:'saturn'},
  flush: {n:'同花',   base:[35,4],   lv:[15,2],  planet:'jupiter'},
  full:  {n:'葫芦',   base:[40,4],   lv:[25,2],  planet:'earth'},
  four:  {n:'四条',   base:[60,7],   lv:[30,3],  planet:'mars'},
  sflush:{n:'同花顺', base:[100,8],  lv:[40,4],  planet:'neptune'},
  five:  {n:'五条',   base:[120,12], lv:[35,3],  planet:'planetx', secret:true},
  fhouse:{n:'同花葫芦',base:[140,14],lv:[40,4],  planet:'ceres',  secret:true},
  ffive: {n:'同花五条',base:[160,16],lv:[50,3],  planet:'eris',   secret:true},
};
const HAND_ORDER = ['ffive','fhouse','five','sflush','four','full','flush','straight','three','two','pair','hc'];

/* 各盲注基础分数(小盲=1x),Boss 倍率在 BOSSES 内定义 */
const ANTE_BASE = {1:300,2:800,3:2000,4:5000,5:11000,6:20000,7:35000,8:50000,
  9:110000,10:560000,11:7200000,12:300000000,13:47000000000,14:29000000000000,
  15:77000000000000000,16:860000000000000000000};

/* ---------- 修改器 / 版本 / 封印 元数据 ---------- */
const ENH_META = {
  bonus:{n:'奖励卡', d:'+30 筹码'},
  mult:{n:'多倍卡', d:'+4 多倍'},
  wild:{n:'百搭卡', d:'视为任意花色'},
  glass:{n:'玻璃卡', d:'×2 多倍,计分后 1/4 碎裂'},
  steel:{n:'钢铁卡', d:'留在手中时 ×1.5 多倍'},
  gold:{n:'黄金卡', d:'回合结束时留在手中 +$3'},
  lucky:{n:'幸运卡', d:'1/5 +20 多倍,1/15 +$20'},
  stone:{n:'石头卡', d:'+50 筹码,无点数花色'},
};
const ED_META = {foil:{n:'箔面',d:'+50 筹码'},holo:{n:'全息',d:'+10 多倍'},poly:{n:'彩宝',d:'×1.5 多倍'},negative:{n:'负片',d:'+1 卡槽'}};
const SEAL_META = {red:{n:'红封印',d:'计分时额外触发一次'},gold:{n:'金封印',d:'打出并计分时 +$3'},blue:{n:'蓝封印',d:'回合结束留在手中时,为最后打出的牌型生成星球'},purple:{n:'紫封印',d:'弃掉时生成一张塔罗牌'}};

/* ============================================================
   小丑牌 ×74
   钩子:onCardScore / onHeld / onHandScore / onDiscard / onRoundEnd /
        passive / perRound(每回合清零的计数键)
   ctx 提供:addChips/addMult/xMult/addMoney/p(概率)/rand/hand 等
   ============================================================ */
const JOKERS = {
  /* ---------- 常见 ---------- */
  joker:{n:'小丑',r:1,cost:3,e:'🃏',g:'#3d6fb8',d:'+4 多倍',
    onHandScore(c){c.addMult(4)}},
  greedy:{n:'贪婪鬼',r:1,cost:4,e:'♦️',g:'#a03d3d',d:'每张计分的 ♦ +3 多倍',
    onCardScore(c,cd){if(c.suit(cd)===2)c.addMult(3)}},
  lusty:{n:'淫欲鬼',r:1,cost:4,e:'♥️',g:'#b8415f',d:'每张计分的 ♥ +3 多倍',
    onCardScore(c,cd){if(c.suit(cd)===1)c.addMult(3)}},
  wrath:{n:'暴怒鬼',r:1,cost:4,e:'♠️',g:'#3a3f55',d:'每张计分的 ♠ +3 多倍',
    onCardScore(c,cd){if(c.suit(cd)===0)c.addMult(3)}},
  glutton:{n:'暴食鬼',r:1,cost:4,e:'♣️',g:'#2f6b45',d:'每张计分的 ♣ +3 多倍',
    onCardScore(c,cd){if(c.suit(cd)===3)c.addMult(3)}},
  crazy:{n:'疯帽子',r:1,cost:4,e:'🎩',g:'#6b4fa0',d:'打出「顺子」时 +12 多倍',
    onHandScore(c){if(c.handType==='straight')c.addMult(12)}},
  drunken:{n:'醉汉',r:1,cost:4,e:'🍺',g:'#a07830',d:'打出「同花」时 +12 多倍',
    onHandScore(c){if(c.handType==='flush')c.addMult(12)}},
  zany:{n:'怪人',r:1,cost:4,e:'🤡',g:'#b8552f',d:'打出「四条」时 +12 多倍',
    onHandScore(c){if(c.handType==='four')c.addMult(12)}},
  mad:{n:'狂人',r:1,cost:3,e:'😤',g:'#8f3d55',d:'打出「两对」时 +10 多倍',
    onHandScore(c){if(c.handType==='two')c.addMult(10)}},
  wily:{n:'狡狐',r:1,cost:4,e:'🦊',g:'#b8702f',d:'打出「三条」时 +12 多倍',
    onHandScore(c){if(c.handType==='three')c.addMult(12)}},
  clever:{n:'老油条',r:1,cost:3,e:'🧉',g:'#4f7a55',d:'打出「对子」时 +8 多倍',
    onHandScore(c){if(c.handType==='pair')c.addMult(8)}},
  half:{n:'半张牌',r:1,cost:4,e:'🌗',g:'#55606b',d:'打出的牌 ≤3 张时 +20 多倍',
    onHandScore(c){if(c.played.length<=3)c.addMult(20)}},
  misprint:{n:'印刷事故',r:1,cost:3,e:'🖨️',g:'#6b6b55',d:'+0 到 +23 多倍(随机)',
    onHandScore(c){c.addMult(c.rand(24))}},
  scaryface:{n:'凶脸扑克',r:1,cost:4,e:'👹',g:'#8f3d3d',d:'每张计分的人头牌 +30 筹码',
    onCardScore(c,cd){if(c.isFace(cd))c.addChips(30)}},
  evensteven:{n:'偶数先生',r:1,cost:4,e:'🪙',g:'#3d6b8f',d:'偶数点数(2/4/6/8/10)计分时 +4 多倍',
    onCardScore(c,cd){if(c.rank(cd)%2===0&&c.rank(cd)===cd.rank)c.addMult(4)}},
  oddtodd:{n:'奇数小哥',r:1,cost:4,e:'🧢',g:'#5d558f',d:'奇数点数(A/3/5/7/9)计分时 +31 筹码',
    onCardScore(c,cd){const r=c.rank(cd);if((r%2===1||r===14)&&c.rank(cd)===cd.rank)c.addChips(31)}},
  scholar:{n:'学者',r:1,cost:4,e:'🎓',g:'#3d558f',d:'每张计分的 A +20 筹码 +4 多倍',
    onCardScore(c,cd){if(c.rank(cd)===14&&c.rank(cd)===cd.rank){c.addChips(20);c.addMult(4)}}},
  photograph:{n:'抓拍',r:1,cost:5,e:'📸',g:'#4f6b55',d:'本手牌第一张计分的人头牌 ×2 多倍',
    onCardScore(c,cd){if(c.isFace(cd)&&!c.jcount('shot')){c.setj('shot',1);c.xMult(2)}}},
  grosMichel:{n:'大香蕉',r:1,cost:5,e:'🍌',g:'#b8912f',d:'+15 多倍。回合结束 1/6 概率被吃掉',
    onHandScore(c){c.addMult(15)},
    onRoundEnd(c){if(c.p(1,6))return{destroy:true}}},
  goldenJoker:{n:'黄金小丑',r:1,cost:6,e:'🏆',g:'#b8962f',d:'回合结束时 +$4',
    onRoundEnd(c){c.addMoney(4)}},
  businessCard:{n:'名片公司',r:1,cost:4,e:'💼',g:'#4a5560',d:'人头牌计分时 1/2 概率 +$2',
    onCardScore(c,cd){if(c.isFace(cd)&&c.p(1,2))c.addMoney(2)}},
  faceless:{n:'无脸男',r:1,cost:4,e:'😶',g:'#555d6b',d:'一次性弃掉 3 张以上人头牌时 +$5',
    onDiscard(c,cards){if(cards.filter(x=>c.isFace(x)).length>=3)c.addMoney(5)}},
  rideTheBus:{n:'搭便车',r:1,cost:6,e:'🚌',g:'#4f6b8f',d:'连续不打人头牌,每手 +1 多倍(打人头牌重置)',
    perRound:[],onHandScore(c){if(!c.scored.some(cd=>c.isFace(cd))){c.jk.c.mult=(c.jk.c.mult||0)+1}else{c.jk.c.mult=0}c.addMult(c.jk.c.mult)}},
  greenJoker:{n:'绿皮小丑',r:1,cost:4,e:'🤢',g:'#3d6b45',d:'每打一手 +1 多倍,每弃一次 -1 多倍',
    onHandScore(c){c.jk.c.mult=(c.jk.c.mult||0)+1;c.addMult(c.jk.c.mult)},
    onDiscard(c){c.jk.c.mult=(c.jk.c.mult||0)-1}},
  banner:{n:'小推车',r:1,cost:5,e:'🛒',g:'#6b5d4f',d:'每剩余一次弃牌机会 +30 筹码',
    onHandScore(c){c.addChips(30*c.discardsLeft())}},
  mysticSummit:{n:'神秘之巅',r:1,cost:5,e:'⛰️',g:'#4f5d6b',d:'弃牌机会为 0 时 +15 多倍',
    onHandScore(c){if(c.discardsLeft()===0)c.addMult(15)}},
  iceCream:{n:'冰淇淋',r:1,cost:5,e:'🍦',g:'#c9a3b8',d:'+100 筹码。每打一手 -5 筹码',
    onHandScore(c){c.addChips(c.jk.c.chips||100)},onHandPlayed(c){c.jk.c.chips=Math.max(0,(c.jk.c.chips||100)-5)}},
  runner:{n:'短跑健将',r:1,cost:5,e:'🏃',g:'#b86b2f',d:'打出顺子时永久 +15 筹码',
    onHandScore(c){if(c.handType==='straight'||c.handType==='sflush'){c.jk.c.chips=(c.jk.c.chips||0)+15}c.addChips(c.jk.c.chips||0)}},
  squareJoker:{n:'方阵教练',r:1,cost:4,e:'🟦',g:'#2f5d8f',d:'打出手牌恰好 4 张时永久 +4 筹码',
    onHandScore(c){if(c.played.length===4)c.jk.c.chips=(c.jk.c.chips||0)+4;c.addChips(c.jk.c.chips||0)}},
  supernova:{n:'超新星',r:1,cost:5,e:'💥',g:'#8f4fb8',d:'打出手牌时,+该牌型本局已打出次数等量多倍',
    onHandScore(c){c.addMult(c.handCount(c.handType))}},
  bull:{n:'斗牛士',r:1,cost:6,e:'🐂',g:'#8f3d30',d:'每持有 $1 +2 筹码',
    onHandScore(c){c.addChips(2*Math.max(0,c.money()))}},
  clock:{n:'时光钟摆',r:1,cost:5,e:'⏰',g:'#6b5540',d:'每回合开始手牌上限临时 +1,打一手 -1(最低为上限)',
    passive(c){return{handSize:(c.jk.c.hs||1)}},onRoundStart(c){c.jk.c.hs=(c.jk.c.hs||1)+Math.max(0,4-((c.jk.c.hs||1)-1))},onHandPlayed(c){c.jk.c.hs=Math.max(1,(c.jk.c.hs||1)-1)},d:'时钟储存 +N 手牌上限,每打一手消耗 1'},

  /* ---------- 罕见 ---------- */
  fourFingers:{n:'四指怪',r:2,cost:7,e:'🖖',g:'#6b4f8f',d:'「同花」「顺子」只需 4 张牌',passive:()=>({fourFingers:true})},
  shortcut:{n:'抄近路',r:2,cost:7,e:'🪝',g:'#4f6b60',d:'「顺子」允许中间断 1 张',passive:()=>({shortcut:true})},
  smeared:{n:'涂抹派',r:2,cost:7,e:'🎨',g:'#8f4f6b',d:'♥ 视同 ♦,♠ 视同 ♣',passive:()=>({smeared:true})},
  pareidolia:{n:'幻觉人生',r:2,cost:5,e:'👀',g:'#5d6b4f',d:'所有点数牌都视作人头牌',passive:()=>({allFace:true})},
  stencil:{n:'模板',r:2,cost:8,e:'⬜',g:'#6b6b6b',d:'×(1+空位小丑槽数) 多倍',
    onHandScore(c){c.xMult(1+c.emptyJokerSlots())}},
  fibonacci:{n:'斐波那契',r:2,cost:8,e:'🐚',g:'#8f6b3d',d:'每张计分的 A +8 多倍',
    onCardScore(c,cd){if(c.rank(cd)===14)c.addMult(8)}},
  baron:{n:'男爵',r:2,cost:8,e:'🎩',g:'#4f3d6b',d:'手中每张 K ×1.5 多倍',
    onHeld(c,cd){if(c.rank(cd)===13)c.xMult(1.5)}},
  vampire:{n:'吸血鬼',r:2,cost:8,e:'🧛',g:'#5d1f3d',d:'每张带强化的牌计分后,永久 +×0.1 多倍(并吸走其强化)',
    onCardScore(c,cd){if(c.enhOf(cd)){c.jk.c.x=(c.jk.c.x||1)+0.1;c.stealEnh(cd)}c.xMult(c.jk.c.x||1)}},
  hack:{n:'黑客',r:2,cost:8,e:'💻',g:'#2f5545',d:'点数 2/3/4/5 的计分牌额外触发一次',
    onCardScore(c,cd){if([2,3,4,5].includes(c.rank(cd)))c.retrigger(cd)}},
  blackboard:{n:'黑板',r:2,cost:6,e:'🖤',g:'#2a2a33',d:'手中全是 ♠/♣ 时 ×3 多倍',
    onHandScore(c){if(c.held().every(cd=>c.suit(cd)===0||c.suit(cd)===3))c.xMult(3)}},
  flowerPot:{n:'花盆',r:2,cost:8,e:'🪴',g:'#6b553d',d:'一手内四种花色都计分时 ×3 多倍',
    onHandScore(c){const s=new Set(c.scored.map(cd=>c.isSuitG(cd)));if(s.size>=(c.hasSmeared()?2:4))c.xMult(3)}},
  seeingDouble:{n:'二重奏',r:2,cost:7,e:'🥁',g:'#3d556b',d:'计分牌同时含 ♣ 和其他花色时 ×3 多倍',
    onHandScore(c){const s=new Set(c.scored.map(cd=>c.suit(cd)));if(s.has(3)&&s.size>=2)c.xMult(3)}},
  swashbuckler:{n:'侠盗',r:2,cost:4,e:'🗡️',g:'#7a5d3d',d:'+左侧小丑售价等量多倍',
    onHandScore(c){const v=c.leftSellValue();if(v>0)c.addMult(v)}},
  turtleBean:{n:'龟龟',r:2,cost:5,e:'🐢',g:'#3d6b55',d:'+5 手牌上限。每回合 -1',
    passive(c){return{handSize:(c.jk.c.hs===undefined?5:c.jk.c.hs)}},onRoundEnd(c){c.jk.c.hs=Math.max(0,(c.jk.c.hs===undefined?5:c.jk.c.hs)-1)},d:'龟壳储存 +5 手牌上限,每回合消耗 1'},
  hitTheRoad:{n:'上路吧!',r:2,cost:8,e:'🛣️',g:'#55402a',d:'本回合每弃掉一张 J ×2 多倍',
    onHandScore(c){const n=c.roundStat('jacksDiscarded');if(n>0)c.xMult(2*n)}},
  constellation:{n:'星座图',r:2,cost:6,e:'🔭',g:'#2f3d6b',d:'每使用一张星球牌永久 +×0.1 多倍',
    onHandScore(c){c.xMult(1+(c.jk.c.x||0))},extEvent:'planetUsed'},
  hologram:{n:'全息卡',r:2,cost:7,e:'🪩',g:'#4f6b8f',d:'每有一张牌加入牌组永久 +×0.25 多倍',
    onHandScore(c){c.xMult(1+(c.jk.c.x||0))},extEvent:'cardAdded'},
  glassJoker:{n:'玻璃小丑',r:2,cost:7,e:'🥃',g:'#8fa3b8',d:'每张玻璃牌碎裂时永久 +×0.2 多倍',
    onHandScore(c){c.xMult(1+(c.jk.c.x||0))},extEvent:'glassBroke'},
  stuntman:{n:'特技替身',r:2,cost:8,e:'🎬',g:'#6b3d3d',d:'+250 筹码,-2 手牌上限',
    passive:()=>({handSize:-2}),onHandScore(c){c.addChips(250)}},
  egg:{n:'蛋',r:2,cost:4,e:'🥚',g:'#c9c3a3',d:'回合结束时售价 +$3',
    onRoundEnd(c){c.jk.sellBonus=(c.jk.sellBonus||0)+3}},
  cloud9:{n:'九霄',r:2,cost:7,e:'☁️',g:'#7a8fa3',d:'回合结束时,手中每张 ♠ +$1',
    onRoundEnd(c){c.addMoney(c.held().filter(cd=>c.suit(cd)===0).length)}},
  rocket:{n:'火箭',r:2,cost:5,e:'🚀',g:'#8f4f3d',d:'回合结束时获得奖励(初始 $1,每击败一次 Boss +$2)',
    onRoundEnd(c){c.addMoney(c.jk.c.pay||1)}},extRocket:true,
  popcorn:{n:'爆米花',r:2,cost:5,e:'🍿',g:'#c9a35d',d:'+20 多倍,每回合 -4(减到 0 自毁)',
    onHandScore(c){c.addMult(c.jk.c.mult||20)},onRoundEnd(c){c.jk.c.mult=(c.jk.c.mult||20)-4;if(c.jk.c.mult<=0)return{destroy:true}}},
  loyaltyCard:{n:'忠诚卡',r:2,cost:6,e:'💳',g:'#4f3d6b',d:'每第 6 手牌 ×4 多倍',
    perRound:['n'],onHandScore(c){c.jk.c.n=(c.jk.c.n||0)+1;if(c.jk.c.n%6===0)c.xMult(4)}},
  ramen:{n:'拉面',r:2,cost:5,e:'🍜',g:'#b8863d',d:'×2 多倍。每弃一张牌 -×0.01(最低 ×1)',
    onHandScore(c){c.xMult(Math.max(1,(c.jk.c.x||2)-0.01*(c.runStat('discarded'))))}},
  sword:{n:'断钢剑',r:2,cost:8,e:'⚔️',g:'#7a8fa3',d:'只打出 1 张牌时 ×3 多倍',
    onHandScore(c){if(c.played.length===1)c.xMult(3)}},

  /* ---------- 稀有 ---------- */
  duo:{n:'二人组',r:3,cost:8,e:'👯',g:'#8f2f45',d:'打出的牌含对子以上时 ×2 多倍',
    onHandScore(c){if(c.handRank()>=HAND_ORDER.indexOf('pair'))c.xMult(2)}},
  trio:{n:'三重奏',r:3,cost:8,e:'🎺',g:'#7a3d8f',d:'含三条以上时 ×3 多倍',
    onHandScore(c){if(c.handRank()>=HAND_ORDER.indexOf('three'))c.xMult(3)}},
  family:{n:'一家亲',r:3,cost:8,e:'👨‍👩‍👧‍👦',g:'#2f5d8f',d:'含四条以上时 ×4 多倍',
    onHandScore(c){if(c.handRank()>=HAND_ORDER.indexOf('four'))c.xMult(4)}},
  order:{n:'号令',r:3,cost:8,e:'📜',g:'#4f8f6b',d:'打出顺子类时 ×3 多倍',
    onHandScore(c){if(['straight','sflush'].includes(c.handType))c.xMult(3)}},
  tribe:{n:'部落',r:3,cost:8,e:'🪘',g:'#8f6b2f',d:'打出同花类时 ×2 多倍',
    onHandScore(c){if(['flush','sflush','fhouse','ffive'].includes(c.handType))c.xMult(2)}},
  blueprint:{n:'蓝图',r:3,cost:10,e:'📐',g:'#3d5d8f',d:'复制左侧小丑的能力',
    copyOf:'left'},
  brainstorm:{n:'头脑风暴',r:3,cost:10,e:'🧠',g:'#b05c8f',d:'复制最左侧小丑的能力',
    copyOf:'first'},
  bloodstone:{n:'血石',r:3,cost:9,e:'🩸',g:'#8f1f30',d:'每张计分的 ♥ 有 1/2 概率 ×1.5 多倍',
    onCardScore(c,cd){if(c.suit(cd)===1&&c.p(1,2))c.xMult(1.5)}},
  arrowhead:{n:'箭头',r:3,cost:9,e:'🏹',g:'#6b552f',d:'每张计分的 ♠ +50 筹码',
    onCardScore(c,cd){if(c.suit(cd)===0)c.addChips(50)}},
  cavendish:{n:'卡文迪什',r:3,cost:4,e:'🍌',g:'#a3b82f',d:'×3 多倍。回合结束 1/1000 概率被吃掉',
    onHandScore(c){c.xMult(3)},onRoundEnd(c){if(c.p(1,1000))return{destroy:true}}},
  mrBones:{n:'骨先生',r:3,cost:5,e:'💀',g:'#c9c3b8',d:'输掉回合但分数达目标 25% 时,继续本回合(每个盲注一次)',
    flags:()=>({secondChance:true})},
  medieval:{n:'中世纪',r:3,cost:8,e:'🤴',g:'#5d4f6b',d:'每张计分的人头牌 ×2 多倍',
    onCardScore(c,cd){if(c.isFace(cd))c.xMult(2)}},
  obelisk:{n:'方尖碑',r:3,cost:10,e:'🗿',g:'#4a4a55',d:'×1 多倍。连续每打一手「非最常打出的牌型」+×0.2',
    onHandScore(c){if(c.handType!==c.mostPlayed())c.jk.c.x=(c.jk.c.x||1)+0.2;else c.jk.c.x=1;c.xMult(c.jk.c.x)}},
  ritual:{n:'祭祀面具',r:3,cost:9,e:'🎭',g:'#6b3d55',d:'打出的每张人头牌计分时,+12 多倍但 - $1',
    onCardScore(c,cd){if(c.isFace(cd)){c.addMult(12);c.addMoney(-1)}}},
  luckyDraw:{n:'幸运抽奖',r:3,cost:7,e:'🎰',g:'#2f6b55',d:'计分牌有 1/4 概率 +20 多倍',
    onCardScore(c){if(c.p(1,4))c.addMult(20)}},

  /* ---------- 传说(仅「灵魂」光谱牌产出) ---------- */
  triboulet:{n:'血腥特里波',r:4,cost:20,e:'👑',g:'#8f1f3d',d:'每张计分的 K 或 Q ×2 多倍',
    onCardScore(c,cd){if(c.rank(cd)===13||c.rank(cd)===12)c.xMult(2)}},
  yorick:{n:'约里克',r:4,cost:20,e:'⚰️',g:'#4a3d55',d:'×1 多倍。每弃满 10 张牌 +×0.1',
    onHandScore(c){c.xMult((c.jk.c.x||1))},extEvent:'discardMilestone'},
  chicot:{n:'奇科特',r:4,cost:20,e:'🎪',g:'#2f3d55',d:'无视 Boss 盲注的效果',flags:()=>({ignoreBoss:true})},
  perkeo:{n:'佩尔科',r:4,cost:20,e:'🧞',g:'#3d2f55',d:'离开商店时,随机复制一张消耗牌(负片版)',
    flags:()=>({perkeo:true})},
  canio:{n:'卡尼奥',r:4,cost:20,e:'🕹️',g:'#2f556b',d:'每有一张人头牌被摧毁,永久 +1 多倍',
    onHandScore(c){c.addMult(c.jk.c.mult||0)},extEvent:'faceDestroyed'},
};

/* ============================================================
   塔罗牌 ×22  sel:需从手牌选取的张数(0=直接用) target:'joker'=选小丑
   use 的 ctx:mkTarot/mkPlanet/mkJoker/mkSpectral 生成消耗牌/小丑、
   addToDeck/destroy/enh/setEd/money 等由引擎提供
   ============================================================ */
const TAROTS = {
  fool:{n:'愚者',e:'🃏',d:'复制本次冒险中上一张使用过的塔罗或星球牌',sel:0,
    use(c){if(!c.G.lastConsumable)return false;c.spawnConsumable(c.G.lastConsumable);return true}},
  magician:{n:'魔术师',e:'🎩',d:'将 2 张选中的牌强化为「幸运卡」',sel:2,
    use(c){c.sel.forEach(x=>c.enh(x,'lucky'));return true}},
  priestess:{n:'女祭司',e:'🌙',d:'生成 2 张随机星球牌',sel:0,
    use(c){c.mkPlanet();c.mkPlanet();return true}},
  empress:{n:'皇后',e:'👑',d:'将 2 张选中的牌强化为「多倍卡」',sel:2,
    use(c){c.sel.forEach(x=>c.enh(x,'mult'));return true}},
  emperor:{n:'皇帝',e:'🏛️',d:'生成 2 张随机塔罗牌',sel:0,
    use(c){c.mkTarot();c.mkTarot();return true}},
  hierophant:{n:'教皇',e:'📕',d:'将 2 张选中的牌强化为「奖励卡」',sel:2,
    use(c){c.sel.forEach(x=>c.enh(x,'bonus'));return true}},
  lovers:{n:'恋人',e:'💞',d:'将 1 张选中的牌强化为「百搭卡」',sel:1,
    use(c){c.enh(c.sel[0],'wild');return true}},
  chariot:{n:'战车',e:'🛡️',d:'将 1 张选中的牌强化为「钢铁卡」',sel:1,
    use(c){c.enh(c.sel[0],'steel');return true}},
  justice:{n:'正义',e:'⚖️',d:'将 1 张选中的牌强化为「玻璃卡」',sel:1,
    use(c){c.enh(c.sel[0],'glass');return true}},
  hermit:{n:'隐者',e:'🏮',d:'金钱翻倍(最多 +$20)',sel:0,
    use(c){const add=Math.min(20,Math.max(0,c.G.money));if(add<=0)return false;c.money(add);return true}},
  wheel:{n:'命运之轮',e:'☸️',d:'1/4 概率给 1 张小丑加上版本(箔面/全息/彩宝)',sel:0,target:'joker',
    use(c){if(!c.p(1,4))return 'miss';const ed=c.pick(['foil','holo','poly']);c.edJoker(c.target,ed);return true}},
  strength:{n:'力量',e:'💪',d:'将 1 张选中的牌点数 +1(A 变 2)',sel:1,
    use(c){const cd=c.sel[0];cd.rank=cd.rank>=14?2:cd.rank+1;cd.enh=null;cd.seal=null;return true}},
  hanged:{n:'倒吊人',e:'🪢',d:'摧毁 2 张选中的牌',sel:2,
    use(c){c.sel.forEach(x=>c.destroy(x));return true}},
  death:{n:'死神',e:'☠️',d:'把左侧选中的牌复制到右侧选中牌上(点数与花色)',sel:2,
    use(c){const[a,b]=c.sel;b.rank=a.rank;b.suit=a.suit;b.enh=a.enh;b.seal=a.seal;c.notifyAdd();return true}},
  temperance:{n:'节欲',e:'🏺',d:'获得等同小丑总售价的金钱(最多 $50)',sel:0,
    use(c){const v=c.totalSellValue();if(v<=0)return false;c.money(Math.min(50,v));return true}},
  devil:{n:'恶魔',e:'😈',d:'将 1 张选中的牌强化为「黄金卡」',sel:1,
    use(c){c.enh(c.sel[0],'gold');return true}},
  tower:{n:'塔',e:'🗼',d:'将 1 张选中的牌强化为「石头卡」',sel:1,
    use(c){c.enh(c.sel[0],'stone');return true}},
  star:{n:'星星',e:'⭐',d:'将 3 张选中的牌花色变为 ♥',sel:3,
    use(c){c.sel.forEach(x=>c.toSuit(x,1));return true}},
  moon:{n:'月亮',e:'🌜',d:'将 3 张选中的牌花色变为 ♣',sel:3,
    use(c){c.sel.forEach(x=>c.toSuit(x,3));return true}},
  sun:{n:'太阳',e:'☀️',d:'将 3 张选中的牌花色变为 ♦',sel:3,
    use(c){c.sel.forEach(x=>c.toSuit(x,2));return true}},
  world:{n:'世界',e:'🌍',d:'将 3 张选中的牌花色变为 ♠',sel:3,
    use(c){c.sel.forEach(x=>c.toSuit(x,0));return true}},
  judgement:{n:'审判',e:'📯',d:'生成一张随机小丑(需要空位)',sel:0,
    use(c){return c.mkJoker()}},
};

/* ============================================================
   星球牌 ×12(升牌型等级)
   ============================================================ */
const PLANETS = {};
Object.keys(HANDS).forEach(h=>{const p=HANDS[h].planet;PLANETS[p]={n:{pluto:'冥王星',mercury:'水星',uranus:'天王星',venus:'金星',saturn:'土星',jupiter:'木星',earth:'地球',mars:'火星',neptune:'海王星',planetx:'行星X',ceres:'谷神星',eris:'阋神星'}[p],e:'🪐',hand:h,d:'升级「'+HANDS[h].n+'」:+'+HANDS[h].lv[0]+' 筹码 +'+HANDS[h].lv[1]+' 多倍'};});

/* ============================================================
   光谱牌 ×9(原创效果,稀有消耗牌)
   ============================================================ */
const SPECTRALS = {
  soul:{n:'灵魂',e:'👻',d:'生成一张传说小丑(需要空位)',sel:0,
    use(c){return c.mkJoker('legend')}},
  vision:{n:'灵视',e:'🔮',d:'随机一种牌型升 3 级',sel:0,
    use(c){c.levelUp(c.pick(Object.keys(HANDS)),3);return true}},
  devour:{n:'噬魂',e:'🫦',d:'吞噬 1 张随机手牌,随机小丑永久 +50 筹码',sel:0,
    use(c){if(!c.G.hand.length)return false;const cd=c.pick(c.G.hand);c.destroy(cd);const j=c.pick(c.G.jokers);if(j){j.c.chips=(j.c.chips||0)+50;c.toastJoker(j,'+50筹码')}return true}},
  purify:{n:'净化',e:'🧿',d:'清除手中所有强化、版本与封印,每张 +$1',sel:0,
    use(c){let n=0;c.G.hand.forEach(x=>{if(x.enh||x.seal){x.enh=null;x.seal=null;n++}});if(!n)return false;c.money(n);return true}},
  mirror:{n:'镜像',e:'🪞',d:'将 1 张选中的牌复制并加入牌组',sel:1,
    use(c){c.addToDeck({...c.sel[0]});return true}},
  sacrifice:{n:'献祭',e:'🔥',d:'摧毁当前所有手牌,每张 +$2',sel:0,
    use(c){const n=c.G.hand.length;if(!n)return false;c.G.hand.forEach(x=>c.destroy(x));c.money(n*2);return true}},
  curse:{n:'诅咒',e:'🕸️',d:'随机 1 张手牌变为「玻璃卡」并获得红封印',sel:0,
    use(c){if(!c.G.hand.length)return false;const cd=c.pick(c.G.hand);cd.enh='glass';cd.seal='red';return true}},
  blackhole:{n:'黑洞',e:'🕳️',d:'所有牌型升 1 级',sel:0,
    use(c){Object.keys(HANDS).forEach(h=>c.levelUp(h,1));return true}},
  revelation:{n:'显圣',e:'😇',d:'随机 1 张小丑获得随机版本(箔面/全息/彩宝)',sel:0,
    use(c){const js=c.G.jokers.filter(j=>!j.ed);if(!js.length)return false;c.edJoker(c.pick(js),c.pick(['foil','holo','poly']));return true}},
};

/* ============================================================
   代金券 ×32(成对:买基础后解锁进阶版,均 $10)
   passive 字段在 recalcStats 汇总
   ============================================================ */
const VOUCHERS = {
  overstock:{n:'超量供货',e:'📦',d:'商店卡牌 +1 格',passive:()=>({shopSlots:1}),up:'overstock2'},
  overstock2:{n:'超量供货+',e:'📦',d:'商店卡牌再 +1 格',passive:()=>({shopSlots:1})},
  clearance:{n:'清仓大甩卖',e:'🏷️',d:'商店内所有商品 75 折',passive:()=>({discount:.75}),up:'clearance2'},
  clearance2:{n:'清仓大甩卖+',e:'🏷️',d:'商店内所有商品 5 折',passive:()=>({discount:.5})},
  hone:{n:'打磨',e:'✨',d:'箔面/全息/彩宝出现率 ×2',passive:()=>({edRate:2}),up:'hone2'},
  hone2:{n:'打磨+',e:'✨',d:'箔面/全息/彩宝出现率 ×4',passive:()=>({edRate:4})},
  rerollS:{n:'重掷盈余',e:'🔁',d:'商店重掷起价 -$2',passive:()=>({rerollOff:2}),up:'rerollS2'},
  rerollS2:{n:'重掷盈余+',e:'🔁',d:'商店重掷起价再 -$2',passive:()=>({rerollOff:2})},
  crystalBall:{n:'水晶球',e:'🔮',d:'+1 消耗牌槽位',passive:()=>({consumableSlots:1}),up:'omenGlobe'},
  omenGlobe:{n:'预言之球',e:'🔮',d:'塔罗卡包里也可能出现光谱牌',flags:()=>({omenGlobe:true})},
  telescope:{n:'望远镜',e:'🔭',d:'星球卡包必含最常打出的牌型',flags:()=>({telescope:true}),up:'observatory'},
  observatory:{n:'天文台',e:'🔭',d:'手上的每张星球牌为其牌型 +×1.5 多倍',flags:()=>({observatory:true})},
  grabber:{n:'夺取者',e:'🤲',d:'每回合 +1 出牌机会',passive:()=>({hands:1}),up:'nachoTong'},
  nachoTong:{n:'玉米脆角',e:'🌽',d:'每回合再 +1 出牌机会',passive:()=>({hands:1})},
  wasteful:{n:'挥霍者',e:'💸',d:'每回合 +1 弃牌机会',passive:()=>({discards:1}),up:'recyclomancy'},
  recyclomancy:{n:'回收术',e:'♻️',d:'每回合再 +1 弃牌机会',passive:()=>({discards:1})},
  tarotM:{n:'塔罗商人',e:'🃏',d:'商店中塔罗牌出现率 ×2',passive:()=>({tarotRate:2}),up:'tarotT'},
  tarotT:{n:'塔罗大亨',e:'🃏',d:'商店中塔罗牌出现率 ×4',passive:()=>({tarotRate:2})},
  planetM:{n:'星球商人',e:'🪐',d:'商店中星球牌出现率 ×2',passive:()=>({planetRate:2}),up:'planetT'},
  planetT:{n:'星球大亨',e:'🪐',d:'商店中星球牌出现率 ×4',passive:()=>({planetRate:2})},
  seedMoney:{n:'种子基金',e:'🌱',d:'利息上限提升至 $10',passive:()=>({interestCap:10}),up:'moneyTree'},
  moneyTree:{n:'摇钱树',e:'🌳',d:'利息上限提升至 $20',passive:()=>({interestCap:10})},
  blank:{n:'空白券',e:'⬜',d:'……什么用都没有(真的)',up:'antimatter'},
  antimatter:{n:'反物质',e:'⚫',d:'+1 小丑槽位',passive:()=>({jokerSlots:1})},
  magicTrick:{n:'魔术戏法',e:'🎩',d:'商店出售扑克牌',flags:()=>({magicTrick:true}),up:'illusion'},
  illusion:{n:'幻术',e:'🐇',d:'商店扑克牌可能自带强化/版本/封印',flags:()=>({illusion:true})},
  hieroglyph:{n:'象形文字',e:'𓂀',d:'目标盲注 -1,但每回合 -1 出牌机会',passive:()=>({hands:-1,ante:-1}),up:'petroglyph'},
  petroglyph:{n:'岩刻文字',e:'𓆣',d:'目标盲注再 -1,但每回合 -1 弃牌机会',passive:()=>({discards:-1,ante:-1})},
  directors:{n:'导演剪辑',e:'🎬',d:'每个盲注可花 $10 重掷 Boss(一次)',flags:()=>({directorsCut:true}),up:'retcon'},
  retcon:{n:'追溯修改',e:'🎞️',d:'Boss 重掷不限次数',flags:()=>({directorsCut:true})},
  paintBrush:{n:'画笔',e:'🖌️',d:'+1 手牌上限',passive:()=>({handSize:1}),up:'palette'},
  palette:{n:'调色盘',e:'🎨',d:'再 +1 手牌上限',passive:()=>({handSize:1})},
};

/* ============================================================
   跳过标签 ×24(跳过小盲/大盲获得)
   now=true 表示领取时立即生效,否则存入 pendingTags 延迟到商店生效
   ============================================================ */
const TAGS = {
  uncommon:{n:'罕见标签',e:'🟢',d:'下一个商店出现一张免费罕见小丑',now:false},
  rare:{n:'稀有标签',e:'🔴',d:'下一个商店出现一张免费稀有小丑',now:false},
  negative:{n:'负片标签',e:'🔲',d:'下一个商店的小丑免费且变为负片',now:false},
  foil:{n:'箔面标签',e:'🥈',d:'下一个商店的小丑免费且变为箔面',now:false},
  holo:{n:'全息标签',e:'🥉',d:'下一个商店的小丑免费且变为全息',now:false},
  poly:{n:'彩宝标签',e:'🌈',d:'下一个商店的小丑免费且变为彩宝',now:false},
  investment:{n:'投资标签',e:'📈',d:'击败 Boss 盲注后 +$25',now:false},
  voucher:{n:'代金标签',e:'🎟️',d:'下一个商店 +1 张代金券',now:false},
  boss:{n:'Boss 标签',e:'👺',d:'立即重掷 Boss 盲注',now:true},
  charm:{n:'魅力标签',e:'🧿',d:'立即免费打开一个超级塔罗卡包',now:false},
  coupon:{n:'优惠券标签',e:'🎫',d:'下一个商店的卡牌与卡包全部免费',now:false},
  double:{n:'加倍标签',e:'✖️',d:'复制下一个领取的标签',now:false},
  juggle:{n:'杂耍标签',e:'🤹',d:'下一回合 +3 手牌上限',now:false},
  d6:{n:'D6 标签',e:'🎲',d:'下一个商店前 5 次重掷免费',now:false},
  speed:{n:'速度标签',e:'🏃',d:'获得 $5 ×本局已跳过的盲注数',now:true},
  standard:{n:'标准标签',e:'🂠',d:'立即免费打开一个超级标准卡包',now:false},
  meteor:{n:'流星标签',e:'☄️',d:'立即免费打开一个超级星球卡包',now:false},
  buffoon:{n:'小丑标签',e:'🎪',d:'立即免费打开一个超级小丑卡包',now:false},
  handy:{n:'顺手标签',e:'✋',d:'获得 $1 ×本局已打出的手牌数',now:true},
  garbage:{n:'垃圾标签',e:'🗑️',d:'获得 $1 ×本局剩余未用的弃牌数',now:true},
  ethereal:{n:'幽魂标签',e:'👁️',d:'立即免费打开一个光谱卡包',now:false},
  topup:{n:'补充标签',e:'➕',d:'生成至多 2 张常见小丑(需要空位)',now:true},
  orbital:{n:'轨道标签',e:'🛰️',d:'随机一种牌型升 3 级',now:true},
  ruby:{n:'红宝标签',e:'💎',d:'获得 $10',now:true},
};

/* ============================================================
   Boss 盲注 ×23 + 终局演出盲注 ×5
   mult:目标分数倍率 debuff(card):返true为禁用
   ============================================================ */
const BOSSES = {
  hook:{n:'铁钩',e:'🪝',mult:2,minAnte:1,d:'每打出一手牌,弃掉 2 张随机手牌',
    onPlayHand(G){G.pendingDiscardRandom=2}},
  ox:{n:'蛮牛',mult:2,minAnte:6,e:'🐂',d:'打出你最常使用的牌型会把金钱清零',
    onHandPlayed(G,ht,mph){if(ht===mph&&G.money>0){G.money=0;G.ev.push({t:'moneyZero'})}}},
  house:{n:'房屋',e:'🏠',mult:2,minAnte:2,d:'第一手抽到的牌全部背面朝上',
    onRoundStart(G){G.drawFacedownNext=G.handSize}},
  wall:{n:'高墙',e:'🧱',mult:4,minAnte:4,d:'分数要求特别巨大'},
  wheel:{n:'转轮',e:'☸️',mult:2,minAnte:2,d:'抽到的牌有 1/7 概率背面朝上',
    drawFacedown(G,c,r){return r.next()*7<1}},
  arm:{n:'铁臂',e:'💪',mult:2,minAnte:2,d:'打出的牌型等级永久 -1',
    onScoreStart(G,ht){levelUpHand(G,ht,-1);G.ev.push({t:'arm',hand:ht})}},
  club:{n:'梅花',e:'♣️',mult:2,minAnte:1,d:'所有 ♣ 被禁用',debuff:c=>c.suit===3},
  fish:{n:'渔夫',e:'🎣',mult:2,minAnte:2,d:'每打一手牌,之后抽到的牌背面朝上',
    onPlayHand(G){G.facedownMode=true}},
  psychic:{n:'灵媒',e:'🔮',mult:2,minAnte:1,d:'必须一次打出 5 张牌',flags:{mustPlay5:true}},
  goad:{n:'诱饵',e:'♠️',mult:2,minAnte:1,d:'所有 ♠ 被禁用',debuff:c=>c.suit===0},
  water:{n:'深水',e:'🌊',mult:2,minAnte:2,d:'本回合没有弃牌机会',flags:{zeroDiscards:true}},
  window:{n:'窗户',e:'🪟',mult:2,minAnte:1,d:'所有 ♦ 被禁用',debuff:c=>c.suit===2},
  manacle:{n:'镣铐',e:'⛓️',mult:2,minAnte:1,d:'-1 手牌上限',mod:{handSize:-1}},
  eye:{n:'眼睛',e:'👁️',mult:3,minAnte:3,d:'本回合不能重复打出相同牌型',flags:{noRepeatHands:true}},
  mouth:{n:'嘴巴',e:'👄',mult:2,minAnte:2,d:'本回合只能打出一种牌型',flags:{oneHandType:true}},
  plant:{n:'植物',e:'🪴',mult:2,minAnte:4,d:'所有人头牌被禁用',debuff:c=>c.rank>10},
  serpent:{n:'巨蟒',e:'🐍',mult:5,minAnte:5,d:'打出或弃牌后只抽 3 张牌',
    flags:{serpent:true}},
  pillar:{n:'石柱',e:'🏛️',mult:2,minAnte:1,d:'本盲注内之前打过的牌全部被禁用',
    debuffDynamic(G,c){return G.playedThisBlind.has(c.uid)}},
  needle:{n:'细针',e:'🪡',mult:1,minAnte:2,d:'只有 1 次出牌机会',mod:{hands:-9000,absHands:1}},
  head:{n:'头脑',e:'🧠',mult:2,minAnte:1,d:'所有 ♥ 被禁用',debuff:c=>c.suit===1},
  tooth:{n:'毒牙',e:'🦷',mult:3,minAnte:3,d:'每打出一张牌 -$1',
    onPlayHand(G,cards){G.money=Math.max(0,G.money-cards.length);G.ev.push({t:'tooth',n:cards.length})}},
  flint:{n:'火石',e:'🪨',mult:2,minAnte:2,d:'基础筹码与多倍减半',flags:{halveBase:true}},
  mark:{n:'标记',e:'📝',mult:2,minAnte:2,d:'人头牌抽到时背面朝上',
    drawFacedown(G,c){return c.rank>10}},
  /* --- 终局演出(Ante 8 / 16) --- */
  acorn:{n:'琥珀橡果',e:'🌰',mult:2,showdown:true,d:'所有小丑被翻面打乱',
    onRoundStart(G){G.jokersShuffled=true}},
  leaf:{n:'翠绿树叶',e:'🍃',mult:2,showdown:true,d:'所有牌被禁用,直到卖掉 1 张小丑',
    flags:{debuffAll:true}},
  heart:{n:'绯红之心',e:'💗',mult:2,showdown:true,d:'每手随机 1 张小丑被禁用',
    flags:{crimsonHeart:true}},
  bell:{n:'蔚蓝铃铛',e:'🔔',mult:2,showdown:true,d:'强制 1 张牌保持选中',
    flags:{ceruleanBell:true}},
  vessel:{n:'紫罗兰之船',e:'🚢',mult:6,showdown:true,d:'分数要求极其巨大'},
};
const NORMAL_BOSSES = Object.keys(BOSSES).filter(k=>!BOSSES[k].showdown);
const SHOWDOWN_BOSSES = Object.keys(BOSSES).filter(k=>BOSSES[k].showdown);

/* ============================================================
   牌背(牌组)×10 — unlock: 解锁条件描述, check(G全局存档)
   ============================================================ */
const DECKS = {
  red:{n:'赤红牌背',e:'🟥',d:'+1 每回合弃牌机会',mod:{discards:1}},
  blue:{n:'湛蓝牌背',e:'🟦',d:'+1 每回合手牌上限',mod:{handSize:1}},
  yellow:{n:'鎏金牌背',e:'🟨',d:'开局额外 +$10',mod:{money:10}},
  white:{n:'素白牌背',e:'⬜',d:'朴实无华,无任何效果',mod:{}},
  black:{n:'玄墨牌背',e:'⬛',d:'+1 小丑槽,但 -1 手牌上限、-1 弃牌机会',mod:{jokerSlots:1,handSize:-1,discards:-1}},
  magic:{n:'秘法牌背',e:'🔮',d:'开局自带「水晶球」代金券与一张「愚者」',mod:{startVoucher:'crystalBall',startConsumable:'fool'}},
  painted:{n:'彩绘画背',e:'🖼️',d:'+2 手牌上限,但 -1 小丑槽',mod:{handSize:2,jokerSlots:-1}},
  checkered:{n:'棋盘牌背',e:'🏁',d:'牌组只有 ♠ 与 ♥(各 26 张)',mod:{checkeredDeck:true}},
  anaglyph:{n:'浅浮雕背',e:'🟧',d:'每击败一次 Boss 获得 1 张「加倍标签」',mod:{anaglyph:true}},
  plasma:{n:'等离子背',e:'🟪',d:'分数要求 ×2;计分时筹码与多倍相加后取平均再平方',mod:{plasma:true,targetMult:2}},
};

/* ============================================================
   卡包(选项数/可选取数/价格)
   ============================================================ */
const PACKS = {
  standard:{n:'标准卡包',e:'🂠',cls:'pack-standard',kind:'playing',opts:3,picks:1,cost:4,d:'3 张扑克牌选 1 张'},
  standardM:{n:'超级标准卡包',e:'🂠',cls:'pack-standard',kind:'playing',opts:7,picks:1,cost:8,d:'7 张扑克牌选 1 张'},
  buffoon:{n:'小丑卡包',e:'🃏',cls:'pack-buffoon',kind:'joker',opts:2,picks:1,cost:6,d:'2 张小丑选 1 张'},
  buffoonM:{n:'超级小丑卡包',e:'🃏',cls:'pack-buffoon',kind:'joker',opts:4,picks:2,cost:8,d:'4 张小丑选 2 张'},
  arcana:{n:'塔罗卡包',e:'🔮',cls:'pack-arcana',kind:'tarot',opts:3,picks:1,cost:4,d:'3 张塔罗牌选 1 张'},
  arcanaM:{n:'超级塔罗卡包',e:'🔮',cls:'pack-arcana',kind:'tarot',opts:5,picks:1,cost:8,d:'5 张塔罗牌选 1 张'},
  celestial:{n:'星球卡包',e:'🪐',cls:'pack-celestial',kind:'planet',opts:3,picks:1,cost:4,d:'3 张星球牌选 1 张'},
  celestialM:{n:'超级星球卡包',e:'🪐',cls:'pack-celestial',kind:'planet',opts:5,picks:1,cost:8,d:'5 张星球牌选 1 张'},
  spectral:{n:'光谱卡包',e:'👁️',cls:'pack-spectral',kind:'spectral',opts:2,picks:1,cost:4,d:'2 张光谱牌选 1 张'},
};

/* ---------- 牌背解锁条件(读全局存档) ---------- */
function deckUnlocked(id,save){
  const w=save.wins||0,best=save.bestAnte||1;
  switch(id){
    case 'red':case 'yellow':case 'white':return true;
    case 'blue':return best>=2;
    case 'black':return best>=4;
    case 'magic':return best>=3;
    case 'painted':return best>=5;
    case 'checkered':return w>=1;
    case 'anaglyph':return w>=2;
    case 'plasma':return w>=3;
  }
  return false;
}
function deckUnlockHint(id){
  switch(id){
    case 'blue':return '达到 Ante 2 解锁';case 'magic':return '达到 Ante 3 解锁';
    case 'black':return '达到 Ante 4 解锁';case 'painted':return '达到 Ante 5 解锁';
    case 'checkered':return '通关一次解锁';case 'anaglyph':return '通关 2 次解锁';
    case 'plasma':return '通关 3 次解锁';
  }
  return '';
}
