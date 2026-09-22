// 华容道主程序
(function () {
  'use strict';

  const S = window.KlotskiSolver;
  const LEVELS = window.KLOTSKI_LEVELS;
  const Sfx = window.KlotskiAudio;
  const W = 4, H = 5, GAP = 5; // GAP：棋子间视觉留缝（px）

  // ---------- 常量：武将配色（对应传统戏服意象） ----------
  const GENERAL_META = [
    { name: '关羽', cls: 'guan' },
    { name: '张飞', cls: 'zhang' },
    { name: '赵云', cls: 'zhao' },
    { name: '马超', cls: 'ma' },
    { name: '黄忠', cls: 'huang' },
  ];

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const boardEl = $('#board');
  const gateEl = $('#gate');
  const levelNameEl = $('#level-name');
  const levelMetaEl = $('#level-meta');
  const stepsEl = $('#stat-steps');
  const minEl = $('#stat-min');
  const timeEl = $('#stat-time');
  const bestEl = $('#stat-best');
  const btnUndo = $('#btn-undo');
  const btnRestart = $('#btn-restart');
  const btnHint = $('#btn-hint');
  const btnDemo = $('#btn-demo');
  const btnLevels = $('#btn-levels');
  const btnSound = $('#btn-sound');
  const btnHelp = $('#btn-help');
  const toastEl = $('#toast');

  // ---------- 存档 ----------
  const STORE_KEY = 'huarongdao.v1';
  const store = {
    data: { sound: true, last: null, records: {} },
    load() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) Object.assign(this.data, JSON.parse(raw));
      } catch (e) { /* 隐私模式等场景下静默降级 */ }
    },
    save() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { }
    },
  };

  // ---------- 运行时状态 ----------
  const state = {
    level: null,      // 当前关卡数据
    pieces: [],       // 运行时棋子（含 DOM 引用）
    history: [],      // 步历史：[{ pieceIdx, slides: [{dx,dy,dist}] }]
    selected: -1,     // 当前选中棋子索引
    cell: 72,         // 格子边长（px）
    won: false,
    demoActive: false,
    demoCancel: false,
    hintsUsed: false,
    animating: false, // 摆盘动画期间锁定输入
    hintTimer: 0,
    drag: null,
    timer: { started: false, elapsed: 0, since: 0, int: 0 },
  };

  // ---------- 工具 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // ---------- 计时 ----------
  function timerStart() {
    if (state.timer.started) return;
    state.timer.started = true;
    state.timer.since = Date.now();
    state.timer.int = setInterval(updateTimeUI, 500);
  }
  function timerStop() {
    if (state.timer.started) {
      state.timer.elapsed += Date.now() - state.timer.since;
      state.timer.started = false;
    }
    clearInterval(state.timer.int);
    updateTimeUI();
  }
  function timerReset() {
    clearInterval(state.timer.int);
    state.timer = { started: false, elapsed: 0, since: 0, int: 0 };
    updateTimeUI();
  }
  function timerElapsed() {
    return state.timer.elapsed + (state.timer.started ? Date.now() - state.timer.since : 0);
  }
  function updateTimeUI() {
    timeEl.textContent = fmtTime(timerElapsed());
  }
  document.addEventListener('visibilitychange', () => {
    // 切后台时把离开的这段时间从计时中扣除
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && state.timer.started) {
      state.timer.since += Date.now() - hiddenAt;
      hiddenAt = 0;
      updateTimeUI();
    }
  });
  let hiddenAt = 0;

  // ---------- 布局与渲染 ----------
  function cellSize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const byW = (Math.min(vw, 560) - 56) / W;
    const byH = (vh - 285) / H;
    return clamp(Math.floor(Math.min(byW, byH)), 46, 92);
  }

  function layout() {
    state.cell = cellSize();
    document.documentElement.style.setProperty('--cell', state.cell + 'px');
    for (const p of state.pieces) positionEl(p, false);
    positionArrows();
  }

  function positionEl(p, animate = true) {
    const c = state.cell;
    if (!animate) p.el.classList.add('no-anim');
    p.el.style.left = (p.x * c + GAP / 2) + 'px';
    p.el.style.top = (p.y * c + GAP / 2) + 'px';
    p.el.style.width = (p.w * c - GAP) + 'px';
    p.el.style.height = (p.h * c - GAP) + 'px';
    if (!animate) requestAnimationFrame(() => p.el.classList.remove('no-anim'));
  }

  function occupancy(excludeIdx = -1) {
    const g = Array.from({ length: H }, () => Array(W).fill(false));
    state.pieces.forEach((p, i) => {
      if (i === excludeIdx) return;
      for (let y = p.y; y < p.y + p.h; y++)
        for (let x = p.x; x < p.x + p.w; x++) g[y][x] = true;
    });
    return g;
  }

  // 各方向最大可滑格数
  function slack(p, g) {
    const s = { left: 0, right: 0, up: 0, down: 0 };
    const free = (x, y) => x >= 0 && x < W && y >= 0 && y < H && !g[y][x];
    const colFree = (x, y0, y1) => { for (let y = y0; y < y1; y++) if (!free(x, y)) return false; return true; };
    const rowFree = (y, x0, x1) => { for (let x = x0; x < x1; x++) if (!free(x, y)) return false; return true; };
    while (colFree(p.x - s.left - 1, p.y, p.y + p.h)) s.left++;
    while (colFree(p.x + p.w + s.right, p.y, p.y + p.h)) s.right++;
    while (rowFree(p.y - s.up - 1, p.x, p.x + p.w)) s.up++;
    while (rowFree(p.y + p.h + s.down, p.x, p.x + p.w)) s.down++;
    return s;
  }

  // ---------- 关卡加载 ----------
  function loadLevel(level, animate = true) {
    clearInterval(state.timer.int);
    state.level = level;
    state.history = [];
    state.selected = -1;
    lastMovedIdx = -1;
    state.won = false;
    state.demoActive = false;
    state.demoCancel = false;
    state.hintsUsed = false;
    clearHint();
    hideArrows();
    store.data.last = level.id;
    store.save();
    if (window.history && history.replaceState) {
      history.replaceState(null, '', location.pathname + '?lvl=' + level.id);
    }

    const base = S.parseGrid(level.grid);
    // 角色分配：横将在前（关羽执横刀），其后竖将，小卒，曹操
    const generals = base.filter(p => p.type === 'horz' || p.type === 'vert')
      .sort((a, b) => (a.type === 'horz' ? 0 : 1) - (b.type === 'horz' ? 0 : 1) || a.y - b.y || a.x - b.x);
    generals.forEach((g, i) => { g.name = GENERAL_META[i].name; g.cls = GENERAL_META[i].cls; });
    base.forEach(p => {
      if (p.type === 'box') { p.name = '曹操'; p.cls = 'cao'; }
      else if (p.type === 'sold') { p.name = '卒'; p.cls = 'sold'; }
    });

    boardEl.querySelectorAll('.piece, .confetti, .hint-ghost').forEach(el => el.remove());
    boardEl.classList.remove('won');
    gateEl.classList.remove('open');

    state.pieces = base.map((p, idx) => {
      const el = document.createElement('div');
      el.className = 'piece ' + p.type + ' role-' + p.cls;
      el.dataset.idx = idx;
      const name = document.createElement('span');
      name.className = 'piece-name';
      name.textContent = p.name;
      el.appendChild(name);
      boardEl.appendChild(el);
      const piece = Object.assign({}, p, { idx, el, name: p.name, cls: p.cls });
      bindDrag(piece);
      el.addEventListener('click', () => onPieceTap(piece));
      return piece;
    });

    layout();
    updateHUD();
    timerReset();

    state.animating = animate;
    if (animate) {
      // 摆盘动画：棋子从中心飞入（致敬计客华容道的摆放引导）
      let started = false;
      const flyIn = () => {
        if (started) return;
        started = true;
        state.pieces.forEach((p, i) => {
          p.el.classList.remove('no-anim');
          p.el.style.transitionDelay = (i * 36) + 'ms';
          p.el.style.opacity = '1';
          positionEl(p, true);
        });
        setTimeout(() => {
          state.pieces.forEach(p => { p.el.style.transitionDelay = ''; });
          state.animating = false;
        }, state.pieces.length * 36 + 420);
      };
      const cx = (W * state.cell) / 2, cy = (H * state.cell) / 2;
      state.pieces.forEach((p) => {
        p.el.classList.add('no-anim');
        p.el.style.left = (cx - parseFloat(p.el.style.width) / 2) + 'px';
        p.el.style.top = (cy - parseFloat(p.el.style.height) / 2) + 'px';
        p.el.style.opacity = '0';
      });
      // 双 rAF 确保起始位置先渲染；后台标签页 rAF 会被节流，用 setTimeout 兜底
      requestAnimationFrame(() => requestAnimationFrame(flyIn));
      setTimeout(flyIn, 220);
    }
  }

  function updateHUD() {
    const lv = state.level;
    levelNameEl.textContent = lv.name;
    levelMetaEl.textContent = '★'.repeat(lv.tier) + ' ' + lv.tierName + ' · 最少 ' + lv.minSteps + ' 步';
    stepsEl.textContent = String(steps());
    minEl.textContent = String(lv.minSteps);
    const rec = store.data.records[lv.id];
    bestEl.textContent = rec ? rec.steps + ' 步 / ' + fmtTime(rec.time) : '—';
    btnUndo.disabled = state.history.length === 0;
  }

  const steps = () => state.history.length;

  // ---------- 选择与方向箭头 ----------
  let arrowBox = null;
  function ensureArrows() {
    if (!arrowBox) {
      arrowBox = document.createElement('div');
      arrowBox.id = 'arrows';
      boardEl.appendChild(arrowBox);
    }
    return arrowBox;
  }
  function hideArrows() {
    if (arrowBox) { arrowBox.remove(); arrowBox = null; }
    if (state.selected >= 0) state.pieces[state.selected].el.classList.remove('selected');
    state.selected = -1;
  }
  function positionArrows() {
    if (!arrowBox || state.selected < 0) return;
    showArrows(state.selected);
  }
  function showArrows(idx) {
    if (state.selected >= 0 && state.selected !== idx) {
      state.pieces[state.selected].el.classList.remove('selected');
    }
    state.selected = idx;
    state.pieces[idx].el.classList.add('selected');
    const p = state.pieces[idx];
    const s = slack(p, occupancy(idx));
    const box = ensureArrows();
    box.innerHTML = '';
    const dirs = [
      { k: 'up', dx: 0, dy: -1, has: s.up > 0, x: (p.x + p.w / 2), y: p.y - 0.18 },
      { k: 'down', dx: 0, dy: 1, has: s.down > 0, x: (p.x + p.w / 2), y: p.y + p.h + 0.18 },
      { k: 'left', dx: -1, dy: 0, has: s.left > 0, x: p.x - 0.18, y: (p.y + p.h / 2) },
      { k: 'right', dx: 1, dy: 0, has: s.right > 0, x: p.x + p.w + 0.18, y: (p.y + p.h / 2) },
    ];
    for (const d of dirs) {
      if (!d.has) continue;
      const b = document.createElement('button');
      b.className = 'arrow arrow-' + d.k;
      b.textContent = { up: '▲', down: '▼', left: '◀', right: '▶' }[d.k];
      b.style.left = (d.x * state.cell - 14) + 'px';
      b.style.top = (d.y * state.cell - 14) + 'px';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        Sfx.ui();
        // 走完这一步即完成一次点选操作，收起箭头
        if (tryMove(idx, d.dx, d.dy, 1)) hideArrows();
      });
      box.appendChild(b);
    }
    if (!box.children.length) hideArrows();
  }

  // 拖拽刚结束时抑制随之而来的 click（避免拖完误选中）
  let justDragged = false;

  function onPieceTap(piece) {
    if (locked() || justDragged) return;
    Sfx.unlock();
    // 再点已选中的棋子 → 取消选中
    if (state.selected === piece.idx) { hideArrows(); return; }
    // 点其他棋子 → 先收起上一个棋子的箭头
    if (state.selected >= 0) hideArrows();
    // 智能点击：唯一方向直接走；多方向弹箭头；完全走不动给"卡住"反馈
    const s = slack(piece, occupancy(piece.idx));
    const dirs = [];
    if (s.up) dirs.push([0, -1]);
    if (s.down) dirs.push([0, 1]);
    if (s.left) dirs.push([-1, 0]);
    if (s.right) dirs.push([1, 0]);
    if (dirs.length === 1) {
      tryMove(piece.idx, dirs[0][0], dirs[0][1], 1);
      return;
    }
    if (dirs.length === 0) {
      Sfx.snap();
      piece.el.classList.add('stuck');
      setTimeout(() => piece.el.classList.remove('stuck'), 350);
      return;
    }
    Sfx.select();
    showArrows(piece.idx);
  }

  // ---------- 拖拽 ----------
  function locked() {
    return state.won || state.animating || state.demoActive;
  }

  function bindDrag(piece) {
    const el = piece.el;
    el.addEventListener('pointerdown', (e) => {
      if (locked()) return;
      Sfx.unlock();
      if (state.selected >= 0) hideArrows();
      const cell = state.cell;
      const startX = e.clientX, startY = e.clientY;
      const originX = piece.x, originY = piece.y;
      const s = slack(piece, occupancy(piece.idx));
      const drag = {
        id: e.pointerId, startX, startY, originX, originY, s,
        axis: null, offX: 0, offY: 0, moved: false,
      };
      state.drag = drag;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件等场景无活动指针，忽略 */ }

      const onMove = (ev) => {
        if (state.drag !== drag) return;
        let dx = (ev.clientX - startX) / cell;
        let dy = (ev.clientY - startY) / cell;
        if (!drag.axis && (Math.abs(dx) > 0.22 || Math.abs(dy) > 0.22)) {
          drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (!drag.axis) return;
        if (drag.axis === 'x') {
          dx = clamp(dx, -s.left, s.right);
          drag.offX = dx; drag.offY = 0;
        } else {
          dy = clamp(dy, -s.up, s.down);
          drag.offX = 0; drag.offY = dy;
        }
        drag.moved = true;
        el.style.left = ((originX + drag.offX) * cell + GAP / 2) + 'px';
        el.style.top = ((originY + drag.offY) * cell + GAP / 2) + 'px';
      };

      const finish = (ev, cancelled) => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.classList.remove('dragging');
        if (state.drag !== drag) return;
        state.drag = null;
        // 拖拽尝试过移动但未成行（被堵弹回/取消）→ 不算轻点，抑制随后的 click
        const suppressTap = () => {
          justDragged = true;
          setTimeout(() => { justDragged = false; }, 0);
        };
        if (cancelled || !drag.moved || !drag.axis) {
          positionEl(piece, true); // 弹回
          if (cancelled || drag.moved) suppressTap();
          return;
        }
        let fx = Math.round(drag.offX), fy = Math.round(drag.offY);
        if (drag.axis === 'x') fy = 0; else fx = 0;
        fx = clamp(fx, -s.left, s.right);
        fy = clamp(fy, -s.up, s.down);
        if (fx === 0 && fy === 0) {
          positionEl(piece, true);
          Sfx.snap();
          suppressTap();
          return;
        }
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 0);
        piece.x = originX + fx;
        piece.y = originY + fy;
        positionEl(piece, true);
        commitMove(piece.idx, fx, fy);
      };
      const onUp = (ev) => finish(ev, false);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', (ev) => finish(ev, true));
    });
  }

  // 点击空白处取消选择
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target === boardEl || e.target.id === 'cells') hideArrows();
  });

  // ---------- 走子 ----------
  function tryMove(idx, dx, dy, dist) {
    const p = state.pieces[idx];
    const g = occupancy(idx);
    // 校验路径畅通
    for (let k = 1; k <= dist; k++) {
      const nx = p.x + dx * k, ny = p.y + dy * k;
      for (let yy = ny; yy < ny + p.h; yy++) {
        for (let xx = nx; xx < nx + p.w; xx++) {
          if (xx < 0 || xx >= W || yy < 0 || yy >= H || g[yy][xx]) return false;
        }
      }
    }
    p.x += dx * dist;
    p.y += dy * dist;
    positionEl(p, true);
    commitMove(idx, dx, dy, dist);
    return true;
  }

  function commitMove(idx, fx, fy, dist = Math.abs(fx || fy)) {
    lastMovedIdx = idx;
    const last = state.history[state.history.length - 1];
    if (last && last.pieceIdx === idx) {
      const ls = last.slides[last.slides.length - 1];
      if (ls && ls.dx === fx && ls.dy === fy) ls.dist += dist;
      else last.slides.push({ dx: fx, dy: fy, dist });
    } else {
      state.history.push({ pieceIdx: idx, slides: [{ dx: fx, dy: fy, dist }] });
    }
    Sfx.slide(dist);
    timerStart();
    clearHint();
    updateHUD();
    if (checkWin()) return;
  }

  function undo() {
    if (locked() || !state.history.length) return;
    const run = state.history.pop();
    const p = state.pieces[run.pieceIdx];
    // 逆序回退每一段滑动
    for (let i = run.slides.length - 1; i >= 0; i--) {
      const sl = run.slides[i];
      p.x -= sl.dx * sl.dist;
      p.y -= sl.dy * sl.dist;
    }
    positionEl(p, true);
    Sfx.undo();
    clearHint();
    updateHUD();
    if (state.selected >= 0) showArrows(state.selected); // 选中棋子的箭头刷新到回退后的位置
  }

  function restart() {
    if (state.demoActive) stopDemo();
    loadLevel(state.level, true);
    Sfx.ui();
  }

  // ---------- 胜利 ----------
  function boxPiece() { return state.pieces.find(p => p.type === 'box'); }

  function checkWin() {
    const b = boxPiece();
    if (b.x !== 1 || b.y !== 3) return false;
    state.won = true;
    // 立刻快照：750ms 后弹窗打开时这些标志可能已被重置
    const wasDemo = state.demoActive, usedHints = state.hintsUsed;
    timerStop();
    gateEl.classList.add('open');
    boardEl.classList.add('won');
    // 曹操从出口滑出
    setTimeout(() => {
      b.y = 5;
      b.el.style.transition = 'left .55s ease-in, top .55s ease-in, opacity .55s';
      b.el.style.top = (b.y * state.cell + GAP / 2) + 'px';
      b.el.style.opacity = '0.25';
      setTimeout(() => { b.el.style.transition = ''; }, 600);
    }, 120);
    setTimeout(() => Sfx.win(), 200);
    setTimeout(() => { confetti(); showWinModal(wasDemo, usedHints); }, 750);
    return true;
  }

  function confetti() {
    const colors = ['#c94f3d', '#e0a63d', '#6f8f5a', '#5a7d9a', '#a0699a'];
    const c = state.cell;
    for (let i = 0; i < 42; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.left = (Math.random() * W * c) + 'px';
      el.style.top = (-10 - Math.random() * 40) + 'px';
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = (1 + Math.random() * 1.2) + 's';
      el.style.animationDelay = (Math.random() * 0.35) + 's';
      el.style.setProperty('--rx', (Math.random() * 720 - 360) + 'deg');
      el.style.setProperty('--tx', (Math.random() * 80 - 40) + 'px');
      el.addEventListener('animationend', () => el.remove());
      boardEl.appendChild(el);
    }
  }

  function recordOf(level) {
    return store.data.records[level.id] || null;
  }

  function showWinModal(wasDemo, usedHints) {
    const lv = state.level;
    const st = steps(), t = timerElapsed();
    const rec = recordOf(lv);
    let isRecord = false;
    if (!wasDemo && !usedHints) {
      const better = !rec || st < rec.steps || (st === rec.steps && t < rec.time);
      if (better) {
        store.data.records[lv.id] = { steps: st, time: t };
        store.save();
        isRecord = true;
        updateHUD();
      }
    }
    $('#win-title').textContent = lv.name + ' · 通关';
    const rate = st === lv.minSteps ? '最优解！已达到理论最少步数'
      : st <= lv.minSteps * 1.15 ? '行云流水，距最优仅 ' + (st - lv.minSteps) + ' 步'
        : '曹操已遁走华容，共 ' + (st - lv.minSteps) + ' 步精进空间';
    $('#win-stats').innerHTML =
      '<div class="win-stat"><span>' + st + '</span>步 <em>(最少 ' + lv.minSteps + ')</em></div>' +
      '<div class="win-stat"><span>' + fmtTime(t) + '</span>用时</div>' +
      '<div class="win-rate">' + rate + '</div>' +
      (isRecord ? '<div class="win-record">🎉 新纪录！</div>' : '') +
      (wasDemo ? '<div class="win-note">演示模式，不计入纪录</div>' :
        usedHints ? '<div class="win-note">本局使用了提示，不计入纪录</div>' : '');
    openModal('#modal-win');
  }

  // ---------- 提示 ----------
  function clearHint() {
    clearTimeout(state.hintTimer);
    boardEl.querySelectorAll('.hint-ghost').forEach(el => el.remove());
    boardEl.querySelectorAll('.piece.hinted').forEach(el => el.classList.remove('hinted'));
  }

  function hint() {
    if (locked()) return;
    Sfx.unlock();
    clearHint();
    const pieces = state.pieces.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, type: p.type }));
    btnHint.classList.add('thinking');
    btnHint.textContent = '推演中…';
    setTimeout(() => {
      let runs = null;
      try {
        const r = S.solve(pieces);
        if (r) runs = S.runsFromMoves(r.moves);
      } finally {
        btnHint.classList.remove('thinking');
        btnHint.textContent = '提示';
      }
      if (!runs || !runs.length) { toast('当前局面无解，试试撤销几步'); return; }
      state.hintsUsed = true;
      const run = runs[0];
      const p = state.pieces[run.pieceIdx];
      // 幽灵棋子：这一步走完的位置
      const end = { x: p.x, y: p.y };
      for (const s of run.slides) { end.x += s.dx * s.dist; end.y += s.dy * s.dist; }
      const ghost = document.createElement('div');
      ghost.className = 'piece hint-ghost ' + p.type;
      ghost.style.left = (end.x * state.cell + GAP / 2) + 'px';
      ghost.style.top = (end.y * state.cell + GAP / 2) + 'px';
      ghost.style.width = (p.w * state.cell - GAP) + 'px';
      ghost.style.height = (p.h * state.cell - GAP) + 'px';
      boardEl.appendChild(ghost);
      p.el.classList.add('hinted');
      state.hintTimer = setTimeout(clearHint, 3200);
      Sfx.ui();
    }, 30);
  }

  // ---------- 自动演示 ----------
  async function startDemo() {
    if (locked()) return;
    Sfx.unlock();
    const pieces = state.pieces.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, type: p.type }));
    btnDemo.disabled = true;
    btnDemo.textContent = '推演中…';
    await new Promise(r => setTimeout(r, 30));
    let runs = null;
    try {
      const r = S.solve(pieces);
      if (r) runs = S.runsFromMoves(r.moves);
    } finally {
      btnDemo.disabled = false;
      btnDemo.textContent = '停止';
    }
    if (!runs) { toast('当前局面无解'); return; }
    state.demoActive = true;
    state.demoCancel = false;
    document.body.classList.add('demoing');
    hideArrows();
    for (const run of runs) {
      if (state.demoCancel) break;
      const p = state.pieces[run.pieceIdx];
      p.el.classList.add('demo-hl');
      for (const s of run.slides) {
        if (state.demoCancel) break;
        await new Promise(r => setTimeout(r, 170));
        p.x += s.dx * s.dist;
        p.y += s.dy * s.dist;
        positionEl(p, true);
        Sfx.slide(s.dist);
        if (state.history.length && state.history[state.history.length - 1].pieceIdx === p.idx) {
          const last = state.history[state.history.length - 1];
          const ls = last.slides[last.slides.length - 1];
          if (ls && ls.dx === s.dx && ls.dy === s.dy) ls.dist += s.dist;
          else last.slides.push({ dx: s.dx, dy: s.dy, dist: s.dist });
        } else {
          state.history.push({ pieceIdx: p.idx, slides: [{ dx: s.dx, dy: s.dy, dist: s.dist }] });
        }
        lastMovedIdx = p.idx;
        updateHUD();
        if (checkWin()) break;
      }
      p.el.classList.remove('demo-hl');
      if (state.won) break;
      await new Promise(r => setTimeout(r, 90));
    }
    state.demoActive = false;
    state.demoCancel = false;
    document.body.classList.remove('demoing');
    btnDemo.textContent = '演示';
    if (!state.won) toast('演示已停止');
  }
  function stopDemo() {
    if (state.demoActive) state.demoCancel = true;
  }

  // ---------- 弹层 ----------
  function openModal(sel) { $(sel).classList.add('open'); }
  function closeModal(sel) { $(sel).classList.remove('open'); }
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
    m.querySelectorAll('[data-close]').forEach(b =>
      b.addEventListener('click', () => m.classList.remove('open')));
  });

  function renderLevelsModal() {
    const wrap = $('#levels-list');
    wrap.innerHTML = '';
    let lastTier = 0;
    for (const lv of LEVELS) {
      if (lv.tier !== lastTier) {
        lastTier = lv.tier;
        const h = document.createElement('h3');
        h.className = 'tier-title';
        h.textContent = '★'.repeat(lv.tier) + ' ' + lv.tierName;
        wrap.appendChild(h);
        const grid = document.createElement('div');
        grid.className = 'level-grid';
        wrap.appendChild(grid);
      }
      const grid = wrap.lastElementChild;
      const rec = recordOf(lv);
      const card = document.createElement('button');
      card.className = 'level-card' + (lv.id === state.level.id ? ' current' : '') + (rec ? ' cleared' : '');
      card.innerHTML =
        '<span class="lc-name">' + lv.name + '</span>' +
        '<span class="lc-min">最少 ' + lv.minSteps + ' 步</span>' +
        '<span class="lc-rec">' + (rec ? '✓ ' + rec.steps + ' 步 / ' + fmtTime(rec.time) : '&nbsp;') + '</span>';
      card.addEventListener('click', () => {
        Sfx.ui();
        closeModal('#modal-levels');
        if (lv.id !== state.level.id || state.won) loadLevel(lv, true);
      });
      grid.appendChild(card);
    }
  }

  // ---------- 事件 ----------
  btnUndo.addEventListener('click', () => { Sfx.ui(); undo(); });
  btnRestart.addEventListener('click', restart);
  btnHint.addEventListener('click', hint);
  btnDemo.addEventListener('click', () => { state.demoActive ? stopDemo() : startDemo(); });
  btnLevels.addEventListener('click', () => { Sfx.ui(); renderLevelsModal(); openModal('#modal-levels'); });
  btnHelp.addEventListener('click', () => { Sfx.ui(); openModal('#modal-help'); });
  btnSound.addEventListener('click', () => {
    Sfx.unlock();
    const muted = Sfx.toggle();
    store.data.sound = !muted;
    store.save();
    btnSound.textContent = muted ? '🔇' : '🔊';
    if (!muted) Sfx.ui();
  });

  // ---------- 键盘支持 ----------
  let kbdTipShown = false;
  let lastMovedIdx = -1;      // 最近一次被移动的棋子，作为 Tab 选子的锚点
  let restartArmed = false;   // R 键二次确认
  let restartArmTimer = 0;

  const anyModalOpen = () => !!document.querySelector('.modal.open');

  // 当前行主序下"走得动"的棋子（Tab 循环只在这些棋子间进行）
  function movableOrder() {
    const arr = [];
    state.pieces.forEach((p, i) => {
      const sl = slack(p, occupancy(i));
      if (sl.left || sl.right || sl.up || sl.down) arr.push(i);
    });
    return arr;
  }

  function cycleSelection(back) {
    const order = movableOrder();
    if (!order.length) { toast('当前没有可以移动的棋子'); return; }
    let idx;
    if (state.selected < 0) {
      // 没有选中时：优先锚定最近动过的棋子
      const anchor = lastMovedIdx >= 0 ? order.indexOf(lastMovedIdx) : -1;
      idx = anchor >= 0 ? anchor : (back ? order.length - 1 : 0);
    } else {
      const cur = order.indexOf(state.selected);
      idx = cur < 0 ? (back ? order.length - 1 : 0)
        : (cur + (back ? -1 : 1) + order.length) % order.length;
    }
    Sfx.unlock();
    Sfx.select();
    showArrows(order[idx]);
    if (!kbdTipShown) {
      kbdTipShown = true;
      toast('Tab 换子 · 方向键移动 · Esc 取消');
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
      hideArrows();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();

    // 弹窗打开时：L 可关闭关卡列表，通关弹窗 Enter 直接下一关，其余交给浏览器原生焦点行为
    if (anyModalOpen()) {
      if (k === 'l' && $('#modal-levels').classList.contains('open')) {
        e.preventDefault();
        closeModal('#modal-levels');
      } else if (e.key === 'Enter'
        && $('#modal-win').classList.contains('open')
        && !(e.target instanceof HTMLElement && e.target.closest('button'))) {
        e.preventDefault();
        $('#win-next').click();
      }
      return;
    }

    // 不受"游戏进行中"限制的键
    if (k === 'd') { e.preventDefault(); state.demoActive ? stopDemo() : startDemo(); return; }
    if (k === 'm') { e.preventDefault(); btnSound.click(); return; }

    if (locked()) return;

    switch (k) {
      case 'tab': {
        e.preventDefault();
        cycleSelection(e.shiftKey);
        return;
      }
      case 'arrowup': case 'arrowdown': case 'arrowleft': case 'arrowright': {
        e.preventDefault();
        const map = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] };
        const [dx, dy] = map[k];
        if (state.selected < 0) {
          // 未选中：自动锚定最近动过的棋子，让鼠标/键盘无缝接力
          if (lastMovedIdx >= 0 && movableOrder().includes(lastMovedIdx)) {
            showArrows(lastMovedIdx);
            if (tryMove(lastMovedIdx, dx, dy, 1)) { Sfx.ui(); showArrows(lastMovedIdx); }
          } else if (!kbdTipShown) {
            kbdTipShown = true;
            toast('先按 Tab 选择棋子，再用方向键移动');
          }
          return;
        }
        if (tryMove(state.selected, dx, dy, 1)) {
          Sfx.ui();
          showArrows(state.selected); // 键盘连续操作：箭头跟随棋子到新位置
        } else {
          Sfx.snap();
        }
        return;
      }
      case 'z': undo(); break;
      case 'h': hint(); break;
      case 'l': renderLevelsModal(); openModal('#modal-levels'); break;
      case 'i': openModal('#modal-help'); break;
      case 'r': {
        if (restartArmed) {
          clearTimeout(restartArmTimer);
          restartArmed = false;
          restart();
        } else {
          restartArmed = true;
          toast('再按一次 R 确认重玩');
          restartArmTimer = setTimeout(() => { restartArmed = false; }, 2500);
        }
        break;
      }
    }
  });

  window.addEventListener('resize', layout);

  $('#win-again').addEventListener('click', () => { closeModal('#modal-win'); loadLevel(state.level, true); });
  $('#win-next').addEventListener('click', () => {
    closeModal('#modal-win');
    const i = LEVELS.findIndex(l => l.id === state.level.id);
    loadLevel(LEVELS[(i + 1) % LEVELS.length], true);
  });
  $('#win-levels').addEventListener('click', () => {
    closeModal('#modal-win');
    renderLevelsModal();
    openModal('#modal-levels');
  });

  // ---------- 启动 ----------
  store.load();
  Sfx.muted = !store.data.sound;
  btnSound.textContent = Sfx.muted ? '🔇' : '🔊';
  const urlId = new URLSearchParams(location.search).get('lvl');
  const initial = LEVELS.find(l => l.id === urlId)
    || LEVELS.find(l => l.id === store.data.last)
    || LEVELS[0];
  loadLevel(initial, true);

  // 测试钩子（自动化测试用，不影响游戏）
  window.__hrd = { state, tryMove, loadLevel, store, undo, hint };
})();
