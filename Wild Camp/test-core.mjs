// 从 index.html 抽出核心算法块（/*__CORE_START__*/ ... /*__CORE_END__*/），
// 对"实际发布的代码"做正确性与性能测试。
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/\/\*__CORE_START__\*\/([\s\S]*?)\/\*__CORE_END__\*\//);
if (!m) { console.error('未找到核心代码块'); process.exit(1); }

const core = new Function(`${m[1]}; return {N, NB4, NB8, buildOptions, solve, matchable, solutionValid, countsFromSolution, sampleTrees, genPuzzle, paramsFor};`)();
const { N, NB4, NB8, buildOptions, matchable, solutionValid, genPuzzle, paramsFor } = core;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL:', msg); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// —— 独立实现的朴素解计数器（固定树顺序、不用 MRV，交叉验证唯一性）——
function naiveCount(trees, K, cap = 2) {
  const opts = buildOptions(trees);
  const occ = new Uint8Array(N * N);
  let count = 0, stop = false;
  const can = cells => cells.every(([r, c]) => {
    const i = r * N + c;
    if (occ[i]) return false;
    return NB8[i].every(([a, b]) => !occ[a * N + b]);
  });
  function dfs(k, dbl) {
    if (stop) return;
    if (k === trees.length) {
      if (dbl === K) { count++; if (count >= cap) stop = true; }
      return;
    }
    if (dbl > K || dbl + (trees.length - k) < K) return;
    for (const o of opts[k]) {
      const nd = dbl + (o.length === 2 ? 1 : 0);
      if (nd > K) continue;
      if (!can(o)) continue;
      for (const [r, c] of o) occ[r * N + c] = 1;
      dfs(k + 1, nd);
      for (const [r, c] of o) occ[r * N + c] = 0;
      if (stop) return;
    }
  }
  dfs(0, 0);
  return count;
}

// ---------- 1. 基础正确性 ----------
console.log('== 基础正确性 ==');
ok(matchable([[0, 0]], [[[0, 1]]]) === true, '单树单帐篷可匹配');
ok(matchable([[0, 0], [5, 5]], [[[0, 1]], [[0, 1]]]) === false, '两顶帐篷抢同一棵树 → 不可匹配');
ok(matchable([[0, 0], [0, 2]], [[[1, 0]], [[1, 2]]]) === true, '双树双帐篷可匹配');
ok(solutionValid([[0, 0]], [[[0, 1]]]) === true, '合法单帐篷解');
ok(solutionValid([[0, 0]], [[[1, 1]]]) === false, '不挨树的帐篷 → 非法');
ok(solutionValid([[0, 0], [3, 3]], [[[0, 1]], [[1, 1]]]) === false, '帐篷斜相邻 → 非法');
ok(solutionValid([[0, 0]], [[[0, 1], [0, 2]]]) === false, '双帐篷另一格不挨任何树 → 非法');
ok(solutionValid([[0, 0], [2, 1]], [[[0, 1], [1, 1]], [[3, 1]]]) === true, '双帐篷两格各挨一棵树 → 合法');
ok(solutionValid([[0, 0], [2, 1]], [[[0, 1], [1, 1]], [[2, 0]]]) === false, '帐篷挨到双帐篷 → 非法');

// ---------- 2. 全难度生成 + 独立唯一性交叉验证 ----------
console.log('== 生成测试（各难度 × 关卡曲线） ==');
const rng = mulberry32(20260920);
let maxGenMs = 0, totalGen = 0, worst = null, tAll = Date.now();

for (const tier of ['easy', 'normal', 'hard', 'master', 'legend']) {
  for (let level = 1; level <= 24; level++) {
    const params = paramsFor(tier, level);
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      const pz = genPuzzle(params, rng);
      const ms = performance.now() - t0;
      totalGen++;
      if (ms > maxGenMs) { maxGenMs = ms; worst = `${tier} L${level}`; }
      ok(pz !== null, `${tier} L${level}: 生成失败`);
      if (!pz) continue;
      ok(pz.trees.length === params.trees, `${tier} L${level}: 树数量不符`);
      ok(pz.doubles === params.doubles && pz.singles === params.trees - params.doubles,
        `${tier} L${level}: 库存不符 (双${pz.doubles}/单${pz.singles})`);
      ok(solutionValid(pz.trees, pz.solution), `${tier} L${level}: 解本身非法`);
      const { rc, cc } = core.countsFromSolution(pz.solution);
      ok(rc.every((v, i) => v === pz.rc[i]) && cc.every((v, i) => v === pz.cc[i]),
        `${tier} L${level}: 行列计数不符`);
      // 库存空间内唯一性（独立实现交叉验证）
      ok(naiveCount(pz.trees, params.doubles, 2) === 1, `${tier} L${level}: 独立计数发现解不唯一`);
      // 解里双帐篷数量确实等于 K
      const dblInSol = pz.solution.filter(o => o.length === 2).length;
      ok(dblInSol === params.doubles, `${tier} L${level}: 解中双帐篷 ${dblInSol} != ${params.doubles}`);
    }
  }
  console.log(`  ${tier} 完成`);
}
console.log(`共生成 ${totalGen} 关，总耗时 ${Date.now() - tAll}ms，单关最慢 ${maxGenMs.toFixed(1)}ms（${worst}）`);

// ---------- 3. 大师高关卡压力抽样 ----------
console.log('== 大师压力抽样（L30 × 40 关） ==');
{
  const t0 = performance.now();
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const pz = genPuzzle(paramsFor('master', 30), rng);
    ok(pz !== null && solutionValid(pz.trees, pz.solution) && naiveCount(pz.trees, pz.doubles, 2) === 1,
      '大师抽样生成/校验失败');
    if (pz) n++;
  }
  console.log(`40 关大师题，成功 ${n}，平均 ${((performance.now() - t0) / 40).toFixed(1)}ms/关`);
}

// ---------- 3b. 传奇压力抽样（8 树 + 双帐，L30 与 L65 各 20 关） ----------
console.log('== 传奇压力抽样（L30 × 20 关 + L65 × 20 关） ==');
{
  for (const lv of [30, 65]) {
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 20; i++) {
      const pz = genPuzzle(paramsFor('legend', lv), rng);
      ok(pz !== null && solutionValid(pz.trees, pz.solution) && naiveCount(pz.trees, pz.doubles, 2) === 1,
        `传奇 L${lv} 抽样生成/校验失败`);
      if (pz) n++;
    }
    console.log(`传奇 L${lv}：成功 ${n}/20，平均 ${((performance.now() - t0) / 20).toFixed(1)}ms/关`);
  }
}

// ---------- 4. 胜利判定等价性：counts + 库存 + matchable ⇔ 唯一解 ----------
console.log('== 胜利判定等价性 ==');
for (let i = 0; i < 25; i++) {
  const pz = genPuzzle(paramsFor('hard', 12), rng);
  if (!pz) continue;
  const cells = pz.solution.flat();
  const rc = Array(N).fill(0), cc = Array(N).fill(0);
  for (const [r, c] of cells) { rc[r]++; cc[c]++; }
  const countsOk = rc.every((v, j) => v === pz.rc[j]) && cc.every((v, j) => v === pz.cc[j]);
  const invOk = pz.solution.filter(o => o.length === 2).length === pz.doubles;
  ok(countsOk && invOk && matchable(pz.trees, pz.solution), '按解摆放应判定胜利');
  ok(!(countsOk && invOk && matchable(pz.trees, pz.solution.slice(1))), '少摆一顶不应判定胜利');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
