// 测量各参数组合的生成通过率与耗时，用于校准难度曲线
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\*__CORE_START__\*\/([\s\S]*?)\/\*__CORE_END__\*\//);
const core = new Function(`${m[1]}; return {genPuzzle, paramsFor};`)();

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const combos = [
  [4, 0, 2], [4, 0, 1], [5, 0, 2], [5, 0, 1],
  [6, 0, 2], [6, 0, 1], [7, 0, 1],
  [5, 1, 2], [5, 1, 1], [6, 1, 1], [6, 1, 2], [7, 1, 0], [7, 1, 1], [7, 1, 2],
  [6, 2, 1], [7, 2, 1],
  [8, 1, 1], [8, 1, 2], [8, 1, 3], [8, 2, 2], [8, 2, 3], [8, 3, 3],
];

console.log('trees spacing K | 尝试数 | 成功 | 通过率 | 平均耗时/次 | 最快命中');
for (const [trees, spacing, K] of combos) {
  const rng = mulberry32(1000 + trees * 97 + spacing * 13 + K);
  const TRIES = 300, PER = 40; // PER 次尝试算一轮
  let hits = 0, rounds = 0, totalMs = 0, triesUsed = 0;
  for (let r = 0; r < TRIES / PER; r++) {
    const t0 = performance.now();
    const pz = core.genPuzzle({ trees, doubles: K, spacing }, rng, PER, 60000);
    totalMs += performance.now() - t0;
    if (pz) { hits++; triesUsed += PER; } else { triesUsed += PER; }
    rounds++;
  }
  const rate = (hits / rounds * 100).toFixed(1);
  const avg = (totalMs / rounds).toFixed(2);
  console.log(`  ${trees}     ${spacing}     ${K}  |  ${PER}   |  ${hits}/${rounds}  |  ${rate}%  |  ${avg}ms`);
}

console.log('\n当前难度曲线抽样:');
for (const tier of ['easy', 'normal', 'hard', 'master', 'legend']) {
  for (const level of [1, 10, 20, 40, 65]) {
    const rng = mulberry32(9999 + level);
    const t0 = performance.now();
    const pz = core.genPuzzle(core.paramsFor(tier, level), rng, 2500, 5000);
    console.log(`  ${tier} L${level}: ${pz ? 'OK ' + (performance.now() - t0).toFixed(0) + 'ms, 双帐篷=' + pz.doubles : '失败 (' + (performance.now() - t0).toFixed(0) + 'ms)'}`);
  }
}
