// Tiny synthesized sound effects (no audio files needed)
const Sound = (() => {
  let ctx = null;

  function unlock() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock,
    coin: () => { tone(988, 0.07, 'square', 0.05); setTimeout(() => tone(1319, 0.12, 'square', 0.05), 60); },
    jump: () => tone(300, 0.18, 'triangle', 0.1, 700),
    duck: () => tone(400, 0.15, 'triangle', 0.08, 150),
    lane: () => tone(600, 0.05, 'sine', 0.06),
    stumble: () => tone(180, 0.25, 'sawtooth', 0.1, 90),
    crash: () => { tone(120, 0.5, 'sawtooth', 0.15, 40); },
    siren: () => { tone(700, 0.35, 'sine', 0.05, 950); setTimeout(() => tone(950, 0.35, 'sine', 0.05, 700), 350); },
    beep: (hi) => tone(hi ? 880 : 440, 0.15, 'square', 0.06),
  };
})();
