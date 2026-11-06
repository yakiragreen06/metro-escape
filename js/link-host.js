// Screen side of the link: opens a PeerJS "room" and waits for the phone controller.
// Phone and screen talk directly (WebRTC). PeerJS's free public server is only used to introduce them.
const LinkHost = (() => {
  const PREFIX = 'metroescape-yg06-';
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O to avoid confusion
  let peer = null;
  let conn = null;
  let handlers = { move: () => {}, status: () => {}, command: () => {} };

  function randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return c;
  }

  function controllerUrl(code) {
    const base = location.href.replace(/[^/]*([?#].*)?$/, '');
    return `${base}controller.html?room=${code}`;
  }

  function showJoinInfo(code) {
    const url = controllerUrl(code);
    document.getElementById('room-code').textContent = code;
    document.getElementById('controller-url').textContent = url;
    const qrBox = document.getElementById('qr');
    qrBox.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrBox, { text: url, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
    }
  }

  function open(code = randomCode()) {
    if (!window.Peer) {
      handlers.status(false, 'Phone link unavailable (offline?)');
      return;
    }
    peer = new Peer(PREFIX + code.toLowerCase());

    peer.on('open', () => {
      showJoinInfo(code);
      handlers.status(false, 'Waiting for phone');
    });

    peer.on('connection', (c) => {
      if (conn) conn.close(); // newest phone wins
      conn = c;
      conn.on('open', () => handlers.status(true, 'Phone connected'));
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'move') handlers.move(msg.dir);
        if (msg.type === 'command') handlers.command(msg.name);
      });
      conn.on('close', () => {
        if (conn === c) { conn = null; handlers.status(false, 'Phone disconnected'); }
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer.destroy();
        open(randomCode());
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        handlers.status(false, 'Link server unreachable, retrying');
        setTimeout(() => { if (peer && peer.disconnected) peer.reconnect(); }, 2000);
      } else {
        console.warn('Peer error', err);
      }
    });

    peer.on('disconnected', () => {
      setTimeout(() => { if (peer && !peer.destroyed) peer.reconnect(); }, 1500);
    });
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  return {
    open,
    send,
    on(name, fn) { handlers[name] = fn; },
  };
})();
