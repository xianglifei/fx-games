// 华容道关卡数据
// 共 33 关，难度分 5 档；最优步数经本项目 0-1 BFS 求解器复核，
// 与公认值一致（横刀立马 81、指挥若定 70 等）。
// grid 为 5x4 字符网格：'@' 空格；同字符的格子属于同一棋子。
// 棋子形状在加载时推断：2x2=曹操，1x2/2x1=大将，1x1=小卒。
// 布局数据来源：fayaa.com 华容道合集（经 SimonHung/Klotski 整理），公有领域经典布局。
window.KLOTSKI_LEVELS = [
  {
    "id": "qian-hu-hou-yong",
    "name": "前呼后拥",
    "tier": 1,
    "tierName": "入门",
    "minSteps": 22,
    "grid": "NOAA/BBAA/CCDD/EEFF/@@PQ"
  },
  {
    "id": "bi-yi-heng-kong",
    "name": "比翼横空",
    "tier": 1,
    "tierName": "入门",
    "minSteps": 28,
    "grid": "BBAA/CCAA/DDEE/N@OH/P@QH"
  },
  {
    "id": "jie-zu-xian-deng",
    "name": "捷足先登",
    "tier": 1,
    "tierName": "入门",
    "minSteps": 32,
    "grid": "NAAO/PAAQ/@BB@/HIJK/HIJK"
  },
  {
    "id": "bing-lin-cao-ying",
    "name": "兵临曹营",
    "tier": 1,
    "tierName": "入门",
    "minSteps": 34,
    "grid": "NAAO/PAAQ/HBBI/HJKI/@JK@"
  },
  {
    "id": "wu-jiang-bi-gong",
    "name": "五将逼宫",
    "tier": 1,
    "tierName": "入门",
    "minSteps": 36,
    "grid": "BBCC/HAAI/HAAI/NDDO/P@@Q"
  },
  {
    "id": "yi-lu-shun-feng",
    "name": "一路顺风",
    "tier": 1,
    "tierName": "入门",
    "minSteps": 39,
    "grid": "HAAN/HAAO/IBBJ/IPKJ/@QK@"
  },
  {
    "id": "si-jiang-lian-guan",
    "name": "四将连关",
    "tier": 2,
    "tierName": "初级",
    "minSteps": 39,
    "grid": "AABB/AACC/HIDD/HINO/P@@Q"
  },
  {
    "id": "du-sai-yao-dao",
    "name": "堵塞要道",
    "tier": 2,
    "tierName": "初级",
    "minSteps": 40,
    "grid": "NAAO/PAAQ/HIBB/HICC/@DD@"
  },
  {
    "id": "yu-sheng-xi-li",
    "name": "雨声淅沥",
    "tier": 2,
    "tierName": "初级",
    "minSteps": 47,
    "grid": "HAAN/HAAO/IBBJ/IK@J/PK@Q"
  },
  {
    "id": "bei-shui-lie-zhen",
    "name": "背水列阵",
    "tier": 2,
    "tierName": "初级",
    "minSteps": 54,
    "grid": "HBBI/HNOI/@AA@/PAAQ/CCDD"
  },
  {
    "id": "zuo-you-bu-bing",
    "name": "左右布兵",
    "tier": 2,
    "tierName": "初级",
    "minSteps": 54,
    "grid": "NAAO/PAAQ/HIJK/HIJK/@BB@"
  },
  {
    "id": "yi-lu-jin-jun",
    "name": "一路进军",
    "tier": 2,
    "tierName": "初级",
    "minSteps": 58,
    "grid": "HAAN/HAAO/IJKP/IJKQ/@BB@"
  },
  {
    "id": "qi-tou-bing-jin",
    "name": "齐头并进",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 60,
    "grid": "HAAI/HAAI/NOPQ/JBBK/J@@K"
  },
  {
    "id": "wei-er-bu-jian",
    "name": "围而不歼",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 62,
    "grid": "HAAN/HAAO/IBBP/IJKQ/@JK@"
  },
  {
    "id": "cha-chi-nan-fei",
    "name": "插翅难飞",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 62,
    "grid": "HAAN/HAAO/BBPQ/ICCJ/I@@J"
  },
  {
    "id": "san-jun-lian-fang",
    "name": "三军联防",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 65,
    "grid": "AAHI/AAHI/BBCC/NDDO/P@@Q"
  },
  {
    "id": "jing-di-zhi-wa",
    "name": "井底之蛙",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 68,
    "grid": "NBBO/HAAI/HAAI/PCCQ/@DD@"
  },
  {
    "id": "zhi-hui-ruo-ding",
    "name": "指挥若定",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 70,
    "grid": "HAAI/HAAI/NBBO/JPQK/J@@K"
  },
  {
    "id": "tao-hua-yuan-zhong",
    "name": "桃花园中",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 70,
    "grid": "NAAO/HAAI/HJKI/PJKQ/@BB@"
  },
  {
    "id": "jiang-yong-cao-ying",
    "name": "将拥曹营",
    "tier": 3,
    "tierName": "中级",
    "minSteps": 72,
    "grid": "@AA@/HAAI/HJKI/NJKO/BBPQ"
  },
  {
    "id": "bing-fen-san-lu",
    "name": "兵分三路",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 72,
    "grid": "NAAO/HAAI/HBBI/JPQK/J@@K"
  },
  {
    "id": "jia-dao-cang-bing",
    "name": "夹道藏兵",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 75,
    "grid": "AANH/AAOH/BBCC/DDEE/P@@Q"
  },
  {
    "id": "si-lu-jin-bing",
    "name": "四路进兵",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 77,
    "grid": "NAAO/PAAQ/H@BB/H@CC/DDEE"
  },
  {
    "id": "shui-xie-bu-tong",
    "name": "水泄不通",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 79,
    "grid": "HAAN/HAAO/BBCC/DDEE/P@@Q"
  },
  {
    "id": "heng-dao-li-ma",
    "name": "横刀立马",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 81,
    "grid": "HAAI/HAAI/JBBK/JNOK/P@@Q"
  },
  {
    "id": "yun-zhe-wu-zhang",
    "name": "云遮雾障",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 81,
    "grid": "HAAI/HAAI/JBBN/JCCO/P@@Q"
  },
  {
    "id": "shou-kou-ru-ping",
    "name": "守口如瓶",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 81,
    "grid": "HAAI/HAAI/NJ@O/PJ@Q/BBCC"
  },
  {
    "id": "heng-ma-dang-guan",
    "name": "横马当关",
    "tier": 4,
    "tierName": "高级",
    "minSteps": 83,
    "grid": "HAAI/HAAI/BBCC/NJ@O/PJ@Q"
  },
  {
    "id": "bing-dang-jiang-zu",
    "name": "兵挡将阻",
    "tier": 5,
    "tierName": "大师",
    "minSteps": 87,
    "grid": "NAAH/OAAH/IBBP/ICCQ/@DD@"
  },
  {
    "id": "ceng-ceng-she-fang",
    "name": "层层设防",
    "tier": 5,
    "tierName": "大师",
    "minSteps": 102,
    "grid": "HAAI/HAAI/NBBO/PCCQ/@DD@"
  },
  {
    "id": "weng-zhong-zhi-bie",
    "name": "瓮中之鳖",
    "tier": 5,
    "tierName": "大师",
    "minSteps": 103,
    "grid": "HAAI/HAAI/BBCC/NDDO/P@@Q"
  },
  {
    "id": "xiao-yan-chu-chao",
    "name": "小燕出巢",
    "tier": 5,
    "tierName": "大师",
    "minSteps": 103,
    "grid": "HAAI/HAAI/BBCC/NDDO/P@@Q"
  },
  {
    "id": "feng-hui-lu-zhuan",
    "name": "峰回路转",
    "tier": 5,
    "tierName": "大师",
    "minSteps": 138,
    "grid": "NOPH/AAIH/AAIJ/@BBJ/@QCC"
  }
];
