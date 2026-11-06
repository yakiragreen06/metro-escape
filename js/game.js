// Metro Escape: endless runner controlled by body movement (phone controller) or keyboard.
(() => {
  // ---------------- Tunables ----------------
  const LANES = [-2.6, 0, 2.6];
  const START_SPEED = 13;
  const MAX_SPEED = 32;
  const ACCEL = 0.2;            // speed gained per second
  const GRAVITY = 26;
  const JUMP_V = 9.6;           // ~0.75 s airtime, ~1.8 m high
  const DUCK_TIME = 0.8;        // seconds a crouch lasts
  const LANE_SPEED = 14;        // how fast the runner slides between tracks
  const SPAWN_Z = -130;
  const POLICE_GRACE = 5;       // seconds the police stay close after a stumble

  const COLORS = {
    sky: 0x2b2350, fog: 0x2b2350, ground: 0x4a4458, bed: 0x2f2a3a, rail: 0xb9b2c9,
    sleeper: 0x5b4a3e, hoodie: 0xffb547, pants: 0x2a2f45, skin: 0xd9a27a,
    train: 0x2e8b7a, trainDark: 0x1f5f54, police: 0x1d2f6f, coin: 0xffd23f,
  };

  // ---------------- Three.js setup ----------------
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 35, 135);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
  camera.position.set(0, 4.3, 8);
  camera.lookAt(0, 1.2, -8);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  scene.add(new THREE.HemisphereLight(0x9a8fe0, 0x3a2f2a, 0.95));
  const sun = new THREE.DirectionalLight(0xffc070, 0.75);
  sun.position.set(-6, 12, 6);
  scene.add(sun);

  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  function stripeTexture(c1, c2, stripes = 6) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 32;
    const g = cv.getContext('2d');
    const w = cv.width / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? c2 : c1;
      g.beginPath();
      g.moveTo(i * w, 0); g.lineTo(i * w + w, 0); g.lineTo(i * w + w - 12, 32); g.lineTo(i * w - 12, 32);
      g.fill();
    }
    return new THREE.CanvasTexture(cv);
  }

  // Building facades: a wall texture plus a matching glow map so lit windows shine at dusk.
  function windowTextures() {
    const wall = document.createElement('canvas');
    const glow = document.createElement('canvas');
    wall.width = glow.width = 64; wall.height = glow.height = 128;
    const gw = wall.getContext('2d'), gg = glow.getContext('2d');
    gw.fillStyle = '#ffffff'; gw.fillRect(0, 0, 64, 128);
    gg.fillStyle = '#000000'; gg.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 128; y += 16) {
      for (let x = 6; x < 64; x += 14) {
        const lit = Math.random() < 0.35;
        gw.fillStyle = lit ? '#fff1c9' : '#4a4466';
        gw.fillRect(x, y, 8, 9);
        if (lit) { gg.fillStyle = '#ffc56a'; gg.fillRect(x, y, 8, 9); }
      }
    }
    return { wall, glow };
  }

  // ---------------- World: ground, tracks, scenery ----------------
  const ground = box(60, 0.2, 320, mat(COLORS.ground));
  ground.position.set(0, -0.1, -120);
  scene.add(ground);

  const railMat = mat(COLORS.rail);
  LANES.forEach((x) => {
    const bed = box(2.4, 0.06, 320, mat(COLORS.bed));
    bed.position.set(x, 0.01, -120);
    scene.add(bed);
    [-0.7, 0.7].forEach((off) => {
      const r = box(0.1, 0.12, 320, railMat);
      r.position.set(x + off, 0.1, -120);
      scene.add(r);
    });
  });

  // Sleepers live in one group that scrolls and wraps, so motion looks continuous.
  const SLEEPER_GAP = 1.4;
  const sleepers = new THREE.Group();
  const sleeperMat = mat(COLORS.sleeper);
  for (let z = -150; z < 14; z += SLEEPER_GAP) {
    LANES.forEach((x) => {
      const s = box(2.0, 0.08, 0.3, sleeperMat);
      s.position.set(x, 0.05, z);
      sleepers.add(s);
    });
  }
  scene.add(sleepers);

  // Street lamps on both sides, also a wrapping group.
  const LAMP_GAP = 18;
  const lamps = new THREE.Group();
  const postMat = mat(0x3d3852);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc35c });
  for (let z = -162; z < 18; z += LAMP_GAP) {
    [-5.4, 5.4].forEach((x) => {
      const post = box(0.18, 5, 0.18, postMat);
      post.position.set(x, 2.5, z);
      const arm = box(1.2, 0.12, 0.12, postMat);
      arm.position.set(x - Math.sign(x) * 0.55, 5, z);
      const bulb = box(0.5, 0.2, 0.35, bulbMat);
      bulb.position.set(x - Math.sign(x) * 1.0, 4.9, z);
      lamps.add(post, arm, bulb);
    });
  }
  scene.add(lamps);

  // Buildings: individually recycled so the skyline varies.
  const facade = windowTextures();
  const buildingTints = [0x6a5f9c, 0x7d6aa8, 0x5a5584, 0x8a6f8f, 0x4f6a8a];
  const buildings = [];
  function placeBuilding(b, z) {
    const w = 4 + Math.random() * 5, h = 7 + Math.random() * 18, d = 5 + Math.random() * 6;
    b.scale.set(w, h, d);
    b.position.set(b.userData.side * (9 + w / 2 + Math.random() * 3), h / 2, z);
    const rx = Math.max(1, Math.round(w / 2.5)), ry = Math.max(1, Math.round(h / 4));
    b.material.map.repeat.set(rx, ry);
    b.material.emissiveMap.repeat.set(rx, ry);
  }
  for (let i = 0; i < 26; i++) {
    const map = new THREE.CanvasTexture(facade.wall);
    const glow = new THREE.CanvasTexture(facade.glow);
    [map, glow].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      mat(buildingTints[i % buildingTints.length], { map, emissive: 0xffffff, emissiveMap: glow }));
    b.userData.side = i % 2 ? 1 : -1;
    placeBuilding(b, 10 - Math.floor(i / 2) * 12);
    buildings.push(b);
    scene.add(b);
  }

  // ---------------- Characters ----------------
  function makePerson(bodyColor, legColor, isPolice) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const torso = box(0.7, 0.8, 0.42, mat(bodyColor));
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mat(COLORS.skin));
    head.position.y = 1.78;
    body.add(torso, head);

    if (isPolice) {
      const cap = box(0.5, 0.14, 0.5, mat(0x111a3d));
      cap.position.y = 2.02;
      const brim = box(0.5, 0.04, 0.2, mat(0x111a3d));
      brim.position.set(0, 1.96, -0.3);
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe63946 }));
      const blue = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3a86ff }));
      red.position.set(-0.12, 2.14, 0);
      blue.position.set(0.12, 2.14, 0);
      body.add(cap, brim, red, blue);
      g.userData.lights = [red, blue];
    } else {
      const hood = box(0.56, 0.2, 0.5, mat(bodyColor));
      hood.position.set(0, 1.98, 0.05);
      body.add(hood);
    }

    const limbs = {};
    const legMat = mat(legColor);
    const armMat = mat(bodyColor);
    [['legL', -0.18, legMat, 0.75, 0.24], ['legR', 0.18, legMat, 0.75, 0.24],
     ['armL', -0.47, armMat, 0.7, 0.18], ['armR', 0.47, armMat, 0.7, 0.18]].forEach(([name, x, m, len, thick]) => {
      const pivot = new THREE.Group();
      const isLeg = name.startsWith('leg');
      pivot.position.set(x, isLeg ? 0.78 : 1.5, 0);
      const limb = box(thick, len, thick, m);
      limb.position.y = -len / 2;
      pivot.add(limb);
      body.add(pivot);
      limbs[name] = pivot;
    });
    g.userData.limbs = limbs;
    g.userData.body = body;
    return g;
  }

  function animateRun(person, t, rate) {
    const s = Math.sin(t * rate);
    const L = person.userData.limbs;
    L.legL.rotation.x = s * 0.9;
    L.legR.rotation.x = -s * 0.9;
    L.armL.rotation.x = -s * 0.8;
    L.armR.rotation.x = s * 0.8;
    person.userData.body.position.y = Math.abs(Math.cos(t * rate)) * 0.08;
  }

  const runner = makePerson(COLORS.hoodie, COLORS.pants, false);
  scene.add(runner);
  const officer = makePerson(COLORS.police, 0x111a3d, true);
  officer.position.set(0, 0, 10);
  scene.add(officer);

  // ---------------- Obstacles & coins ----------------
  const barrierTex = stripeTexture('#e63946', '#fdf8ef');
  const signalTex = stripeTexture('#ffb547', '#15112b');
  const objects = []; // {mesh, type, lane, halfZ}
  const coins = [];

  function makeBarrier() {
    const g = new THREE.Group();
    const board = box(2.1, 0.45, 0.2, new THREE.MeshLambertMaterial({ map: barrierTex }));
    board.position.y = 0.7;
    const legM = mat(0xd9d4cc);
    [-0.85, 0.85].forEach((x) => { const l = box(0.12, 0.9, 0.12, legM); l.position.set(x, 0.45, 0); g.add(l); });
    g.add(board);
    return { mesh: g, halfZ: 0.25 };
  }

  function makeSignalArm() {
    const g = new THREE.Group();
    const arm = box(2.3, 0.7, 0.25, new THREE.MeshLambertMaterial({ map: signalTex }));
    arm.position.y = 1.85;
    const postM = mat(0x3d3852);
    [-1.1, 1.1].forEach((x) => { const p = box(0.15, 2.6, 0.15, postM); p.position.set(x, 1.3, 0); g.add(p); });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe63946 }));
    lamp.position.set(0, 2.38, 0.1);
    g.add(arm, lamp);
    return { mesh: g, halfZ: 0.25 };
  }

  function makeTrain(len) {
    const g = new THREE.Group();
    const bodyM = mat(COLORS.train);
    const shell = box(2.2, 2.9, len, bodyM);
    shell.position.y = 1.6;
    const stripe = box(2.24, 0.5, len - 0.4, new THREE.MeshLambertMaterial({ color: 0xfdf8ef }));
    stripe.position.y = 2.1;
    const skirt = box(2.0, 0.35, len - 0.6, mat(COLORS.trainDark));
    skirt.position.y = 0.2;
    const windshield = box(1.7, 0.8, 0.05, new THREE.MeshLambertMaterial({ color: 0x1b2440 }));
    windshield.position.set(0, 2.3, len / 2 + 0.01);
    const lightM = new THREE.MeshBasicMaterial({ color: 0xfff2c4 });
    [-0.7, 0.7].forEach((x) => { const l = box(0.3, 0.2, 0.05, lightM); l.position.set(x, 0.9, len / 2 + 0.02); g.add(l); });
    g.add(shell, stripe, skirt, windshield);
    return { mesh: g, halfZ: len / 2 };
  }

  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18);
  const coinMat = new THREE.MeshLambertMaterial({ color: COLORS.coin, emissive: 0x6b4a00 });
  function addCoin(lane, z, y) {
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.rotation.x = Math.PI / 2;
    c.position.set(LANES[lane], y, z);
    scene.add(c);
    coins.push({ mesh: c, lane });
  }

  function addObstacle(type, lane, z, len) {
    const made = type === 'barrier' ? makeBarrier() : type === 'signal' ? makeSignalArm() : makeTrain(len);
    made.mesh.position.set(LANES[lane], 0, z - made.halfZ);
    scene.add(made.mesh);
    objects.push({ mesh: made.mesh, type, lane, halfZ: made.halfZ });
  }

  function planRow() {
    const pick = () => {
      const r = Math.random();
      if (r < 0.34) return 'empty';
      if (r < 0.54) return 'barrier';
      if (r < 0.72) return 'signal';
      return 'train';
    };
    let lanes;
    do { lanes = [pick(), pick(), pick()]; }
    while (lanes.every((t) => t === 'train') || lanes.every((t) => t === 'empty'));
    const lens = lanes.map((t) => (t === 'train' ? 10 + Math.random() * 8 : 0.5));
    return { lanes, lens, depth: Math.max(...lens) };
  }

  function spawnRow(row) {
    row.lanes.forEach((t, lane) => { if (t !== 'empty') addObstacle(t, lane, SPAWN_Z, row.lens[lane]); });
    // A line of coins in one lane you can get through.
    const options = row.lanes.map((t, i) => i).filter((i) => row.lanes[i] !== 'train');
    const lane = options[Math.floor(Math.random() * options.length)];
    const t = row.lanes[lane];
    for (let i = 0; i < 6; i++) {
      const dz = (i - 2.5) * 1.6;
      let y = 0.9;
      if (t === 'barrier') y = 0.9 + Math.max(0, 1.6 - Math.abs(dz) * 0.35);
      if (t === 'signal') y = 0.6;
      addCoin(lane, SPAWN_Z + dz + 2, y);
    }
  }

  function clearWorld() {
    objects.forEach((o) => scene.remove(o.mesh));
    coins.forEach((c) => scene.remove(c.mesh));
    objects.length = 0;
    coins.length = 0;
  }

  // ---------------- Game state ----------------
  const ui = {
    score: document.getElementById('score'),
    coins: document.getElementById('coins'),
    start: document.getElementById('start-screen'),
    over: document.getElementById('over-screen'),
    finalScore: document.getElementById('final-score'),
    finalDetail: document.getElementById('final-detail'),
    best: document.getElementById('best-line'),
    countdown: document.getElementById('countdown'),
    lastMove: document.getElementById('last-move'),
    siren: document.getElementById('siren'),
    dot: document.getElementById('link-dot'),
    linkText: document.getElementById('link-text'),
  };

  let state = 'menu'; // menu | countdown | playing | caught | over
  let speed, distance, coinCount, elapsed, policeClose, nextRow, gapLeft, caughtAt;
  const p = { lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, duck: 0, immune: 0 };

  function readBest() { try { return Number(localStorage.getItem('metroEscapeBest')) || 0; } catch { return 0; } }
  function saveBest(v) { try { localStorage.setItem('metroEscapeBest', String(v)); } catch { /* storage blocked */ } }

  function score() { return Math.floor(distance * 0.5) + coinCount * 10; }

  function reset() {
    clearWorld();
    speed = START_SPEED; distance = 0; coinCount = 0; elapsed = 0; policeClose = 0; caughtAt = 0;
    Object.assign(p, { lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, duck: 0, immune: 0 });
    runner.position.set(0, 0, 0);
    runner.scale.set(1, 1, 1);
    runner.rotation.set(0, 0, 0);
    officer.position.set(0, 0, 10);
    nextRow = planRow();
    gapLeft = 30;
    ui.score.textContent = '0';
    ui.coins.textContent = '0';
  }

  function startCountdown() {
    Sound.unlock();
    reset();
    ui.start.hidden = true;
    ui.over.hidden = true;
    document.getElementById('hud').querySelector('div').style.visibility = 'visible';
    state = 'countdown';
    LinkHost.send({ type: 'state', state: 'countdown' });
    let n = 3;
    ui.countdown.hidden = false;
    ui.countdown.textContent = n;
    Sound.beep(false);
    const iv = setInterval(() => {
      n--;
      if (n > 0) { ui.countdown.textContent = n; Sound.beep(false); return; }
      clearInterval(iv);
      ui.countdown.textContent = 'Run!';
      Sound.beep(true);
      Sound.siren();
      state = 'playing';
      LinkHost.send({ type: 'state', state: 'playing' });
      setTimeout(() => { ui.countdown.hidden = true; }, 500);
    }, 800);
  }

  function getCaught(reason) {
    if (state !== 'playing') return;
    state = 'caught';
    caughtAt = performance.now();
    Sound.crash();
    LinkHost.send({ type: 'hit', hard: true });
    const s = score();
    const best = Math.max(readBest(), s);
    saveBest(best);
    LinkHost.send({ type: 'state', state: 'over', score: s });
    setTimeout(() => {
      state = 'over';
      ui.finalScore.textContent = s.toLocaleString();
      ui.finalDetail.textContent = `${reason} You ran ${Math.floor(distance)} m and grabbed ${coinCount} coins.`;
      ui.best.textContent = s >= best && s > 0 ? 'New personal best.' : `Best: ${best.toLocaleString()}`;
      ui.over.hidden = false;
    }, 1300);
  }

  function stumble() {
    p.lane = p.prevLane; // bounce back to the track we came from
    p.immune = 0.6;      // a moment to recover before the next hit counts
    LinkHost.send({ type: 'hit', hard: false });
    if (policeClose > 0) { getCaught('You stumbled twice and the police grabbed you.'); return; }
    policeClose = POLICE_GRACE;
    Sound.stumble();
    Sound.siren();
  }

  // ---------------- Input ----------------
  const MOVE_LABEL = { left: 'Left', right: 'Right', jump: 'Jump', duck: 'Duck' };
  let moveLabelTimer = null;

  function input(dir) {
    if (!MOVE_LABEL[dir]) return;
    ui.lastMove.textContent = MOVE_LABEL[dir];
    ui.lastMove.classList.add('show');
    clearTimeout(moveLabelTimer);
    moveLabelTimer = setTimeout(() => ui.lastMove.classList.remove('show'), 450);

    if (state === 'menu' && dir === 'jump') { startCountdown(); return; }
    if (state === 'over' && dir === 'jump' && performance.now() - caughtAt > 2000) { startCountdown(); return; }
    if (state !== 'playing') return;

    const grounded = p.y <= 0.001;
    if (dir === 'left' && p.lane > 0) { p.prevLane = p.lane; p.lane--; Sound.lane(); }
    if (dir === 'right' && p.lane < 2) { p.prevLane = p.lane; p.lane++; Sound.lane(); }
    if (dir === 'jump' && grounded) { p.vy = JUMP_V; p.duck = 0; Sound.jump(); }
    if (dir === 'duck') {
      if (!grounded) p.vy = -16; // slam down
      p.duck = DUCK_TIME;
      Sound.duck();
    }
  }

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'duck', KeyS: 'duck',
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
    const d = KEYS[e.code];
    if (d) { e.preventDefault(); Sound.unlock(); input(d); }
  });

  document.getElementById('start-btn').addEventListener('click', startCountdown);
  document.getElementById('restart-btn').addEventListener('click', startCountdown);

  LinkHost.on('move', input);
  LinkHost.on('command', (name) => {
    if (name === 'start' && (state === 'menu' || state === 'over')) startCountdown();
  });
  LinkHost.on('status', (connected, text) => {
    ui.dot.classList.toggle('on', connected);
    ui.linkText.textContent = text;
    if (connected) LinkHost.send({ type: 'state', state });
  });
  LinkHost.open();

  // ---------------- Collision ----------------
  function checkHits() {
    if (p.immune > 0) return;
    const top = p.duck > 0 ? 0.95 : 1.95;
    for (const o of objects) {
      const front = o.mesh.position.z + o.halfZ;   // edge facing the runner
      const back = o.mesh.position.z - o.halfZ;
      if (front < -0.3 || back > 0.3) continue;      // not level with the runner
      if (Math.abs(p.x - LANES[o.lane]) > (o.type === 'train' ? 1.1 : 1.0) + 0.3) continue;

      let hit = false;
      if (o.type === 'train') hit = true;
      if (o.type === 'barrier') hit = p.y < 0.95;
      if (o.type === 'signal') hit = p.y + top > 1.5;
      if (!hit) continue;

      const sliding = Math.abs(p.x - LANES[p.lane]) > 0.35;
      const fromSide = sliding && (o.type !== 'train' || front > 0.9);
      if (fromSide) { stumble(); return; }
      const why = o.type === 'train' ? 'You ran into a train.' : o.type === 'barrier' ? 'You tripped on a barrier.' : 'You hit a signal arm.';
      getCaught(why);
      return;
    }
  }

  // ---------------- Main loop ----------------
  let last = performance.now();
  let clock = 0;
  let sirenTick = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    const moving = state === 'playing';
    const worldSpeed = moving ? speed : (state === 'menu' ? 8 : 0);
    const dz = worldSpeed * dt;

    // Scenery always scrolls (slowly on the menu) for a living backdrop.
    sleepers.position.z = (sleepers.position.z + dz) % SLEEPER_GAP;
    lamps.position.z = (lamps.position.z + dz) % LAMP_GAP;
    for (const b of buildings) {
      b.position.z += dz;
      if (b.position.z - b.scale.z / 2 > 14) placeBuilding(b, b.position.z - 13 * 12);
    }

    if (moving) {
      elapsed += dt;
      speed = Math.min(MAX_SPEED, START_SPEED + elapsed * ACCEL);
      distance += dz;

      // Spawn rows with enough clear track between them to react.
      gapLeft -= dz;
      if (gapLeft <= 0) {
        const row = nextRow;
        spawnRow(row);
        nextRow = planRow();
        gapLeft = row.depth / 2 + nextRow.depth / 2 + 7 + speed * 0.45 + Math.random() * 8;
      }

      for (let i = objects.length - 1; i >= 0; i--) {
        const o = objects[i];
        o.mesh.position.z += dz;
        if (o.mesh.position.z - o.halfZ > 12) { scene.remove(o.mesh); objects.splice(i, 1); }
      }
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.mesh.position.z += dz;
        c.mesh.rotation.z += dt * 4;
        const z = c.mesh.position.z;
        const yMid = p.y + (p.duck > 0 ? 0.5 : 1.0);
        if (Math.abs(z) < 0.7 && Math.abs(p.x - c.mesh.position.x) < 0.9 && Math.abs(c.mesh.position.y - yMid) < 1.1) {
          coinCount++;
          Sound.coin();
          scene.remove(c.mesh); coins.splice(i, 1);
          continue;
        }
        if (z > 12) { scene.remove(c.mesh); coins.splice(i, 1); }
      }

      // Runner physics
      p.x += Math.sign(LANES[p.lane] - p.x) * Math.min(Math.abs(LANES[p.lane] - p.x), LANE_SPEED * dt);
      p.vy -= GRAVITY * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
      if (p.duck > 0) p.duck -= dt;
      if (p.immune > 0) p.immune -= dt;

      checkHits();

      if (policeClose > 0) policeClose -= dt;
      ui.score.textContent = score().toLocaleString();
      ui.coins.textContent = coinCount;
    }

    // Runner pose
    runner.position.set(p.x, p.y, 0);
    const ducking = p.duck > 0 && state === 'playing';
    runner.scale.y += ((ducking ? 0.52 : 1) - runner.scale.y) * Math.min(1, dt * 18);
    if (state === 'playing' || state === 'menu' || state === 'countdown') {
      if (p.y > 0) {
        const L = runner.userData.limbs;
        L.legL.rotation.x = 0.9; L.legR.rotation.x = -0.4; L.armL.rotation.x = -2.4; L.armR.rotation.x = -2.4;
      } else {
        animateRun(runner, clock, state === 'countdown' ? 0 : 9 + worldSpeed * 0.25);
      }
      runner.rotation.z = (LANES[p.lane] - p.x) * -0.08;
    }

    // Police officer: hidden behind the camera unless you have stumbled.
    let oz = 10;
    if (state === 'playing' && policeClose > 0) oz = 2.6;
    if (state === 'caught' || state === 'over') oz = 1.0;
    officer.position.z += (oz - officer.position.z) * Math.min(1, dt * 3);
    officer.position.x += (p.x - officer.position.x) * Math.min(1, dt * 4);
    if (state !== 'over') animateRun(officer, clock + 0.5, 11);
    const flip = Math.floor(clock * 6) % 2;
    officer.userData.lights[0].visible = flip === 0;
    officer.userData.lights[1].visible = flip === 1;

    // Screen-edge siren glow while police are close
    const sirenOn = (state === 'playing' && policeClose > 0) || state === 'caught';
    ui.siren.className = 'siren-flash' + (sirenOn ? (flip ? ' blue' : ' red') : '');
    if (sirenOn) { sirenTick -= dt; if (sirenTick <= 0) { Sound.siren(); sirenTick = 0.75; } }

    if (state === 'caught') {
      runner.rotation.x += (-0.5 - runner.rotation.x) * Math.min(1, dt * 6);
    }

    // Camera follows the runner sideways a little.
    camera.position.x += (p.x * 0.55 - camera.position.x) * Math.min(1, dt * 6);
    camera.lookAt(p.x * 0.3, 1.2, -8);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  reset();
  document.getElementById('hud').querySelector('div').style.visibility = 'hidden';
  requestAnimationFrame(frame);
})();
