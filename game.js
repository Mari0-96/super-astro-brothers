/* Super Astro Brothers — a Mario-style funded-trader challenge game.
 * Plain JavaScript + Canvas. No build step. Works on GitHub Pages, Netlify, Vercel, or file://.
 *
 * Platform hooks: every game event fires a window CustomEvent ("astro:<name>") and a
 * postMessage to the parent window (when embedded in an iframe). See README.md.
 */
(() => {
'use strict';

// ---------- Config (tweak here) ----------
const CFG = {
  W: 800, H: 400, GROUND: 330, TILE: 32, LEVEL_W: 3400,
  GRAVITY: 0.6, JUMP: -12.5, SPEED: 3.2,
  FLAG_X: 3190, TITLE: 'Super Astro Brothers',
  WIN_TEXT: 'Keep 90% profits', HUD_NAME: 'ZEROG',
};
const ASSETS = {
  astro: 'assets/astro.png', hurt: 'assets/astro-attacked.png', coin: 'assets/coin.png',
  flag: 'assets/flag.png', block: 'assets/block.png', mushroom: 'assets/mushroom.png',
  m1: 'assets/monster-01.png', m2: 'assets/monster-02.png',
};

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const { W, H, GROUND: G, TILE: T, LEVEL_W: L } = CFG;
// Sharp on retina phones: draw at device pixel ratio, keep game coordinates at 800x400
const DPR = Math.min(window.devicePixelRatio || 1, 3);
cv.width = W * DPR; cv.height = H * DPR; ctx.scale(DPR, DPR);
ctx.imageSmoothingQuality = 'high';
cv.addEventListener('contextmenu', e => e.preventDefault()); // no long-press menu on touch

// ---------- Events for the host platform ----------
function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent('astro:' + name, { detail }));
  if (window.parent !== window)
    window.parent.postMessage({ source: 'super-astro-brothers', type: name, detail }, '*');
}

// ---------- Sound (tiny WebAudio synth, no files) ----------
let ac = null, muted = false;
function beep(f, d = 0.1, type = 'square', slide = 0, vol = 0.05) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}
const SFX = {
  jump: () => beep(300, .18, 'square', 400), coin: () => { beep(988, .07); setTimeout(() => beep(1319, .14), 60); },
  stomp: () => beep(200, .15, 'sawtooth', -120), hurt: () => beep(180, .3, 'sawtooth', -120),
  power: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .12), i * 80)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep(f, .2), i * 110)),
};

