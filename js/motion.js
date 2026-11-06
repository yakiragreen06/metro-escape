// Turns raw phone sensor data into game moves: left, right, jump, duck.
//
// Body mode  - hold the phone upright in front of your chest and really move:
//              step sideways, jump, crouch. Uses the accelerometer, projected onto
//              "real" up/down and left/right using gravity, so the exact grip matters less.
// Tilt mode  - hold the phone flat like a remote: tilt left/right to change track,
//              tip the top up to jump, down to duck.
const Motion = (() => {
  const G = 9.81;
  let mode = 'body';
  let sens = 1;
  let swap = false;
  let onMove = () => {};
  let onMeter = () => {};

  // ---- shared helpers ----
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

  function fire(dir) {
    if (swap && (dir === 'left' || dir === 'right')) dir = dir === 'left' ? 'right' : 'left';
    onMove(dir);
  }

  // ---------------- Body mode (accelerometer) ----------------
  const body = {
    grav: { x: 0, y: G, z: 0 },   // running estimate of the gravity reaction vector ("up")
    cooldownUntil: 0,
    jumpHarderUntil: 0,
    win: null,                     // decision window while a movement is happening
  };

  function thresholds() {
    const harder = performance.now() < body.jumpHarderUntil ? 1.5 : 1;
    return { side: 4.5 / sens, jump: (8 / sens) * harder, duck: 5.5 / sens };
  }

  function handleMotion(e) {
    if (mode !== 'body') return;
    const aig = e.accelerationIncludingGravity;
    if (!aig || aig.x == null) return;
    const raw = { x: aig.x, y: aig.y, z: aig.z };

    // Only trust the gravity estimate when the phone is not in free fall or being yanked.
    const mag = len(raw);
    if (mag > 6 && mag < 14) {
      const k = 0.06;
      body.grav = { x: body.grav.x + (raw.x - body.grav.x) * k, y: body.grav.y + (raw.y - body.grav.y) * k, z: body.grav.z + (raw.z - body.grav.z) * k };
    }

    let lin;
    const a = e.acceleration;
    if (a && a.x != null) lin = { x: a.x, y: a.y, z: a.z };
    else lin = { x: raw.x - body.grav.x, y: raw.y - body.grav.y, z: raw.z - body.grav.z };

    const up = norm(body.grav);
    // The phone's own x-axis, flattened to horizontal, is "sideways" for the player.
    const xd = up.x;
    const side = norm({ x: 1 - xd * up.x, y: -xd * up.y, z: -xd * up.z });
    const v = dot(lin, up);
    const h = dot(lin, side);

    const T = thresholds();
    onMeter(h / T.side, v / (v >= 0 ? T.jump : T.duck));

    const now = performance.now();
    if (now < body.cooldownUntil) return;

    const crossing = Math.abs(h) > T.side || v > T.jump || v < -T.duck;
    if (!body.win && crossing) {
      // Start a short window: the first spike of a movement is followed by its
      // opposite (you speed up, then stop), so we look at the whole burst before deciding.
      const startedDown = v < -T.duck && Math.abs(h) <= T.side;
      body.win = {
        end: now + (startedDown ? 260 : 130),
        startedDown,
        maxV: v, minV: v,
        maxH: Math.abs(h),
        hSign: Math.abs(h) > T.side ? Math.sign(h) : 0,
      };
    }
    if (!body.win) return;

    const w = body.win;
    w.maxV = Math.max(w.maxV, v);
    w.minV = Math.min(w.minV, v);
    if (Math.abs(h) > w.maxH) w.maxH = Math.abs(h);
    if (!w.hSign && Math.abs(h) > T.side) w.hSign = Math.sign(h);
    if (now < w.end) return;

    body.win = null;
    const vertPeak = Math.max(w.maxV, -w.minV);
    let dir = null;

    if (w.hSign && w.maxH > vertPeak * 0.8) {
      dir = w.hSign > 0 ? 'right' : 'left';
    } else if (w.startedDown) {
      // A dip followed by a big push is a jump; a dip on its own is a crouch.
      dir = w.maxV > T.jump * 1.3 ? 'jump' : 'duck';
    } else if (w.maxV > T.jump) {
      dir = 'jump';
    } else if (w.minV < -T.duck) {
      dir = 'duck';
    }

    if (!dir) return;
    // Cooldowns cover the landing / standing-up / stopping spikes of the same move.
    const cool = { left: 420, right: 420, jump: 800, duck: 650 }[dir];
    body.cooldownUntil = now + cool;
    if (dir === 'duck') body.jumpHarderUntil = now + 1400; // standing back up is not a jump
    fire(dir);
  }

  // ---------------- Tilt mode (orientation) ----------------
  const tilt = { beta0: null, gamma0: null, sideArmed: true, vertArmed: true };

  function handleOrientation(e) {
    if (mode !== 'tilt' || e.beta == null) return;
    if (tilt.beta0 == null) { tilt.beta0 = e.beta; tilt.gamma0 = e.gamma; }
    const T = 22 / sens;
    const dg = e.gamma - tilt.gamma0;
    const db = e.beta - tilt.beta0;
    onMeter(dg / T, db / T);

    if (tilt.sideArmed && Math.abs(dg) > T) { tilt.sideArmed = false; fire(dg > 0 ? 'right' : 'left'); }
    if (!tilt.sideArmed && Math.abs(dg) < T * 0.45) tilt.sideArmed = true;

    if (tilt.vertArmed && Math.abs(db) > T) { tilt.vertArmed = false; fire(db > 0 ? 'jump' : 'duck'); }
    if (!tilt.vertArmed && Math.abs(db) < T * 0.45) tilt.vertArmed = true;
  }

  // ---------------- Permission & setup ----------------
  let listening = false;

  async function enable() {
    const needsAsk = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
    if (needsAsk) {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') throw new Error('Motion access was blocked. Allow it in Safari settings for this site, then reload.');
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(() => {});
      }
    }
    if (!window.isSecureContext) throw new Error('Motion needs an https:// link. Open the controller from the GitHub Pages address.');
    if (!listening) {
      window.addEventListener('devicemotion', handleMotion);
      window.addEventListener('deviceorientation', handleOrientation);
      listening = true;
    }
    recalibrate();
  }

  function recalibrate() {
    body.win = null;
    body.cooldownUntil = performance.now() + 500;
    tilt.beta0 = null;
    tilt.gamma0 = null;
    tilt.sideArmed = tilt.vertArmed = true;
  }

  return {
    enable,
    recalibrate,
    setMode(m) { mode = m; recalibrate(); },
    setSensitivity(s) { sens = s; },
    setSwap(b) { swap = b; },
    on(name, fn) { if (name === 'move') onMove = fn; if (name === 'meter') onMeter = fn; },
  };
})();
