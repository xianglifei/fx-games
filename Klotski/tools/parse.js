// 解析 fayaa 华容道布局数据，并用 BFS 求解器验证最优步数
// 计步规则：一个棋子沿一个方向直线滑动任意格 = 1 步（经典 81 步体系）
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/fayaa.js', 'utf8');

// 提取 var initBoardFayaa = [ ... ]; 的数组字面量并求值
// （文件后段还有其他代码含未配对方括号，故用最后的 ]; 定位数组结尾）
const arrStart = src.indexOf('[', src.indexOf('var initBoardFayaa'));
const arrEnd = src.lastIndexOf('];');
const boards = new Function('return ' + src.slice(arrStart, arrEnd + 1))();
console.log(`共解析布局: ${boards.length}`);

// ---------- 棋盘解析 ----------
// board: 5 段 4 字符字符串。同字符的格子聚为一个棋子，据形状分类。
const W = 4, H = 5;
function parseBoard(boardStr) {
  const cells = [];
  for (const row of boardStr.match(/.{4}/g)) for (const ch of row) cells.push(ch);
  const groups = new Map();
  cells.forEach((ch, idx) => {
    if (ch === '@') return;
    if (!groups.has(ch)) groups.set(ch, []);
    groups.get(ch).push([idx % W, Math.floor(idx / W)]);
  });
  const pieces = [];
  for (const [ch, pos] of groups) {
    pos.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const [[x0, y0]] = pos;
    const w = Math.max(...pos.map(p => p[0])) - x0 + 1;
    const h = Math.max(...pos.map(p => p[1])) - y0 + 1;
    if (w * h !== pos.length) return { error: `棋子 ${ch} 形状不连续` };
    let type;
    if (w === 2 && h === 2) type = 'box';        // 曹操
    else if (w === 1 && h === 2) type = 'vert';  // 竖将
    else if (w === 2 && h === 1) type = 'horz';  // 横将
    else if (w === 1 && h === 1) type = 'sold';  // 小卒
    else return { error: `棋子 ${ch} 非法形状 ${w}x${h}` };
    pieces.push({ ch, x: x0, y: y0, w, h, type });
  }
  const count = t => pieces.filter(p => p.type === t).length;
  if (count('box') !== 1) return { error: `曹操数量 ${count('box')} ≠ 1` };
  if (count('sold') !== 4) return { error: `小卒数量 ${count('sold')} ≠ 4` };
  if (count('vert') + count('horz') !== 5) return { error: '大将数量 ≠ 5' };
  const occupied = pieces.reduce((s, p) => s + p.w * p.h, 0);
  if (occupied !== 18) return { error: `占格 ${occupied} ≠ 18` };
  return { pieces };
}

