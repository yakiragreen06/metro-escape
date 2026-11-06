# Metro Escape

An endless runner where **your body is the controller**. Trains, barriers and signal arms come down the tracks while the police chase you. Step sideways to change track, jump over barriers and crouch under signal arms, holding your phone so it can feel how you move.

Two devices:

- **The screen** (laptop, TV, tablet) opens `index.html` and shows the game plus a QR code.
- **The controller** (a phone) scans the QR code and opens `controller.html`. Its motion sensors detect your moves and send them straight to the screen.

No app to install and no server to run: it's a static website. The phone and the screen talk directly over WebRTC; the free PeerJS service only introduces them.

## Play it

1. Open the game on the big screen: `https://yakiragreen06.github.io/metro-escape/`
2. Scan the QR code with your phone (or open `controller.html` and type the 4-letter code).
3. On the phone, tap **Turn on motion** and allow motion access (iPhone asks once).
4. Jump (or tap **Start run**) to start.

| Move | What it does |
|---|---|
| Step left / right | Change track |
| Jump | Clear low red-and-white barriers |
| Crouch | Slide under yellow signal arms |

Running into a train or obstacle head-on gets you caught. Clipping something from the side makes you stumble and the police catch up; stumble again while they're close and it's over.

Keyboard works too on the screen: arrow keys or WASD, Space to jump.

## Control styles (on the phone)

- **Body**: hold the phone upright at your chest, screen facing you, and actually move. Where you stand is your track.
- **Tilt**: hold the phone flat like a remote. Tilt left/right, tip the top up to jump, down to duck.
- **Swipe**: no sensors, swipe on the pad.

The two bars show live sensor readings; a move fires when the marker passes a tick. If moves fire too easily or not at all, use the **Sensitivity** slider. If left and right come out backwards, tick **Swap left and right**.

## Publish with GitHub Pages

1. Push this folder to `https://github.com/yakiragreen06/metro-escape`.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / root → Save**.
3. After a minute the game is live at `https://yakiragreen06.github.io/metro-escape/`.

The phone needs an **https** link for motion sensors, which GitHub Pages gives you. For local testing on your computer, `python3 -m http.server` works for the screen and keyboard, but the phone controller needs https (use GitHub Pages or a tunnel like `npx localtunnel`).

## Files

```
index.html          the game screen
controller.html     the phone controller
css/style.css       shared styles
js/game.js          3D world, runner, obstacles, collisions, police (three.js)
js/link-host.js     screen side of the phone link + QR code
js/controller.js    phone side of the link, control styles, swipe pad
js/motion.js        turns accelerometer / tilt data into left, right, jump, duck
js/sound.js         small synthesized sound effects
```

Tuning knobs live at the top of `js/game.js` (speed, jump height, crouch time) and in `thresholds()` in `js/motion.js` (how hard you need to move).

## Ideas for next versions

- Joy-Con or Wii Remote support (Chrome's WebHID can read Joy-Con motion data)
- AirPods head tracking (needs a small native iPhone app, since browsers can't read it)
- Climbing on top of trains, moving trains, power-ups
- Two players, two phones, split tracks