// ---------- Input ----------
const K = {};
let state = 'loading';
addEventListener('keydown', e => {
  K[e.code] = 1;
  if (e.code === 'KeyM') muted = !muted;
  if (state === 'title' && e.code !== 'KeyM') start();
  else if (state === 'win' && e.code === 'Enter') start();
  if (/^Arrow|Space/.test(e.code)) e.preventDefault();
});
addEventListener('keyup', e => (K[e.code] = 0));
[['btn-left', 'ArrowLeft'], ['btn-right', 'ArrowRight'], ['btn-jump', 'Space']].forEach(([id, code]) => {
  const b = document.getElementById(id); if (!b) return;
  const on = e => { e.preventDefault(); K[code] = 1; if (state === 'title') start(); if (state === 'win') start(); };
  const off = e => { e.preventDefault(); K[code] = 0; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
cv.addEventListener('pointerdown', () => { if (state === 'title' || state === 'win') start(); });

// ---------- Assets ----------
const IMG = {};
function load() {
  return Promise.all(Object.entries(ASSETS).map(([k, src]) => new Promise(res => {
    const i = new Image(); i.onload = () => { IMG[k] = i; res(); };
    i.onerror = () => { console.warn('Missing asset', src); res(); }; i.src = src;
  })));
}
// draw an image by height, anchored bottom-centre
function sprite(img, cx, bottom, h, flip = 1, rot = 0) {
  if (!img) return;
  const w = h * img.width / img.height;
  ctx.save(); ctx.translate(Math.round(cx), Math.round(bottom)); ctx.rotate(rot); ctx.scale(flip, 1);
  ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
}

// ---------- Game state ----------
let p, solids, coins, enemies, mush, cam, score, ncoin, t0, secs, funded, flash, tick, pops, confetti, shake, acc = 0, last = 0;
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function start() {
  state = 'play'; score = 0; ncoin = 0; secs = 1; funded = false; flash = 0; tick = 0; shake = 0;
  pops = []; confetti = []; cam = 0; t0 = performance.now();
  p = { x: 60, y: 200, w: 26, h: 58, vx: 0, vy: 0, on: false, dir: 1, squash: 0 };
  solids = [{ x: 0, y: G, w: L, h: 70, t: 'g' }];
  const row = (x0, y, types) => types.forEach((t, i) => solids.push({ x: x0 + i * T, y, w: T, h: T, t, used: 0 }));
  row(300, 230, ['b', 'q', 'b']); row(520, 298, ['b', 'b']); row(760, 298, ['b', 'b']);
  row(1000, 230, ['b', 'b', 'q', 'b']); row(1300, 298, ['b']); row(1700, 230, ['b', 'b']);
  row(1900, 230, ['m']); row(2200, 230, ['b', 'q', 'b', 'b']); row(2500, 298, ['b', 'b']);
  row(2560, 266, ['b']); row(3216, 298, ['b']);
  coins = [];
  const cr = (x0, y, n) => { for (let i = 0; i < n; i++) coins.push({ x: x0 + i * 30, y, got: 0 }); };
  cr(200, 300, 2); cr(420, 300, 3); cr(880, 300, 3); cr(1150, 185, 3); cr(1600, 300, 3);
  cr(2000, 185, 3); cr(2350, 300, 4); cr(2800, 300, 3);
  const mk = (x, a, b, img, h, label) => {
    const im = IMG[img]; const w = Math.round(h * (im ? im.width / im.height : .55) * .72);
    return { x, y: G - h, w, h, a, b, dir: -1, img, label, alive: 1, dead: 0 };
  };
  enemies = [mk(700, 620, 900, 'm2', 58, 'Challenge Phase-01'),
             mk(1500, 1380, 1740, 'm1', 74, 'Challenge Phase-02'),
             mk(2650, 2560, 3000, 'm1', 74, 'Challenge Phase-03')];
  mush = null; emit('start');
}

function popText(x, y, txt) { pops.push({ x, y, txt, t: 0 }); }
function bump(s) {
  if (s.t === 'q' && !s.used) { s.used = 1; ncoin++; score += 100; SFX.coin(); popText(s.x + 8, s.y - 6, '+100'); emit('coin', { coins: ncoin }); }
  if (s.t === 'm' && !s.used) { s.used = 1; mush = { x: s.x + 4, y: s.y - 40, w: 26, h: 36, rise: 0, got: 0 }; SFX.power(); }
}
function hurt() {
  if (funded) { funded = false; flash = 70; p.vy = -8; SFX.hurt(); emit('shield-lost'); return; }
  p.x = Math.max(60, p.x - 300); p.y = 200; p.vx = 0; p.vy = 0;
  score = Math.max(0, score - 200); flash = 70; shake = 12; SFX.hurt(); emit('hit', { score });
}

// ---------- Update ----------
function update() {
  tick++; secs = 1 + Math.floor((performance.now() - t0) / 1000);
  const l = K.ArrowLeft || K.KeyA, r = K.ArrowRight || K.KeyD, j = K.Space || K.ArrowUp || K.KeyW;
  p.vx = (r ? 1 : 0) * CFG.SPEED - (l ? 1 : 0) * CFG.SPEED; if (p.vx) p.dir = p.vx > 0 ? 1 : -1;
  if (j && p.on) { p.vy = CFG.JUMP; p.on = false; p.squash = -6; SFX.jump(); }
  p.vy = Math.min(p.vy + CFG.GRAVITY, 14);
  p.x = Math.max(0, Math.min(L - p.w, p.x + p.vx));
  for (const s of solids) if (hit(p, s)) p.x = p.vx > 0 ? s.x - p.w : s.x + s.w;
  const wasAir = !p.on; p.y += p.vy; p.on = false;
  for (const s of solids) if (hit(p, s)) {
    if (p.vy > 0) { p.y = s.y - p.h; p.on = true; if (wasAir && p.vy > 6) p.squash = 6; } else { p.y = s.y + s.h; bump(s); }
    p.vy = 0;
  }
  p.squash *= 0.8;
  for (const c of coins) if (!c.got && hit(p, { x: c.x - 10, y: c.y - 10, w: 20, h: 20 })) {
    c.got = 1; ncoin++; score += 100; SFX.coin(); popText(c.x, c.y - 12, '+100'); emit('coin', { coins: ncoin });
  }
  for (const e of enemies) {
    if (e.dead) { e.dead--; continue; }
    if (!e.alive) continue;
    e.x += e.dir * 1.1; if (e.x < e.a || e.x > e.b) e.dir *= -1;
    if (hit(p, e)) {
      if (p.vy > 0 && p.y + p.h - e.y < 26) {
        e.alive = 0; e.dead = 18; p.vy = -9; score += 500; shake = 5; SFX.stomp();
        popText(e.x, e.y - 20, '+500'); emit('phase-cleared', { phase: e.label });
      } else if (!flash) hurt();
    }
  }
  if (mush && !mush.got) {
    mush.rise = Math.min(mush.rise + 1.2, 36);
    const m = { x: mush.x, y: mush.y + 36 - mush.rise, w: mush.w, h: mush.h };
    if (mush.rise > 20 && hit(p, m)) { mush.got = 1; funded = true; score += 1000; SFX.power(); popText(p.x, p.y - 10, 'FUNDED!'); emit('funded'); }
  }
  if (flash) flash--; if (shake) shake--;
  pops.forEach(o => { o.t++; o.y -= .7; }); pops = pops.filter(o => o.t < 50);
  if (p.x > CFG.FLAG_X) win();
  cam = Math.max(0, Math.min(L - W, p.x - 300));
}
function win() {
  state = 'win'; const bonus = Math.max(0, 3000 - secs * 10); score += bonus; SFX.win();
  for (let i = 0; i < 90; i++) confetti.push({ x: Math.random() * W, y: -Math.random() * 200, vy: 1 + Math.random() * 3, vx: Math.random() * 2 - 1, c: ['#3ec28f', '#ffd23a', '#2e8bd8', '#fff', '#e8453c'][i % 5] });
  emit('win', { score, coins: ncoin, seconds: secs });
}

// ---------- Draw ----------
const px = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(a), Math.round(b), w, h); };
function brick(s) {
  px('#8a4b25', s.x, s.y, T, T); px('#5b2f14', s.x, s.y + 15, T, 2); px('#5b2f14', s.x, s.y + T - 2, T, 2);
  px('#5b2f14', s.x + 15, s.y, 2, 15); px('#5b2f14', s.x + 7, s.y + 17, 2, 15); px('#5b2f14', s.x + 23, s.y + 17, 2, 15);
  px('#a8643a', s.x, s.y, T, 2);
}
function qblock(s) {
  const bob = !s.used && Math.sin(tick / 14 + s.x) > .95 ? -2 : 0;
  if (IMG.block) ctx.drawImage(IMG.block, s.x, s.y + bob, T, T); else px('#ffc226', s.x, s.y, T, T);
  if (s.used) px('rgba(40,20,8,.55)', s.x, s.y, T, T);
}
function ground() {
  for (let i = 0; i < L; i += T) {
    px('#8a4b25', i, G + 12, T, 58); px('#6b3a1c', i + (i / T % 2 ? 4 : 18), G + 28, 10, 8); px('#6b3a1c', i + 10, G + 50, 12, 8);
    px('#8bb83b', i, G, T, 12); px('#a4c852', i, G, T, 5);
  }
}
function label(txt, cx, y, size = 10) {
  ctx.fillStyle = '#0b1e33'; ctx.font = `600 ${size}px "Chakra Petch", monospace`; ctx.textAlign = 'center'; ctx.fillText(txt, cx, y); ctx.textAlign = 'left';
}
function drawPlayer() {
  if (flash && tick % 6 < 3) return;
  const bob = p.on && p.vx ? Math.sin(tick * .5) * 2 : 0, rot = p.on && p.vx ? Math.sin(tick * .5) * .05 : 0;
  const h = 64 - p.squash, cx = p.x + p.w / 2, b = p.y + p.h + 3 + bob;
  if (funded) { ctx.save(); ctx.shadowColor = '#3ec28f'; ctx.shadowBlur = 18; sprite(IMG.astro, cx, b, h, p.dir, rot); ctx.restore(); }
  else sprite(flash ? IMG.hurt : IMG.astro, cx, b, h, p.dir, rot);
}
function draw() {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#27b4ef'); g.addColorStop(1, '#a5dcf5');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) { // parallax clouds
    const cx = (((i * 420 - cam * .4) % (W + 300)) + W + 300) % (W + 300) - 100, cy = 70 + (i % 3) * 45;
    px('#fff', cx, cy, 70, 18); px('#fff', cx + 14, cy - 12, 40, 14); px('#cfe9f7', cx, cy + 14, 70, 4);
  }
  ctx.save(); ctx.translate(-Math.round(cam) + (shake ? Math.random() * 4 - 2 : 0), shake ? Math.random() * 4 - 2 : 0);
  ground();
  for (const s of solids) { if (s.t === 'g') continue; s.t === 'b' ? brick(s) : qblock(s); }
  label('Get funded', 1916, 218, 11);
  for (const c of coins) if (!c.got) { const sq = Math.abs(Math.cos(tick / 14 + c.x)); ctx.save(); ctx.translate(c.x, c.y); ctx.scale(.3 + sq * .7, 1); if (IMG.coin) ctx.drawImage(IMG.coin, -10, -10, 20, 19); ctx.restore(); }
  if (mush && !mush.got) sprite(IMG.mushroom, mush.x + mush.w / 2, mush.y + 40 - mush.rise, 38);
  for (const e of enemies) {
    if (!e.alive && !e.dead) continue;
    if (e.dead) { ctx.save(); ctx.translate(e.x + e.w / 2, G); ctx.scale(1.2, .25); ctx.translate(-(e.x + e.w / 2), -G); sprite(IMG[e.img], e.x + e.w / 2, G, e.h); ctx.restore(); continue; }
    sprite(IMG[e.img], e.x + e.w / 2, G + 2, e.h, 1, Math.sin(tick * .2 + e.x) * .04);
    label(e.label, e.x + e.w / 2, e.y - 8);
  }
  sprite(IMG.flag, CFG.FLAG_X + 66, 298, 268); // pole base sits on the brick
  label('Keep 90%', CFG.FLAG_X + 106, 160, 11); label('profits', CFG.FLAG_X + 106, 174, 11);
  drawPlayer();
  pops.forEach(o => { ctx.globalAlpha = 1 - o.t / 50; ctx.fillStyle = '#fff'; ctx.font = '700 14px "Chakra Petch", monospace'; ctx.fillText(o.txt, o.x, o.y); ctx.globalAlpha = 1; });
  ctx.restore();
  hud();
  if (state === 'title' || state === 'win') overlay();
}
function hud() {
  ctx.fillStyle = '#fff'; ctx.font = '600 13px "Chakra Petch", monospace';
  ctx.fillText(CFG.HUD_NAME, 20, 24); ctx.fillText(String(score).padStart(6, '0'), 20, 40);
  if (IMG.coin) ctx.drawImage(IMG.coin, 140, 29, 12, 11);
  ctx.fillText('x' + String(ncoin).padStart(2, '0'), 158, 40);
  ctx.fillText('WORLD', 300, 24); ctx.fillText(String(Math.round(p.x)).padStart(6, '0'), 300, 40);
  ctx.fillText('TIME', 700, 24); ctx.fillText(String(secs).padStart(2, '0'), 700, 40);
  if (funded) { ctx.fillStyle = '#3ec28f'; ctx.fillText('FUNDED', 480, 40); }
}
function overlay() {
  ctx.fillStyle = 'rgba(11,30,51,.55)'; ctx.fillRect(0, 0, W, H);
  confetti.forEach(c => { c.x += c.vx; c.y += c.vy; if (c.y > H) c.y = -10; px(c.c, c.x, c.y, 6, 6); });
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = '40px "Alfa Slab One", Georgia, serif';
  ctx.fillText(state === 'title' ? CFG.TITLE : 'Challenge Passed!', W / 2, 150);
  if (state === 'title') sprite(IMG.astro, W / 2, 290, 100);
  ctx.font = '600 16px "Chakra Petch", monospace';
  ctx.fillText(state === 'title' ? 'Press any key or tap to start' : `${CFG.WIN_TEXT} · Score ${score} · Enter or tap to replay`, W / 2, state === 'title' ? 320 : 195);
  ctx.textAlign = 'left';
}

// ---------- Main loop (fixed 60 Hz step so speed is the same on 60/120/144 Hz screens) ----------
function frame(now) {
  acc += Math.min(now - last, 100); last = now;
  while (acc >= 1000 / 60) { if (state === 'play') update(); else tick++; acc -= 1000 / 60; }
  draw(); requestAnimationFrame(frame);
}
load().then(() => {
  document.getElementById('loading')?.remove();
  start(); state = 'title'; last = performance.now(); requestAnimationFrame(frame);
});
})();
