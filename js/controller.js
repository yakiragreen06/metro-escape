(() => {
  const PREFIX = 'metroescape-yg06-';
  const $ = (id) => document.getElementById(id);
  const LABEL = { left: 'Left', right: 'Right', jump: 'Jump', duck: 'Duck' };
  const HELP = {
    body: 'Hold the phone upright in front of your chest, screen facing you. Step sideways to change track, jump, and crouch. Where you stand is your track, so step back to the middle for the middle track.',
    tilt: 'Hold the phone flat like a remote. Tilt it left or right to change track, tip the top up to jump and down to duck, then bring it back level.',
    swipe: 'No sensors needed: swipe on the pad below.',
  };

  let peer = null;
  let conn = null;
  let room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

  function setStatus(on, text) {
    $('link-dot').classList.toggle('on', on);
    $('link-text').textContent = text;
  }

  function send(msg) { if (conn && conn.open) conn.send(msg); }

  // ---------------- Connection ----------------
  function connect(code) {
    room = code.toUpperCase();
    if (!window.Peer) { setStatus(false, 'Link unavailable, check internet'); return; }
    setStatus(false, 'Connecting…');
    if (!peer || peer.destroyed) {
      peer = new Peer();
      peer.on('open', () => openConn());
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') setStatus(false, `No screen with code ${room}`);
        else setStatus(false, 'Connection problem, retrying');
        setTimeout(() => { if (!conn || !conn.open) openConn(); }, 2500);
      });
    } else {
      openConn();
    }
    $('join-view').hidden = true;
    $('play-view').hidden = false;
  }

  function openConn() {
    if (peer.disconnected) peer.reconnect();
    conn = peer.connect(PREFIX + room.toLowerCase());
    conn.on('open', () => setStatus(true, `Connected to ${room}`));
    conn.on('close', () => setStatus(false, 'Disconnected, reconnecting'));
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hit' && navigator.vibrate) navigator.vibrate(msg.hard ? [200, 80, 200] : 120);
      if (msg.type === 'state') {
        $('start-btn').textContent = msg.state === 'over' ? 'Run again' : 'Start run';
        if (msg.state === 'over') flash(`${(msg.score || 0).toLocaleString()}`, false);
      }
    });
  }

  // Reconnect when the phone wakes up or comes back to this tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
      if (room && (!conn || !conn.open) && peer) openConn();
    }
  });

  // ---------------- Feedback ----------------
  let lightTimer = null;
  function flash(text, fired = true) {
    const light = $('light');
    light.textContent = text;
    light.classList.toggle('fired', fired);
    clearTimeout(lightTimer);
    lightTimer = setTimeout(() => light.classList.remove('fired'), 300);
  }

  function move(dir) {
    flash(LABEL[dir]);
    if (navigator.vibrate) navigator.vibrate(25);
    send({ type: 'move', dir });
  }

  const clampPct = (v) => 50 + Math.max(-2, Math.min(2, v)) * 25;
  Motion.on('meter', (side, vert) => {
    $('m-side').style.left = clampPct(side) + '%';
    $('m-vert').style.left = clampPct(vert) + '%';
  });
  Motion.on('move', move);

  // Keep the phone screen awake while playing.
  let wakeLock = null;
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } }
    catch { /* not supported: fine */ }
  }

  // ---------------- Controls ----------------
  $('motion-btn').addEventListener('click', async () => {
    try {
      await Motion.enable();
      await requestWakeLock();
      $('motion-btn').textContent = 'Motion on, hold still…';
      $('motion-btn').disabled = true;
      setTimeout(() => { $('motion-btn').hidden = true; flash('Ready', false); }, 700);
    } catch (err) {
      flash('No motion', false);
      $('mode-help').textContent = err.message || 'Motion sensors are not available here. Use Swipe instead.';
    }
  });

  document.querySelectorAll('.seg button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  function setMode(m) {
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    $('mode-help').textContent = HELP[m];
    $('swipe-pad').hidden = m !== 'swipe';
    $('meters').hidden = m === 'swipe';
    Motion.setMode(m);
    try { localStorage.setItem('metroEscapeMode', m); } catch { /* ignore */ }
  }

  $('sens').addEventListener('input', (e) => {
    Motion.setSensitivity(Number(e.target.value));
    try { localStorage.setItem('metroEscapeSens', e.target.value); } catch { /* ignore */ }
  });
  $('swap').addEventListener('change', (e) => {
    Motion.setSwap(e.target.checked);
    try { localStorage.setItem('metroEscapeSwap', e.target.checked ? '1' : '0'); } catch { /* ignore */ }
  });
  $('calib-btn').addEventListener('click', () => { Motion.recalibrate(); flash('Calibrated', false); });
  $('start-btn').addEventListener('click', () => send({ type: 'command', name: 'start' }));

  // Swipe pad
  let touchStart = null;
  const pad = $('swipe-pad');
  pad.addEventListener('touchstart', (e) => { const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; }, { passive: true });
  pad.addEventListener('touchmove', (e) => {
    if (!touchStart) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 35) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'jump' : 'duck'));
    touchStart = null;
  }, { passive: false });
  pad.addEventListener('touchend', () => { touchStart = null; });

  // ---------------- Boot ----------------
  try {
    const m = localStorage.getItem('metroEscapeMode');
    const s = localStorage.getItem('metroEscapeSens');
    const w = localStorage.getItem('metroEscapeSwap');
    if (s) { $('sens').value = s; Motion.setSensitivity(Number(s)); }
    if (w === '1') { $('swap').checked = true; Motion.setSwap(true); }
    setMode(m || 'body');
  } catch { setMode('body'); }

  $('join-btn').addEventListener('click', () => {
    const code = $('code-input').value.trim();
    if (code.length === 4) connect(code);
  });
  $('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('join-btn').click(); });

  if (room.length === 4) connect(room);
  else $('join-view').hidden = false;
})();