// ---------- 0-1 BFS 求解器 ----------
// 经典计步：同一棋子连续滑动（可拐弯）算 1 步，换棋子才算新的一步。
// 状态 = (布局, 上一步移动的棋子)；同子滑动代价 0，换子滑动代价 1（Dial 桶队列）。
function solve(pieces) {
  const n = pieces.length;
  const shapes = pieces.map(p => p.w + 'x' + p.h);
  const goalIdx = pieces.findIndex(p => p.type === 'box');
  const goalX = 1, goalY = 3; // 曹操到达底部中央（4x5 棋盘出口在底边 1-2 列）

  function canKey(pos, last) {
    const byShape = {};
    pos.forEach((p, i) => (byShape[shapes[i]] = byShape[shapes[i]] || []).push(p.x * 10 + p.y));
    const base = Object.keys(byShape).sort()
      .map(s => byShape[s].sort((a, b) => a - b).join('.')).join('|');
    const lastTag = last < 0 ? '*' : shapes[last] + '@' + pos[last].x * 10 + pos[last].y;
    return base + '#' + lastTag;
  }
  function grid(pos) {
    const g = Array.from({ length: H }, () => Array(W).fill(-1));
    pos.forEach((p, i) => { for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) g[y][x] = i; });
    return g;
  }

  const start = pieces.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
  const startKey = canKey(start, -1);
  const parents = new Map(); // stateKey -> { prev, pieceIdx, dx, dy, dist }
  const dist = new Map([[startKey, 0]]);
  const BUCKET_MAX = 400;
  const buckets = [];
  const push = (cost, key, pos, last) => {
    if (cost >= BUCKET_MAX) return;
    (buckets[cost] = buckets[cost] || []).push([key, pos, last]);
  };
  push(0, startKey, start, -1);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const reconstruct = (k) => {
    const moves = [];
    while (k !== startKey) {
      const m = parents.get(k);
      moves.unshift({ pieceIdx: m.pieceIdx, dx: m.dx, dy: m.dy, dist: m.dist });
      k = m.prev;
    }
    return moves;
  };

  for (let cost = 0; cost < BUCKET_MAX; cost++) {
    const bucket = buckets[cost];
    if (!bucket) continue;
    while (bucket.length) {
      const [key, pos, last] = bucket.pop();
      if (dist.get(key) !== cost) continue; // 过期条目
      // 出队时距离已最终确定，此处才可判定终局
      if (pos[goalIdx].x === goalX && pos[goalIdx].y === goalY) {
        return { steps: cost, moves: reconstruct(key) };
      }
      const g = grid(pos);
      for (let i = 0; i < n; i++) {
        const p = pos[i];
        const step = i === last ? 0 : 1;
        for (const [dx, dy] of DIRS) {
          let d = 0;
          while (true) {
            const nx = p.x + dx * (d + 1), ny = p.y + dy * (d + 1);
            let ok = true;
            if (dx === 1) { if (nx + p.w - 1 >= W) break; for (let y = p.y; y < p.y + p.h; y++) if (g[y][nx + p.w - 1] !== -1) { ok = false; break; } }
            else if (dx === -1) { if (nx < 0) break; for (let y = p.y; y < p.y + p.h; y++) if (g[y][nx] !== -1) { ok = false; break; } }
            else if (dy === 1) { if (ny + p.h - 1 >= H) break; for (let x = p.x; x < p.x + p.w; x++) if (g[ny + p.h - 1][x] !== -1) { ok = false; break; } }
            else { if (ny < 0) break; for (let x = p.x; x < p.x + p.w; x++) if (g[ny][x] !== -1) { ok = false; break; } }
            if (!ok) break;
            d++;
            const np = pos.map((q, j) => j === i ? { x: p.x + dx * d, y: p.y + dy * d, w: p.w, h: p.h } : q);
            const nk = canKey(np, i);
            const nc = cost + step;
            if (!dist.has(nk) || dist.get(nk) > nc) {
              dist.set(nk, nc);
              parents.set(nk, { prev: key, pieceIdx: i, dx, dy, dist: d });
              push(nc, nk, np, i);
            }
          }
        }
      }
    }
    buckets[cost] = undefined; // 本桶已处理完毕（此后只可能产生 cost+1 的入队）
  }
  return null; // 无解
}

// ---------- 遍历所有中文命名布局并验证 ----------
const results = [];
for (const b of boards) {
  if (!/[\u4e00-\u9fff]/.test(b.name || '')) continue;
  const parsed = parseBoard(b.board);
  if (parsed.error) { results.push({ name: b.name, mini: b.mini, error: parsed.error }); continue; }
  const t0 = Date.now();
  const r = solve(parsed.pieces);
  const ms = Date.now() - t0;
  results.push({
    name: b.name, mini: b.mini, level: b.level,
    computed: r ? r.steps : '无解',
    ok: r ? r.steps === b.mini : false,
    ms,
    grid: b.board.match(/.{4}/g).join('/'),
  });
}

const okCount = results.filter(r => r.ok).length;
const bad = results.filter(r => !r.ok);
console.log(`中文命名布局: ${results.length}，步数验证一致: ${okCount}`);
console.log('--- 不一致/异常 ---');
for (const r of bad) console.log(`${r.name}(lv${r.level}) 公认=${r.mini} 计算=${r.computed} ${r.error || ''} ${r.grid || ''}`);
console.log('--- 全部结果 ---');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}  公认=${r.mini}  计算=${r.computed}  ${r.ms}ms`);
fs.writeFileSync(__dirname + '/verify-results.json', JSON.stringify(results, null, 2));
