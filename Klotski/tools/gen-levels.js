// 从 verify-results.json 生成游戏关卡数据 js/levels.js
const fs = require('fs');
const results = require('./verify-results.json');

// 精选 33 个经典名局，按难度分 5 档；简体名 / 拼音 id
const CURATED = [
  // 入门 ★
  ['前呼後擁', '前呼后拥', 'qian-hu-hou-yong', 1],
  ['比翼橫空', '比翼横空', 'bi-yi-heng-kong', 1],
  ['捷足先登', '捷足先登', 'jie-zu-xian-deng', 1],
  ['兵臨曹營', '兵临曹营', 'bing-lin-cao-ying', 1],
  ['五將逼宮', '五将逼宫', 'wu-jiang-bi-gong', 1],
  ['一路順風', '一路顺风', 'yi-lu-shun-feng', 1],
  // 初级 ★★
  ['四將連關', '四将连关', 'si-jiang-lian-guan', 2],
  ['堵塞要道', '堵塞要道', 'du-sai-yao-dao', 2],
  ['雨聲淅瀝', '雨声淅沥', 'yu-sheng-xi-li', 2],
  ['背水列陣', '背水列阵', 'bei-shui-lie-zhen', 2],
  ['左右佈兵', '左右布兵', 'zuo-you-bu-bing', 2],
  ['一路進軍', '一路进军', 'yi-lu-jin-jun', 2],
  // 中级 ★★★
  ['齊頭並進', '齐头并进', 'qi-tou-bing-jin', 3],
  ['圍而不殲', '围而不歼', 'wei-er-bu-jian', 3],
  ['插翅難飛', '插翅难飞', 'cha-chi-nan-fei', 3],
  ['三軍聯防', '三军联防', 'san-jun-lian-fang', 3],
  ['井底之蛙', '井底之蛙', 'jing-di-zhi-wa', 3],
  ['指揮若定', '指挥若定', 'zhi-hui-ruo-ding', 3],
  ['桃花園中', '桃花园中', 'tao-hua-yuan-zhong', 3],
  ['將擁曹營', '将拥曹营', 'jiang-yong-cao-ying', 3],
  // 高级 ★★★★
  ['兵分三路', '兵分三路', 'bing-fen-san-lu', 4],
  ['夾道藏兵', '夹道藏兵', 'jia-dao-cang-bing', 4],
  ['四路進兵', '四路进兵', 'si-lu-jin-bing', 4],
  ['水泄不通', '水泄不通', 'shui-xie-bu-tong', 4],
  ['橫刀立馬', '横刀立马', 'heng-dao-li-ma', 4],
  ['雲遮霧障', '云遮雾障', 'yun-zhe-wu-zhang', 4],
  ['守口如瓶1', '守口如瓶', 'shou-kou-ru-ping', 4],
  ['橫馬當關', '横马当关', 'heng-ma-dang-guan', 4],
  // 大师 ★★★★★
  ['兵擋將阻', '兵挡将阻', 'bing-dang-jiang-zu', 5],
  ['層層設防1', '层层设防', 'ceng-ceng-she-fang', 5],
  ['甕中之鼈', '瓮中之鳖', 'weng-zhong-zhi-bie', 5],
  ['小燕出巢', '小燕出巢', 'xiao-yan-chu-chao', 5],
  ['峰迴路轉', '峰回路转', 'feng-hui-lu-zhuan', 5],
];

const TIER_NAMES = { 1: '入门', 2: '初级', 3: '中级', 4: '高级', 5: '大师' };

const levels = CURATED.map(([trad, simp, id, tier]) => {
  const r = results.find(e => e.name === trad);
  if (!r) throw new Error('未找到布局: ' + trad);
  if (!r.ok) throw new Error(`布局 ${trad} 步数验证失败: 公认=${r.mini} 计算=${r.computed}`);
  return {
    id,
    name: simp,
    tier,
    tierName: TIER_NAMES[tier],
    minSteps: r.mini, // 已由本项目求解器复核，与公认值一致
    grid: r.grid,     // 5 行 x 4 列，'/' 分隔；'@' 为空格，同字符同棋子
  };
});

const banner = `// 华容道关卡数据
// 共 ${levels.length} 关，难度分 5 档；最优步数经本项目 0-1 BFS 求解器复核，
// 与公认值一致（横刀立马 81、指挥若定 70 等）。
// grid 为 5x4 字符网格：'@' 空格；同字符的格子属于同一棋子。
// 棋子形状在加载时推断：2x2=曹操，1x2/2x1=大将，1x1=小卒。
// 布局数据来源：fayaa.com 华容道合集（经 SimonHung/Klotski 整理），公有领域经典布局。
window.KLOTSKI_LEVELS = ${JSON.stringify(levels, null, 2)};
`;

fs.mkdirSync(__dirname + '/../js', { recursive: true });
fs.writeFileSync(__dirname + '/../js/levels.js', banner);
console.log(`已生成 js/levels.js，共 ${levels.length} 关`);
for (const l of levels) console.log(`  ${'★'.repeat(l.tier)} ${l.name} 最少${l.minSteps}步`);
