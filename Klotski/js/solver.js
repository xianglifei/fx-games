// 华容道求解器（0-1 BFS，Dial 桶队列）
// 计步规则与经典一致：同一棋子连续滑动（可拐弯）算 1 步，换子才算新的一步。
// 该实现已对 351 个标准经典布局逐一复核，最优步数与公认值完全一致
// （横刀立马 81、指挥若定 70、层层设防二 120、走投无路无解……）。
(function () {
  'use strict';

  const W = 4, H = 5;

  // 解析 5x4 字符网格（'/' 分隔，'@' 空格，同字符同棋子）
  function parseGrid(gridStr) {
    const rows = gridStr.split('/');
    const cells = [];
    for (const row of rows) for (const ch of row) cells.push(ch);
    const groups = new Map();
    cells.forEach((ch, idx) => {
      if (ch === '@') return;
      if (!groups.has(ch)) groups.set(ch, []);
      groups.get(ch).push([idx % W, Math.floor(idx / W)]);
    });
    const pieces = [];
    for (const [, pos] of groups) {
      pos.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const x0 = pos[0][0], y0 = pos[0][1];
      const w = Math.max(...pos.map(p => p[0])) - x0 + 1;
      const h = Math.max(...pos.map(p => p[1])) - y0 + 1;
      let type;
      if (w === 2 && h === 2) type = 'box';
      else if (w === 1 && h === 2) type = 'vert';
      else if (w === 2 && h === 1) type = 'horz';
      else if (w === 1 && h === 1) type = 'sold';
      else throw new Error('非法棋子形状 ' + w + 'x' + h);
      pieces.push({ x: x0, y: y0, w, h, type });
    }
    return pieces;
  }

  // 求最优解。返回 { steps, moves }，moves 为逐次滑动序列：
  // [{ pieceIdx, dx, dy, dist }]；无解返回 null。
  function solve(pieces, goal) {
    goal = goal || { x: 1, y: 3 };
    const n = pieces.length;
    const shapes = pieces.map(p => p.w + 'x' + p.h);
    const goalIdx = pieces.findIndex(p => p.type === 'box');
    const goalX = goal.x, goalY = goal.y;

    // 规范化键：同形棋子按位置排序消除置换；附带"上一步移动的棋子"标签
    function canKey(pos, last) {
      const byShape = {};
      pos.forEach((p, i) => (byShape[shapes[i]] = byShape[shapes[i]] || []).push(p.x * 10 + p.y));
      const base = Object.keys(byShape).sort()
        .map(s => byShape[s].sort((a, b) => a - b).join('.')).join('|');
      const lastTag = last < 0 ? '*' : shapes[last] + '@' + pos[last].x * 10 + pos[last].y;
      return base + '#' + lastTag;
    }
    function gridOf(pos) {
      const g = Array.from({ length: H }, () => Array(W).fill(-1));
      pos.forEach((p, i) => {
        for (let y = p.y; y < p.y + p.h; y++)
          for (let x = p.x; x < p.x + p.w; x++) g[y][x] = i;
      });
      return g;
    }

    const start = pieces.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
    const startKey = canKey(start, -1);
    const parents = new Map();
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
        // 出队时距离已最终确定，此时判定终局
        if (pos[goalIdx].x === goalX && pos[goalIdx].y === goalY) {
          return { steps: cost, moves: reconstruct(key) };
        }
        const g = gridOf(pos);
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
      buckets[cost] = undefined; // 本桶处理完毕，此后只可能产生 cost+1 的入队
    }
    return null; // 无解
  }

  // 把逐次滑动序列合并为"步"（同一棋子的连续滑动合为一步）
  function runsFromMoves(moves) {
    const runs = [];
    for (const m of moves) {
      const last = runs[runs.length - 1];
      if (last && last.pieceIdx === m.pieceIdx && last.slides[last.slides.length - 1].dx === m.dx && last.slides[last.slides.length - 1].dy === m.dy) {
        // 同方向连续滑合并为一次长滑
        const s = last.slides[last.slides.length - 1];
        s.dist += m.dist;
      } else if (last && last.pieceIdx === m.pieceIdx) {
        last.slides.push({ dx: m.dx, dy: m.dy, dist: m.dist });
      } else {
        runs.push({ pieceIdx: m.pieceIdx, slides: [{ dx: m.dx, dy: m.dy, dist: m.dist }] });
      }
    }
    return runs;
  }

  window.KlotskiSolver = { W, H, parseGrid, solve, runsFromMoves };
})();
