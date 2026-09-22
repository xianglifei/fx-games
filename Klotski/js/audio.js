// 华容道音效：WebAudio 合成，无外部资源
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // 预生成噪声缓冲（滑动摩擦声）
    const len = Math.floor(ctx.sampleRate * 0.18);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function env(gainNode, t0, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.exponentialRampToValueAtTime(0.0001, t0 + decay);
  }

  function osc(type, freq, t0, dur, peak) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    env(g, t0, peak, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(freq, q, t0, dur, peak) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t0, peak, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const api = {
    muted: false,
    unlock() { if (ensure()) resume(); },
    toggle() {
      this.muted = !this.muted;
      if (master) master.gain.value = this.muted ? 0 : 0.9;
      return this.muted;
    },
    // 棋子滑动（木质摩擦），dist 越长声音越长
    slide(dist) {
      if (this.muted || !ensure()) return;
      resume();
      const t = ctx.currentTime;
      noise(600 + dist * 120, 1.6, t, 0.09 + dist * 0.03, 0.16);
    },
    // 落定
    snap() {
      if (this.muted || !ensure()) return;
      resume();
      const t = ctx.currentTime;
      osc('triangle', 480, t, 0.06, 0.12);
      noise(1800, 2, t, 0.03, 0.06);
    },
    select() {
      if (this.muted || !ensure()) return;
      resume();
      osc('sine', 660, ctx.currentTime, 0.05, 0.08);
    },
    ui() {
      if (this.muted || !ensure()) return;
      resume();
      osc('sine', 740, ctx.currentTime, 0.035, 0.06);
    },
    undo() {
      if (this.muted || !ensure()) return;
      resume();
      osc('sine', 420, ctx.currentTime, 0.07, 0.08);
    },
    win() {
      if (this.muted || !ensure()) return;
      resume();
      const t = ctx.currentTime;
      // 五声音阶上行（宫商角徵羽），古筝式拨弦
      [523.25, 587.33, 659.25, 783.99, 880, 1046.5].forEach((f, i) => {
        osc('triangle', f, t + i * 0.1, 0.5, 0.16);
        osc('sine', f * 2, t + i * 0.1, 0.25, 0.05);
      });
      osc('sine', 130.8, t, 0.9, 0.12);
    }
  };

  window.KlotskiAudio = api;
})();
