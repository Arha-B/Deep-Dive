'use strict';

// ════════════════════════════════════════════════════════════
//  CONSTANTS  — numbers that never change during the game
// ════════════════════════════════════════════════════════════

// The canvas (the visible window) is always 640×400 logical pixels.
const W = 640;
const H = 400;

// The actual ocean world is much larger than the screen.
// The camera scrolls around inside it.
const WORLD_W = 2400;
const WORLD_H = 1800;

// The waterline in world coordinates (everything above this is "at the surface").
const SURFACE_Y = 180;

// How big to draw the player and chest sprites.
const PLAYER_SCALE = 2.0;
const CHEST_SCALE  = 1.8;


// ════════════════════════════════════════════════════════════
//  CANVAS SETUP
// ════════════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

// On retina / HiDPI screens, devicePixelRatio is 2 or 3,
// meaning there are 2-3 real pixels per CSS pixel.
// We make the canvas that many times bigger physically,
// then scale the drawing context back down so that all our
// coordinates still work as if the canvas were 640×400.
// This makes text and UI look sharp instead of blurry.
const DPR = Math.min(window.devicePixelRatio || 1, 3);
canvas.width  = W * DPR;
canvas.height = H * DPR;
ctx.scale(DPR, DPR);

// Keep pixel art sprites crisp (no blurring when scaled up).
ctx.imageSmoothingEnabled = false;

// Shorthand — the whole codebase uses 'g' for the drawing context.
const g = ctx;

// Scale the canvas CSS size to fill the browser window while keeping aspect ratio.
function resize() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width  = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}
addEventListener('resize', resize);
resize();


// ════════════════════════════════════════════════════════════
//  SPRITE SHEETS
//  Each entry maps a name to its image file and grid info.
//  frames = total animation frames
//  cols   = how many frames are laid out left-to-right
//  rows   = how many rows of frames the image has
// ════════════════════════════════════════════════════════════

const SHEET = {
  idle:    { file: 'player-idle.png',    frames: 6, cols: 6, rows: 1 },
  swim:    { file: 'player-swiming.png', frames: 7, cols: 7, rows: 1 },
  fast:    { file: 'player-fast.png',    frames: 5, cols: 5, rows: 1 },
  rush:    { file: 'player-rush.png',    frames: 7, cols: 7, rows: 1 },
  hurt:    { file: 'player-hurt.png',    frames: 5, cols: 5, rows: 1 },
  fish:    { file: 'fish.png',           frames: 4, cols: 4, rows: 1 },
  fishbig: { file: 'fish-big.png',       frames: 4, cols: 4, rows: 1 },
  dart:    { file: 'fish-dart.png',      frames: 4, cols: 4, rows: 1 },
  mine:    { file: 'mine.png',           frames: 1, cols: 1, rows: 1 },
  minebig: { file: 'mine-big.png',       frames: 1, cols: 1, rows: 1 },
  minesml: { file: 'mine-small.png',     frames: 1, cols: 1, rows: 1 },
  // Chest sprite sheet: 128×192px, 2 columns × 3 rows = 6 frames of 64×64 each.
  chest:   { file: 'treasure-chest.png', frames: 2, cols: 2, rows: 3 },
  map:     { file: 'map.PNG',            frames: 1, cols: 1, rows: 1 },
};

// IMG holds the loaded Image objects, keyed by the same names as SHEET.
const IMG = {};
let imagesLoaded = 0;
const totalImages = Object.keys(SHEET).length;

// Loop through every sprite sheet entry and start loading its image.
for (const [key, info] of Object.entries(SHEET)) {
  const img  = new Image();
  // Whether the image loads successfully or fails, count it.
  // Once all images are counted, start the game.
  img.onload  = () => { imagesLoaded++; if (imagesLoaded === totalImages) boot(); };
  img.onerror = () => { imagesLoaded++; if (imagesLoaded === totalImages) boot(); };
  img.src     = info.file;
  IMG[key]    = img;
}

// Returns the pixel width of one frame of a sprite at a given scale.
function spriteW(key, scale) {
  const img = IMG[key];
  if (!img.naturalWidth) return 16 * scale; // fallback if not loaded yet
  return Math.floor(img.naturalWidth / SHEET[key].cols) * scale;
}

// Returns the pixel height of one frame of a sprite at a given scale.
function spriteH(key, scale) {
  const img = IMG[key];
  if (!img.naturalHeight) return 16 * scale;
  return Math.floor(img.naturalHeight / SHEET[key].rows) * scale;
}

// Draws a single animation frame from a sprite sheet.
// key    = which sprite (e.g. 'fish')
// frame  = which column (0-based)
// row    = which row (0-based)
// dx, dy = where to draw on screen (top-left corner)
// scale  = size multiplier
// flipX  = mirror horizontally (for left-facing sprites)
function drawSprite(key, frame, row, dx, dy, scale, flipX) {
  const sheet = SHEET[key];
  const img   = IMG[key];
  if (!img.naturalWidth) return; // image not ready yet

  // Work out the pixel size of one frame in the source image.
  const frameW = Math.floor(img.naturalWidth  / sheet.cols);
  const frameH = Math.floor(img.naturalHeight / sheet.rows);

  // How big to draw it on screen.
  const drawW = frameW * scale;
  const drawH = frameH * scale;

  // A small inset (0.5px) prevents adjacent frames from bleeding into each other.
  const inset = 0.5;
  const srcX  = frame * frameW + inset;
  const srcY  = row   * frameH + inset;
  const srcW  = frameW - inset * 2;
  const srcH  = frameH - inset * 2;

  g.save();
  if (flipX) {
    // To flip horizontally: move origin to the right edge, then scale X by -1.
    g.translate(dx + drawW, dy);
    g.scale(-1, 1);
    g.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, drawW, drawH);
  } else {
    g.drawImage(img, srcX, srcY, srcW, srcH, dx, dy, drawW, drawH);
  }
  g.restore();
}


// ════════════════════════════════════════════════════════════
//  INPUT
// ════════════════════════════════════════════════════════════

// We track which keys are currently held down in a Set.
// A Set is like an array that automatically ignores duplicates.
const KEYS = new Set();

addEventListener('keydown', function(e) {
  // Escape or P toggles pause while playing.
  const isPauseKey = e.code === 'Escape' || e.code === 'KeyP';
  if (isPauseKey && STATE === 'playing') {
    STATE = 'paused';
    KEYS.clear(); // clear held keys so nothing fires on unpause
    e.preventDefault();
    return;
  }
  if (isPauseKey && STATE === 'paused') {
    STATE = 'playing';
    KEYS.clear();
    e.preventDefault();
    return;
  }
  KEYS.add(e.code);
  e.preventDefault(); // stop arrow keys from scrolling the page
});

addEventListener('keyup', function(e) {
  KEYS.delete(e.code);
});

// Simple helper functions so movement checks read clearly.
function isLeft()   { return KEYS.has('ArrowLeft')  || KEYS.has('KeyA'); }
function isRight()  { return KEYS.has('ArrowRight') || KEYS.has('KeyD'); }
function isUp()     { return KEYS.has('ArrowUp')    || KEYS.has('KeyW'); }
function isDown()   { return KEYS.has('ArrowDown')  || KEYS.has('KeyS'); }
function isSprint() { return KEYS.has('ShiftLeft')  || KEYS.has('ShiftRight'); }
function isAction() { return KEYS.has('Enter') || KEYS.has('Space'); }


// ════════════════════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════════════════════

// STATE controls which screen is showing and what the game loop does.
// Possible values: 'menu' | 'tutorial' | 'playing' | 'paused' | 'phaseFlash' | 'win' | 'dead'
let STATE = 'menu';

// Tutorial: shown once after the player presses Enter on the main menu.
// tutorialSlide tracks which card is showing (0-based).
// tutorialSeen prevents it from showing again on replay.
let tutorialSlide = 0;
let tutorialSeen  = false;

// True once the player has collected the treasure chest.
let hasTreasure = false;

// How many seconds remain on the "TREASURE ACQUIRED" warning overlay.
let phaseFlashTimer = 0;

// Time tracking: t = total seconds elapsed, dt = seconds since last frame.
let t = 0;
let dt = 0;
let lastTimestamp = 0;

// The camera position is the world-space top-left corner of what's visible.
const CAM = { x: 0, y: 0 };

// Screen-shake: shakeTimer counts down, shakeAmount is pixel intensity.
let shakeTimer  = 0;
let shakeAmount = 0;

// Treasure position is randomised at the start of each game.
let treasureX = WORLD_W / 2;
let TREASURE_Y = WORLD_H - 300;


// ════════════════════════════════════════════════════════════
//  PLAYER
// ════════════════════════════════════════════════════════════

const P = {
  x: WORLD_W / 2,     // world-space position
  y: SURFACE_Y + 60,
  vx: 0,              // velocity (pixels per second)
  vy: 0,
  health: 3,
  maxHealth: 3,
  stamina: 100,
  maxStamina: 100,
  exhausted: false,   // true when stamina hits 0; must recover to 30 before sprinting again
  invincTimer: 0,     // seconds of invincibility left after taking a hit
  facing: 1,          // 1 = right, -1 = left
  angle: 0,           // rotation angle in radians (body tilts to match movement direction)
  anim: 'idle',       // which animation is currently playing
  frame: 0,           // current animation frame index
  animTimer: 0,       // seconds since last frame advance
  SPEED: 330,         // base movement speed in pixels per second
};


// ════════════════════════════════════════════════════════════
//  PARTICLES
// ════════════════════════════════════════════════════════════

// Each particle is a small glowing dot that moves, fades, and disappears.
let particles = [];

// Spawns 'n' particles at world position (wx, wy).
// color    = a CSS color string, or an array of colors to pick from randomly.
// speed    = how fast they fly out.
// options  = optional overrides for gravity, size, lifetime, and direction.
function spawnParticles(wx, wy, color, n, speed, options) {
  const opts = options || {};

  // Pull values from options, or use sensible defaults.
  const gravity   = opts.gravity   !== undefined ? opts.gravity   : 12;
  const lifeMin   = opts.lifeMin   !== undefined ? opts.lifeMin   : 0.4;
  const lifeMax   = opts.lifeMax   !== undefined ? opts.lifeMax   : 0.95;
  const rMin      = opts.rMin      !== undefined ? opts.rMin      : 2;
  const rMax      = opts.rMax      !== undefined ? opts.rMax      : 5;
  const angle0    = opts.angle0    !== undefined ? opts.angle0    : 0;
  const angleSpan = opts.angleSpan !== undefined ? opts.angleSpan : Math.PI * 2;
  const spd = speed || 90;

  for (let i = 0; i < n; i++) {
    // Pick a random direction within the allowed angle range.
    const angle = angle0 + Math.random() * angleSpan;
    const s     = spd * (0.4 + Math.random() * 0.8); // randomise speed slightly
    const life  = lifeMin + Math.random() * (lifeMax - lifeMin);

    // If color is an array, pick one at random.
    const col = Array.isArray(color)
      ? color[Math.floor(Math.random() * color.length)]
      : color;

    particles.push({
      x:       wx,
      y:       wy,
      vx:      Math.cos(angle) * s,
      vy:      Math.sin(angle) * s,
      radius:  rMin + Math.random() * (rMax - rMin),
      color:   col,
      life:    life,     // seconds remaining
      maxLife: life,     // original lifetime (used to calculate fade)
      gravity: gravity,  // positive = falls down, negative = floats up
    });
  }
}

// Fires four waves of particles when the chest is opened.
function chestBurst(wx, wy) {
  // Wave 1: fast gold burst in all directions
  spawnParticles(wx, wy, ['#ffe066', '#ffd700', '#ffaa00'], 40, 220, {
    gravity: -20, lifeMin: 0.3, lifeMax: 0.7, rMin: 3, rMax: 7,
  });

  // Wave 2: sparkles that float upward
  spawnParticles(wx, wy, ['#ffffff', '#fffaaa', '#ffd700'], 30, 100, {
    gravity: -30, lifeMin: 0.6, lifeMax: 1.2, rMin: 1.5, rMax: 3.5,
    angle0: -Math.PI, angleSpan: Math.PI, // upward half-circle
  });

  // Wave 3: orange embers that fall downward
  spawnParticles(wx, wy, ['#ff8800', '#ff5500', '#ffdd00'], 20, 140, {
    gravity: 60, lifeMin: 0.2, lifeMax: 0.5, rMin: 2, rMax: 4,
    angle0: 0, angleSpan: Math.PI, // downward half-circle
  });

  // Wave 4: large slow coin-like blobs that linger
  spawnParticles(wx, wy, ['#ffd700', '#ffcc00'], 12, 70, {
    gravity: 20, lifeMin: 0.8, lifeMax: 1.4, rMin: 5, rMax: 9,
  });
}


// ════════════════════════════════════════════════════════════
//  AMBIENT BUBBLES
//  These float upward through the whole world continuously.
// ════════════════════════════════════════════════════════════

const BUBBLES = [];
for (let i = 0; i < 100; i++) {
  BUBBLES.push({
    x:   Math.random() * WORLD_W,
    y:   Math.random() * WORLD_H,
    r:   0.8 + Math.random() * 2.8,   // radius
    spd: 12  + Math.random() * 24,    // rise speed (px/sec)
    wob: Math.random() * Math.PI * 2, // wobble phase offset
  });
}


// ════════════════════════════════════════════════════════════
//  ENEMIES
// ════════════════════════════════════════════════════════════

let enemies = [];

// Config table for each enemy type.
// Fish properties: spd = move speed, chR = detection radius, dmg = damage dealt.
// Mine properties: radius = visual size, hitR = collision radius.
const ENEMY_CONFIG = {
  fish:    { key: 'fish',    sc: 1.8, spd: 70,  chR: 130, dmg: 1, hp: 1 },
  fishbig: { key: 'fishbig', sc: 2.2, spd: 72,  chR: 165, dmg: 1, hp: 2 },
  dart:    { key: 'dart',    sc: 1.6, spd: 190, chR: 115, dmg: 1, hp: 1 },
  mine:    { key: 'mine',    sc: 1.8, radius: 42, hitR: 28, dmg: 1 },
  minebig: { key: 'minebig', sc: 2.2, radius: 64, hitR: 40, dmg: 2 },
  minesml: { key: 'minesml', sc: 1.4, radius: 28, hitR: 20, dmg: 1 },
};

// Creates a new enemy object at world position (wx, wy).
function makeEnemy(type, wx, wy) {
  const cfg    = ENEMY_CONFIG[type];
  const isMine = type.startsWith('mine');

  // All enemies share these base properties.
  const base = {
    type:   type,
    key:    cfg.key,
    sc:     cfg.sc,
    x:      wx,
    y:      wy,
    w:      spriteW(cfg.key, cfg.sc),
    h:      spriteH(cfg.key, cfg.sc),
    frame:  Math.floor(Math.random() * SHEET[cfg.key].frames),
    animTimer: Math.random() * 0.5, // stagger animation so they don't all blink in sync
    alive:  true,
  };

  if (isMine) {
    // Mines stay still and explode on contact.
    return Object.assign({}, base, {
      radius:    cfg.radius,
      hitR:      cfg.hitR,
      dmg:       cfg.dmg,
      exploding: false,
      explodeTimer: 0,
      phase:     Math.random() * Math.PI * 2, // bobbing phase offset
    });
  }

  // Fish/dart enemies swim around and chase the player.
  return Object.assign({}, base, {
    vx:      (Math.random() > 0.5 ? 1 : -1) * cfg.spd * 0.3,
    vy:      0,
    spd:     cfg.spd,
    chR:     cfg.chR,
    dmg:     cfg.dmg,
    hp:      cfg.hp,
    maxHp:   cfg.hp,
    aggro:   false,          // true when chasing the player
    patDir:  Math.random() > 0.5 ? 1 : -1, // patrol direction: 1=right, -1=left
    facing:  1,
    hitCooldown: 0,          // prevents dealing damage every frame
  });
}

// Returns true if position (x, y) overlaps an existing enemy or the chest.
// minDist = minimum allowed distance in pixels.
function isTooClose(x, y, minDist) {
  for (const e of enemies) {
    const enemyCenterX = e.x + e.w / 2;
    const enemyCenterY = e.y + e.h / 2;
    if (Math.hypot(x - enemyCenterX, y - enemyCenterY) < minDist) {
      return true;
    }
  }

  // Keep a 350px clear zone around the chest center so nothing spawns on top of it.
  // The chest center Y = TREASURE_Y + half the frame height (64px * scale * 0.5).
  const chestCenterX = treasureX;
  const chestCenterY = TREASURE_Y + 64 * CHEST_SCALE * 0.5;
  if (Math.hypot(x - chestCenterX, y - chestCenterY) < 350) {
    return true;
  }

  return false;
}

// Fills the world with enemies, distributed across depth zones.
function spawnEnemies() {
  enemies = [];

  const yStart  = SURFACE_Y + 120;
  const yEnd    = WORLD_H - 120;
  const yRange  = yEnd - yStart;
  const rowStep = 120; // increased from 70 — more vertical gap between rows

  // Calculate where the chest sits vertically so we can skip that zone.
  const chestCenterY = TREASURE_Y + 64 * CHEST_SCALE * 0.5;
  const clearBand    = 420;

  for (let baseY = yStart; baseY < yEnd; baseY += rowStep) {

    if (Math.abs(baseY - chestCenterY) < clearBand) continue;

    // Each row has a budget of 2–4 slots.
    // Small/regular mines cost 0.5 slots; big mines cost 1 slot like fish.
    // We keep placing until we exceed the budget.
    const budget = 2 + Math.floor(Math.random() * 3);

    let spent = 0;
    while (spent < budget) {
      let ex = 0;
      let ey = 0;
      let placed = false;

      for (let attempt = 0; attempt < 20; attempt++) {
        ex = 60 + Math.random() * (WORLD_W - 120);
        ey = baseY + (Math.random() - 0.5) * rowStep * 0.7;
        if (!isTooClose(ex, ey, 160)) {
          placed = true;
          break;
        }
      }
      // If we couldn't find a clear spot after 20 tries, stop filling this row.
      if (!placed) break;

      const roll = Math.random();
      const relY = baseY - yStart;
      let cost = 1; // default slot cost; mines (except minebig) cost 0.5

      if (relY < yRange * 0.40) {
        // Shallow zone.
        if      (roll < 0.23) { enemies.push(makeEnemy('fishbig', ex, ey)); }
        else if (roll < 0.41) { enemies.push(makeEnemy('minebig', ex, ey)); }        // big mine: cost 1
        else if (roll < 0.50) { enemies.push(makeEnemy('fish',    ex, ey)); }
        else if (roll < 0.61) { enemies.push(makeEnemy('minesml', ex, ey)); cost=0.5; } // small mine: cost 0.5
        else if (roll < 0.66) { spawnSmallPack('fish', ex, ey); }

      } else if (relY < yRange * 0.72) {
        // Mid zone.
        if      (roll < 0.14) { enemies.push(makeEnemy('fish',    ex, ey)); }
        else if (roll < 0.27) { enemies.push(makeEnemy('fishbig', ex, ey)); }
        else if (roll < 0.43) { enemies.push(makeEnemy('mine',    ex, ey)); cost=0.5; } // regular mine: cost 0.5
        else if (roll < 0.55) { enemies.push(makeEnemy('minesml', ex, ey)); cost=0.5; } // small mine: cost 0.5
        else if (roll < 0.61) { enemies.push(makeEnemy('dart',    ex, ey)); }
        else if (roll < 0.66) { spawnSmallPack('dart', ex, ey); }

      } else {
        // Deep zone.
        if      (roll < 0.12) { enemies.push(makeEnemy('fishbig', ex, ey)); }
        else if (roll < 0.27) { enemies.push(makeEnemy('dart',    ex, ey)); }
        else if (roll < 0.43) { enemies.push(makeEnemy('mine',    ex, ey)); cost=0.5; } // regular mine: cost 0.5
        else if (roll < 0.57) { enemies.push(makeEnemy('minebig', ex, ey)); }           // big mine: cost 1
        else if (roll < 0.62) { spawnSmallPack('dart', ex, ey); }
      }

      spent += cost;
    }
  }
}

// Spawns exactly 3 enemies of the given type loosely clustered around (cx, cy).
// Only used for small fish and darts — never for big fish or mines.
function spawnSmallPack(type, cx, cy) {
  const offsets = [
    { dx: 0,   dy: 0   },   // leader at the exact position
    { dx: -90, dy: -30 },   // second offset left and slightly up
    { dx:  90, dy:  20 },   // third offset right and slightly down
  ];
  for (const off of offsets) {
    const ex = clamp(cx + off.dx, 60, WORLD_W - 60);
    const ey = clamp(cy + off.dy, SURFACE_Y + 60, WORLD_H - 200);
    enemies.push(makeEnemy(type, ex, ey));
  }
}


// ════════════════════════════════════════════════════════════
//  CHEST
//  The opening animation steps through CHEST_ANIM one frame
//  at a time, 0.22 seconds per frame.
// ════════════════════════════════════════════════════════════

// Each entry is { r: row, f: frame } inside the chest sprite sheet.
// We skip the last fully-open frame intentionally.
const CHEST_ANIM = [
  { r: 0, f: 0 },
  { r: 0, f: 1 },
  { r: 1, f: 0 },
  { r: 1, f: 1 },
  { r: 2, f: 0 }, // stop here — fully open frame is skipped
];

let chest = {};

function resetChest() {
  chest = {
    x:        treasureX - spriteW('chest', CHEST_SCALE) / 2,
    y:        TREASURE_Y,
    animIdx:  0,
    openTimer: 0,
    opening:  false,
    opened:   false,
    hideTimer: 0,  // counts down 3 seconds after pickup before the chest disappears
  };
}


// ════════════════════════════════════════════════════════════
//  BOOT & RESET
// ════════════════════════════════════════════════════════════

// Called once all images have loaded.
function boot() {
  resetGame();
  requestAnimationFrame(loop);
}

// Resets everything for a fresh game.
function resetGame() {
  // Reset player to starting position.
  P.x          = WORLD_W / 2;
  P.y          = SURFACE_Y + 60;
  P.vx         = 0;
  P.vy         = 0;
  P.health     = P.maxHealth;
  P.stamina    = P.maxStamina;
  P.exhausted  = false;
  P.invincTimer = 0;
  P.facing     = 1;
  P.angle      = 0;
  P.anim       = 'idle';
  P.frame      = 0;
  P.animTimer  = 0;

  hasTreasure    = false;
  phaseFlashTimer = 0;

  // Start camera so the player is near the top of the screen.
  CAM.x = WORLD_W / 2 - W / 2;
  CAM.y = SURFACE_Y - 60;

  shakeTimer  = 0;
  particles   = [];

  // Chest spawns right on the seabed. sandTop = WORLD_H - 80, chest height ≈ 64 * CHEST_SCALE.
  treasureX  = 120 + Math.random() * (WORLD_W - 240);
  TREASURE_Y = WORLD_H - 80 - 64 * CHEST_SCALE;

  resetChest();
  spawnEnemies();
}


// ════════════════════════════════════════════════════════════
//  MAIN LOOP
//  Called by the browser ~60 times per second.
//  ts = timestamp in milliseconds provided by requestAnimationFrame.
// ════════════════════════════════════════════════════════════

function loop(ts) {
  // dt = seconds since last frame. Capped at 0.05s to avoid huge jumps if the tab was hidden.
  dt = Math.min((ts - lastTimestamp) / 1000, 0.05);
  lastTimestamp = ts;
  t += dt;

  update();
  draw();

  requestAnimationFrame(loop);
}


// ════════════════════════════════════════════════════════════
//  UPDATE  — advances the game simulation by dt seconds
// ════════════════════════════════════════════════════════════

function update() {
  // --- Menu screen: first play goes to tutorial, replays go straight in ---
  if (STATE === 'menu') {
    if (isAction()) {
      KEYS.clear();
      if (!tutorialSeen) {
        tutorialSlide = 0;
        STATE = 'tutorial';
      } else {
        STATE = 'playing';
      }
    }
    return;
  }

  // --- Paused: freeze everything ---
  if (STATE === 'paused') return;

  // --- Tutorial: freeze simulation while cards are shown ---
  if (STATE === 'tutorial') return;

  // --- Win or dead screen: wait for Enter to restart ---
  if (STATE === 'win' || STATE === 'dead') {
    if (isAction()) {
      STATE = 'playing';
      resetGame();
      KEYS.clear();
    }
    return;
  }

  // --- Phase flash: "TREASURE ACQUIRED" overlay after picking up the chest ---
  // Only the camera and particles keep moving during this screen.
  if (STATE === 'phaseFlash') {
    phaseFlashTimer -= dt;
    if (phaseFlashTimer <= 0) STATE = 'playing';
    updateCamera();
    updateParticles(); // keep the burst particles animating
    if (chest.hideTimer > 0) chest.hideTimer -= dt; // chest disappear timer runs during the flash screen too
    return;
  }

  // --- Normal gameplay ---
  updatePlayer();
  updateCamera();
  updateEnemies();
  updateChest();
  if (chest.hideTimer > 0) chest.hideTimer -= dt;
  updateParticles();
  checkCollisions();
  checkWinLose();

  if (shakeTimer > 0) shakeTimer -= dt;
}


// ════════════════════════════════════════════════════════════
//  UPDATE: PLAYER
// ════════════════════════════════════════════════════════════

function updatePlayer() {
  const isMoving = isLeft() || isRight() || isUp() || isDown();

  // Stamina: runs out while sprinting, refills while swimming or resting.
  if (P.stamina <= 0)  P.exhausted = true;
  if (P.stamina >= 30) P.exhausted = false; // must recover to 30% before sprinting again

  const canSprint    = isSprint() && !P.exhausted && isMoving;
  const staminaChange = canSprint ? -35 : isMoving ? 15 : 45;
  P.stamina = clamp(P.stamina + staminaChange * dt, 0, P.maxStamina);

  // Speed: faster with treasure (adrenaline!), even faster while sprinting.
  const baseSpeed = P.SPEED * (hasTreasure ? 1.2 : 1.0);
  const speed     = canSprint ? baseSpeed * 1.6 : baseSpeed;

  // Apply acceleration in the direction the player is pressing.
  // The * 9 factor makes the response feel snappy rather than sluggish.
  if (isLeft())  { P.vx -= speed * 9 * dt;  P.facing = -1; }
  if (isRight()) { P.vx += speed * 9 * dt;  P.facing =  1; }
  if (isUp())    { P.vy -= speed * 9 * dt; }
  if (isDown())  { P.vy += speed * 9 * dt; }

  // Water drag: multiplying velocity by 0.80 each frame slows the player when they stop pushing.
  P.vx *= 0.80;
  P.vy *= 0.80;

  // Cap speed so sprinting doesn't stack infinitely.
  const velLen = Math.hypot(P.vx, P.vy);
  if (velLen > speed) {
    P.vx = (P.vx / velLen) * speed;
    P.vy = (P.vy / velLen) * speed;
  }

  // Move the player.
  P.x += P.vx * dt;
  P.y += P.vy * dt;

  // Keep the player within the world bounds.
  const halfW = spriteW('idle', PLAYER_SCALE) / 2;
  P.x = clamp(P.x, halfW, WORLD_W - halfW);
  P.y = clamp(P.y, SURFACE_Y + 5, WORLD_H - 100); // can't break the surface

  // Count down invincibility timer.
  if (P.invincTimer > 0) P.invincTimer -= dt;

  // Choose which animation to play.
  let newAnim = 'idle';
  if (P.invincTimer > 0) {
    newAnim = 'hurt';
  } else if (velLen > 8) {
    if (hasTreasure && P.vy < -30) newAnim = 'rush';  // rushing upward with treasure
    else if (canSprint)            newAnim = 'fast';
    else                           newAnim = 'swim';
  }

  // Reset frame counter if the animation changed.
  if (newAnim !== P.anim) {
    P.anim      = newAnim;
    P.frame     = 0;
    P.animTimer = 0;
  }

  // Advance the animation frame at the correct speed for each animation.
  const animFPS = { idle: 6, swim: 7, fast: 10, rush: 7, hurt: 4 };
  const fps     = animFPS[P.anim] || 8;
  P.animTimer += dt;
  if (P.animTimer >= 1 / fps) {
    P.animTimer = 0;
    P.frame = (P.frame + 1) % SHEET[P.anim].frames;
  }
}


// ════════════════════════════════════════════════════════════
//  UPDATE: CAMERA
//  The camera smoothly follows the player with a small lag.
// ════════════════════════════════════════════════════════════

function updateCamera() {
  // Target position: player centered in the viewport.
  const targetX = P.x - W / 2;
  const targetY = P.y - H / 2;

  // Lerp (linear interpolate) toward the target — * 8 * dt controls how snappy the follow is.
  CAM.x += (targetX - CAM.x) * 8 * dt;
  CAM.y += (targetY - CAM.y) * 8 * dt;

  // Clamp so the camera never shows outside the world.
  CAM.x = clamp(CAM.x, 0, WORLD_W - W);
  CAM.y = clamp(CAM.y, 0, WORLD_H - H);
}


// enemy aggr

function updateEnemies() {
  const px = P.x;
  const py = P.y;

  // After picking up the treasure, enemies speed up as the player ascends.
  const depthFrac       = clamp((py - SURFACE_Y) / (TREASURE_Y - SURFACE_Y), 0, 1);
  const ascendProgress  = hasTreasure ? (1 - depthFrac) : 0;
  const speedMultiplier = hasTreasure ? (1.5 + ascendProgress * 1.5) : 1.0;

  for (const e of enemies) {
    if (!e.alive) continue;

    // ── Mines bob in place, no movement AI needed ──
    if (e.type.startsWith('mine')) {
      e.y += Math.sin(t * 1.3 + e.phase) * 0.4;
      if (e.exploding) {
        e.explodeTimer -= dt;
        if (e.explodeTimer <= 0) e.alive = false;
      }
      continue;
    }

    // ── Fish / Dart movement AI ──
    const dx   = px - (e.x + e.w / 2);
    const dy   = py - (e.y + e.h / 2);
    const dist = Math.hypot(dx, dy);

    if (hasTreasure || dist < e.chR) e.aggro = true;

    if (e.aggro) {
      const chaseSpeed = e.spd * speedMultiplier;
      if (dist > 1) {
        e.vx += (dx / dist) * chaseSpeed * 3 * dt;
        e.vy += (dy / dist) * chaseSpeed * 3 * dt;
      }
      e.facing = dx >= 0 ? 1 : -1;
    } else {
      e.vx += e.patDir * e.spd * 0.22 * dt;
      if (e.x < 20) {
        e.x = 20; e.patDir = 1; e.facing = 1; e.vx = 0;
      } else if (e.x > WORLD_W - 20 - e.w) {
        e.x = WORLD_W - 20 - e.w; e.patDir = -1; e.facing = -1; e.vx = 0;
      }
    }

    e.vx *= 0.88;
    e.vy *= 0.88;

    const maxSpeed = e.aggro
      ? e.spd * (hasTreasure ? speedMultiplier : 1.1)
      : e.spd * 0.4;
    const eVelLen = Math.hypot(e.vx, e.vy);
    if (eVelLen > maxSpeed) {
      e.vx = (e.vx / eVelLen) * maxSpeed;
      e.vy = (e.vy / eVelLen) * maxSpeed;
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // ── Solid-body separation: push this fish away from mines and other fish ──
    // We use a simple overlap-correction: if two circles overlap, nudge both apart.
    const eCX = e.x + e.w / 2;
    const eCY = e.y + e.h / 2;
    const eR  = Math.min(e.w, e.h) * 0.45; // approximate radius for this enemy

    for (const other of enemies) {
      if (other === e || !other.alive) continue;

      const oCX = other.x + other.w / 2;
      const oCY = other.y + other.h / 2;
      const oR  = Math.min(other.w, other.h) * 0.45;

      const overlapDist = eR + oR;       // minimum centre distance before touching
      const dx2  = eCX - oCX;
      const dy2  = eCY - oCY;
      const d2   = Math.hypot(dx2, dy2);

      if (d2 < overlapDist && d2 > 0.1) {
        // Push both entities apart along the collision axis.
        const push   = (overlapDist - d2) * 0.5;
        const nx     = dx2 / d2; // normalised direction
        const ny     = dy2 / d2;

        // Only nudge the fish (not the mine) — mines stay where the sine wave puts them.
        if (!e.type.startsWith('mine')) {
          e.x += nx * push;
          e.y += ny * push;
        }
        if (!other.type.startsWith('mine')) {
          other.x -= nx * push;
          other.y -= ny * push;
        }
      }
    }

    e.x = clamp(e.x, -e.w, WORLD_W + e.w);
    e.y = clamp(e.y, SURFACE_Y + 30, WORLD_H - e.h - 100);

    const animFPS = e.type === 'dart' ? 14 : 8;
    e.animTimer += dt;
    if (e.animTimer >= 1 / animFPS) {
      e.animTimer = 0;
      e.frame = (e.frame + 1) % SHEET[e.key].frames;
    }

    if (e.hitCooldown > 0) e.hitCooldown -= dt;
  }

  enemies = enemies.filter(function(e) { return e.alive; });
}


// ════════════════════════════════════════════════════════════
//  UPDATE: CHEST
// ════════════════════════════════════════════════════════════

function updateChest() {
  // Only run while the chest is opening and hasn't finished yet.
  if (!chest.opening || chest.opened) return;

  chest.openTimer += dt;

  // Advance to the next animation frame every 0.22 seconds.
  if (chest.openTimer >= 0.22) {
    chest.openTimer = 0;
    chest.animIdx++;

    // When we've played all animation frames, the chest is fully open.
    if (chest.animIdx >= CHEST_ANIM.length) {
      chest.animIdx = CHEST_ANIM.length - 1;
      chest.opened  = true;
      hasTreasure   = true;
      chest.hideTimer = 1.5; // chest stays visible for 1.5 seconds after pickup

      // Fire the particle burst.
      const cx = chest.x + spriteW('chest', CHEST_SCALE) / 2;
      const cy = chest.y + spriteH('chest', CHEST_SCALE) / 2;
      chestBurst(cx, cy);

      // Spawn an ambush wave of enemies near the surface to block the escape.
      for (let i = 0; i < 15; i++) {
        const ex = 60 + Math.random() * (WORLD_W - 120);
        const ey = SURFACE_Y + 140 + Math.random() * (WORLD_H * 0.45);
        const roll = Math.random();
        let type = 'fishbig';
        if      (roll < 0.32) type = 'minebig';
        else if (roll < 0.52) type = 'dart';
        enemies.push(makeEnemy(type, ex, ey));
      }

      // Make all existing fish enemies immediately aggressive.
      for (const e of enemies) {
        if (e.aggro !== undefined) e.aggro = true;
      }

      STATE           = 'phaseFlash';
      phaseFlashTimer = 2.5;
    }
  }
}


// ════════════════════════════════════════════════════════════
//  UPDATE: PARTICLES
// ════════════════════════════════════════════════════════════

function updateParticles() {
  for (const p of particles) {
    p.x  += p.vx * dt;
    p.y  += p.vy * dt;
    p.vy += p.gravity * dt; // gravity pulls down (or up if negative)
    p.vx *= 0.985;          // slight horizontal drag
    p.life -= dt;
  }
  // Remove particles whose lifetime has expired.
  particles = particles.filter(function(p) { return p.life > 0; });
}


// ════════════════════════════════════════════════════════════
//  COLLISIONS
// ════════════════════════════════════════════════════════════

function checkCollisions() {
  // During invincibility frames, ignore all hits.
  if (P.invincTimer > 0) return;

  const px = P.x;
  const py = P.y;

  // Use a rectangle around the player center for fish collisions.
  const playerLeft   = px - 16;
  const playerRight  = px + 16;
  const playerTop    = py - 20;
  const playerBottom = py + 20;

  // Check if player is close enough to start opening the chest.
  if (!hasTreasure && !chest.opening) {
    const cx = chest.x + spriteW('chest', CHEST_SCALE) / 2;
    const cy = chest.y + spriteH('chest', CHEST_SCALE) / 2;
    if (Math.hypot(px - cx, py - cy) < 60) {
      chest.opening = true;
    }
  }

  // Check collisions with every enemy.
  for (const e of enemies) {
    if (!e.alive) continue;

    if (e.type.startsWith('mine')) {
      // Mine: circle vs circle.
      const mx = e.x + e.w / 2;
      const my = e.y + e.h / 2;
      if (!e.exploding && Math.hypot(px - mx, py - my) < e.hitR) {
        e.exploding    = true;
        e.explodeTimer = 0.65;
        spawnParticles(mx, my, '#ff8800', 22, 150);
        takeDamage(e.dmg);
      }

    } else {
      // Fish/dart: axis-aligned bounding box (AABB).
      const eLeft   = e.x + e.w * 0.05;
      const eRight  = e.x + e.w * 0.95;
      const eTop    = e.y + e.h * 0.10;
      const eBottom = e.y + e.h * 0.90;

      const overlapping =
        playerRight  > eLeft   &&
        playerLeft   < eRight  &&
        playerBottom > eTop    &&
        playerTop    < eBottom;

      if (overlapping && e.hitCooldown <= 0) {
        e.hitCooldown = 1.6; // seconds before this enemy can hit again
        spawnParticles(px, py, '#ff3344', 12, 70);
        takeDamage(e.dmg);
        e.vx *= -1.5; // knock the enemy back
        e.vy *= -1.5;
      }
    }
  }
}

function takeDamage(amount) {
  P.health      -= amount;
  P.invincTimer  = 1.8;   // invincibility duration in seconds
  shakeTimer     = 0.35;
  shakeAmount    = 6;
  P.anim         = 'hurt';
  P.frame        = 0;
  P.animTimer    = 0;

  if (P.health <= 0) {
    P.health   = 0;
    STATE      = 'dead';
    shakeTimer = 0; // stop shake immediately so the death screen isn't jittery
  }
}

function checkWinLose() {
  // Player wins by reaching the surface while carrying the treasure.
  if (hasTreasure && P.y <= SURFACE_Y + 20) {
    STATE = 'win';
  }
}


// ════════════════════════════════════════════════════════════
//  DRAW  — renders the current frame to the canvas
// ════════════════════════════════════════════════════════════

function draw() {
  g.clearRect(0, 0, W, H);

  // The menu is a full-screen overlay — draw it and stop.
  if (STATE === 'menu') {
    drawMenu();
    return;
  }

  // Compute screen-shake offset (random jitter while shakeTimer > 0).
  let shakeX = 0;
  let shakeY = 0;
  if (shakeTimer > 0) {
    shakeX = (Math.random() - 0.5) * shakeAmount;
    shakeY = (Math.random() - 0.5) * shakeAmount;
  }

  // Apply shake to everything.
  g.save();
  g.translate(Math.round(shakeX), Math.round(shakeY));

  // Shift the entire world by the negative camera position,
  // so world coordinate (CAM.x, CAM.y) maps to screen coordinate (0, 0).
  g.save();
  g.translate(-Math.round(CAM.x), -Math.round(CAM.y));
  drawBackground();
  drawBubbles();
  drawEnemies();
  drawChest();
  drawPlayer();
  drawParticles();
  g.restore(); // undo camera translate

  drawHUD(); // HUD is always in screen-space
  g.restore(); // undo shake translate

  // Overlay screens drawn after HUD and on top of everything.
  if (STATE === 'phaseFlash') drawPhaseFlash();
  if (STATE === 'win')        drawWin();
  if (STATE === 'dead')       drawDead();
  if (STATE === 'paused')     drawPaused();
  if (STATE === 'tutorial')   drawTutorial();
}


// ════════════════════════════════════════════════════════════
//  DRAW: BACKGROUND
// ════════════════════════════════════════════════════════════

function drawBackground() {
  // df = depth fraction (0 at surface, 1 at the deepest point).
  const df = clamp(CAM.y / (WORLD_H * 0.8), 0, 1);

  // ── Sky strip (above the waterline) ──
  // If the camera is scrolled up enough that sky is visible, fill it with a sky colour.
  const skyScreenY = SURFACE_Y - CAM.y; // where the waterline sits on screen
  if (skyScreenY > 0) {
    g.fillStyle = '#87ceeb'; // light sky blue
    g.fillRect(CAM.x, CAM.y, W, skyScreenY);
  }

  // ── Water gradient: only fills from SURFACE_Y downward ──
  const waterTop    = Math.max(CAM.y, SURFACE_Y); // never above the waterline
  const waterBottom = CAM.y + H;
  if (waterBottom > waterTop) {
    const topR    = lerp(8, 2, df);    const topG    = lerp(40, 4, df);   const topB    = lerp(100, 12, df);
    const bottomR = lerp(3, 1, df);    const bottomG = lerp(18, 2, df);   const bottomB = lerp(65,  6,  df);
    const waterGrad = g.createLinearGradient(0, waterTop, 0, waterBottom);
    waterGrad.addColorStop(0, rgb(topR,    topG,    topB));
    waterGrad.addColorStop(1, rgb(bottomR, bottomG, bottomB));
    g.fillStyle = waterGrad;
    g.fillRect(CAM.x, waterTop, W, waterBottom - waterTop);
  }

  // Caustic light patches — only visible near the surface AND only drawn below it.
  if (df < 0.35) {
    const alpha = (1 - df / 0.35) * 0.055;
    g.save();
    // Clip so caustics never appear above the waterline.
    g.beginPath();
    g.rect(CAM.x, SURFACE_Y, W, H);
    g.clip();
    g.globalAlpha = alpha;
    g.fillStyle   = '#aaddff';
    for (let i = 0; i < 10; i++) {
      const cx = CAM.x + (Math.sin(t * 0.6 + i * 1.4) * 0.5 + 0.5) * W;
      const cy = CAM.y + (Math.cos(t * 0.4 + i * 0.9) * 0.5 + 0.5) * H;
      g.beginPath();
      g.ellipse(cx, cy, 55 + Math.sin(t + i) * 18, 25, Math.sin(t * 0.3 + i) * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // Bioluminescent glow orbs — deep zone only, also clipped below surface.
  if (df > 0.55) {
    const deepAlpha = (df - 0.55) / 0.45 * 0.06;
    g.save();
    g.beginPath();
    g.rect(CAM.x, SURFACE_Y, W, WORLD_H);
    g.clip();
    g.globalAlpha = deepAlpha;
    g.fillStyle   = '#00ffaa';
    for (let i = 0; i < 8; i++) {
      const bx = CAM.x + (Math.sin(t * 0.25 + i * 2.1) * 0.5 + 0.5) * W;
      const by = CAM.y + (Math.cos(t * 0.18 + i * 1.7) * 0.5 + 0.5) * H;
      g.beginPath();
      g.arc(bx, by, 40 + Math.sin(t + i * 1.3) * 15, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // Surface waterline glow and dashed line.
  if (SURFACE_Y > CAM.y - 50 && SURFACE_Y < CAM.y + H + 10) {
    const wGrad = g.createLinearGradient(0, SURFACE_Y - 50, 0, SURFACE_Y + 12);
    wGrad.addColorStop(0, 'rgba(60,200,255,0)');
    wGrad.addColorStop(1, 'rgba(60,200,255,0.45)');
    g.fillStyle = wGrad;
    g.fillRect(CAM.x, SURFACE_Y - 50, W, 62);

    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth   = 2;
    g.setLineDash([14, 6]);
    g.beginPath();
    g.moveTo(CAM.x, SURFACE_Y);
    g.lineTo(CAM.x + W, SURFACE_Y);
    g.stroke();
    g.setLineDash([]); // reset dash pattern

    // "SURFACE" label visible once the player has the treasure.
    if (hasTreasure) {
      // Label is drawn in screen-space HUD instead — see drawHUD().
    }
  }

  // ── Seabed ──
  // The sand starts 80px from the bottom of the world.
  const sandTop = WORLD_H - 80;

  // Only draw the seabed when it's near the camera.
  if (sandTop < CAM.y + H + 80) {

    // Sandy gradient fill.
    const sandGrad = g.createLinearGradient(0, sandTop, 0, WORLD_H + 40);
    sandGrad.addColorStop(0,    '#c8955a');
    sandGrad.addColorStop(0.18, '#b07840');
    sandGrad.addColorStop(0.45, '#8a5e30');
    sandGrad.addColorStop(0.75, '#6a4420');
    sandGrad.addColorStop(1,    '#3a2210');
    g.fillStyle = sandGrad;
    g.fillRect(CAM.x, sandTop, W, WORLD_H + 40 - sandTop);

  }

  // Red vignette around the screen edges while carrying the treasure.
  if (hasTreasure) {
    const pulse = 0.18 + Math.sin(t * 3.5) * 0.06;
    const cx    = CAM.x + W / 2;
    const cy    = CAM.y + H / 2;
    const vig   = g.createRadialGradient(cx, cy, H * 0.28, cx, cy, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(180,0,0,${pulse})`);
    g.fillStyle = vig;
    g.fillRect(CAM.x, CAM.y, W, H);
  }
}



// ════════════════════════════════════════════════════════════
//  DRAW: BUBBLES
// ════════════════════════════════════════════════════════════

function drawBubbles() {
  g.fillStyle = 'rgba(160,215,255,0.28)';

  for (const b of BUBBLES) {
    // Move bubble upward and wobble it side-to-side.
    b.y -= b.spd * dt;
    b.x += Math.sin(t * 0.7 + b.wob) * 0.5;

    // Wrap back to the bottom when it reaches the top.
    if (b.y < 0) b.y = WORLD_H - 10;

    // Skip bubbles that are off-screen (saves draw calls).
    if (b.x < CAM.x - 10 || b.x > CAM.x + W + 10) continue;
    if (b.y < CAM.y - 10 || b.y > CAM.y + H + 10) continue;

    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
  }
}


// ════════════════════════════════════════════════════════════
//  DRAW: ENEMIES
// ════════════════════════════════════════════════════════════

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;

    // Skip enemies completely off-screen.
    if (e.x + e.w < CAM.x - 80 || e.x > CAM.x + W + 80) continue;
    if (e.y + e.h < CAM.y - 80 || e.y > CAM.y + H + 80) continue;

    if (e.type.startsWith('mine')) {

      if (e.exploding) {
        // Draw the expanding explosion circle.
        const prog = 1 - e.explodeTimer / 0.65; // 0 = just started, 1 = finished
        g.globalAlpha = 1 - prog;
        const exGrad = g.createRadialGradient(
          e.x + e.w / 2, e.y + e.h / 2, 0,
          e.x + e.w / 2, e.y + e.h / 2, e.radius * (1 + prog * 2)
        );
        exGrad.addColorStop(0,   'rgba(255,220,80,0.9)');
        exGrad.addColorStop(0.5, 'rgba(255,100,0,0.6)');
        exGrad.addColorStop(1,   'rgba(255,0,0,0)');
        g.fillStyle = exGrad;
        g.beginPath();
        g.arc(e.x + e.w / 2, e.y + e.h / 2, e.radius * (1 + prog * 2), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        continue;
      }

      // Pulsing glow ring around mines.
      const glowAlpha = 0.25 + Math.abs(Math.sin(t * 2.2 + e.phase)) * 0.2;
      g.globalAlpha = glowAlpha;
      g.fillStyle   = e.type === 'minebig' ? '#ff5500' : '#33ff88';
      g.beginPath();
      g.arc(e.x + e.w / 2, e.y + e.h / 2, e.radius * 0.65, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;

      // Mine sprite pulses slightly in size.
      const pulse = 0.88 + Math.sin(t * 2.8 + e.phase) * 0.12;
      const img   = IMG[e.key];
      if (img.naturalWidth) {
        const iw = img.naturalWidth  * e.sc * pulse;
        const ih = img.naturalHeight * e.sc * pulse;
        g.drawImage(img, e.x + (e.w - iw) / 2, e.y + (e.h - ih) / 2, iw, ih);
      }

    } else {
      // Fish / dart: draw their animated sprite, flipped if facing left.
      drawSprite(e.key, e.frame, 0, e.x, e.y, e.sc, e.facing === -1);

      // Show a flashing "!" above aggressive enemies.
      if (e.aggro) {
        const fa = Math.abs(Math.sin(t * 6)) * 0.75;
        g.globalAlpha = fa;
        g.fillStyle   = '#ff2200';
        g.font        = 'bold 13px monospace';
        g.textAlign   = 'center';
        g.fillText('!', e.x + e.w / 2, e.y - 5);
        g.globalAlpha = 1;
      }
    }
  }
}


// ════════════════════════════════════════════════════════════
//  DRAW: CHEST
// ════════════════════════════════════════════════════════════

function drawChest() {
  // Hide the chest only after the 3-second delay has elapsed.
  if (hasTreasure && chest.hideTimer <= 0) return;

  const cw = spriteW('chest', CHEST_SCALE);
  const ch = spriteH('chest', CHEST_SCALE);
  const cx = chest.x + cw / 2;
  const cy = chest.y + ch / 2;

  // Skip if not on screen.
  if (cx < CAM.x - 140 || cx > CAM.x + W + 140) return;
  if (cy < CAM.y - 140 || cy > CAM.y + H + 140) return;

  // Pulsing gold glow before the chest is opened.
  if (!chest.opened) {
    const glowAlpha = 0.28 + Math.abs(Math.sin(t * 2.3)) * 0.28;
    const glow = g.createRadialGradient(cx, cy, 12, cx, cy, 95);
    glow.addColorStop(0, `rgba(255,220,0,${glowAlpha})`);
    glow.addColorStop(1, 'rgba(255,200,0,0)');
    g.fillStyle = glow;
    g.fillRect(chest.x - 70, chest.y - 70, cw + 140, ch + 140);
  }

  // Draw the current animation frame.
  const frame = CHEST_ANIM[chest.animIdx] || CHEST_ANIM[CHEST_ANIM.length - 1];
  drawSprite('chest', frame.f, frame.r, chest.x, chest.y, CHEST_SCALE, false);

  // "[ TREASURE ]" hint label when the player is nearby.
  if (!chest.opening) {
    const dist = Math.hypot(P.x - cx, P.y - cy);
    if (dist < 200) {
      // Fade the label in as the player gets closer.
      const alpha = (0.5 + Math.sin(t * 4) * 0.5) * Math.min(1, (200 - dist) / 100);
      g.globalAlpha = alpha;
      g.fillStyle   = '#ffee44';
      g.font        = 'bold 12px monospace';
      g.textAlign   = 'center';
      g.fillText('[ TREASURE ]', cx, chest.y - 14);
      g.globalAlpha = 1;
    }
  }
}


// ════════════════════════════════════════════════════════════
//  DRAW: PLAYER
// ════════════════════════════════════════════════════════════

function drawPlayer() {
  // Flash (skip drawing) during invincibility to show the player was hit.
  if (P.invincTimer > 0 && Math.floor(t * 13) % 2 === 0) return;

  const pw = spriteW(P.anim, PLAYER_SCALE);
  const ph = spriteH(P.anim, PLAYER_SCALE);

  // Only tilt the player to match movement direction while actively swimming.
  // When idle or hurt, lerp the angle back to 0 (upright) so they don't freeze mid-spin.
  if (Math.hypot(P.vx, P.vy) > 5 && P.anim !== 'idle' && P.anim !== 'hurt') {
    P.angle = Math.atan2(P.vy, P.vx);
  } else {
    P.angle *= 0.85; // smoothly return to upright
  }

  g.save();
  g.translate(P.x, P.y);
  g.rotate(P.angle || 0);

  // When swimming left the sprite would appear upside-down, so flip it vertically.
  if (Math.abs(P.angle) > Math.PI / 2) {
    g.scale(1, -1);
  }

  const sheet = SHEET[P.anim];
  const img   = IMG[P.anim];
  if (img && img.naturalWidth) {
    const frameW = Math.floor(img.naturalWidth  / sheet.cols);
    const frameH = Math.floor(img.naturalHeight / sheet.rows);
    const inset  = 0.5;
    g.drawImage(
      img,
      P.frame * frameW + inset, inset,        // source x, y
      frameW - inset * 2, frameH - inset * 2, // source width, height
      -pw / 2, -ph / 2,                        // dest x, y (centered on player)
      pw, ph                                   // dest width, height
    );
  }

  g.restore();
}


// ════════════════════════════════════════════════════════════
//  DRAW: PARTICLES
// ════════════════════════════════════════════════════════════

function drawParticles() {
  for (const p of particles) {
    // Skip off-screen particles.
    if (p.x < CAM.x - 20 || p.x > CAM.x + W + 20) continue;
    if (p.y < CAM.y - 20 || p.y > CAM.y + H + 20) continue;

    // Fade out as lifetime runs out.
    g.globalAlpha = Math.max(0, p.life / p.maxLife);

    // Large "coin" particles get a glow effect.
    if (p.radius >= 5) {
      g.shadowColor = p.color;
      g.shadowBlur  = 8;
    }

    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
  g.globalAlpha = 1;
}


// ════════════════════════════════════════════════════════════
//  DRAW: HUD (Heads-Up Display)
//  Drawn in screen-space so it's always at the same position.
// ════════════════════════════════════════════════════════════

function drawHUD() {
  // Depth fraction: 0 = just below surface, 1 = at the treasure.
  const depthFrac = clamp(
    (P.y - SURFACE_Y) / ((WORLD_H - SURFACE_Y) * 0.88),
    0, 1
  );

  // ── Depth bar (right side) ──
  // bgX is the left edge of the background rect (14px wide).
  // barCX is its center — all inner elements are drawn relative to this.
  const bgX   = W - 21;          // background rect left edge
  const bgW   = 14;               // background rect width
  const barCX = bgX + bgW / 2;   // = W - 14: center of the background rect
  const barY  = 44;
  const barH  = H - 70;
  const barW  = 6;                // colored track width

  // Background panel.
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(bgX, barY - 5, bgW, barH + 10);

  // Dark track (the groove the fill sits inside).
  g.fillStyle = '#0a1520';
  g.fillRect(barCX - barW / 2, barY, barW, barH);

  // Colored fill grows from the bottom as the player descends.
  const depthGrad = g.createLinearGradient(0, barY, 0, barY + barH);
  depthGrad.addColorStop(0,   '#00ffcc');
  depthGrad.addColorStop(0.5, '#0077ff');
  depthGrad.addColorStop(1,   '#5500ff');
  g.fillStyle = depthGrad;
  g.fillRect(barCX - barW / 2, barY + barH * (1 - depthFrac), barW, barH * depthFrac);

  // White depth marker — centered on barCX, 10px wide.
  g.fillStyle = '#fff';
  g.fillRect(barCX - 5, barY + barH * depthFrac - 3, 10, 5);

  // Labels above and below, centered on barCX.
  g.fillStyle = '#6699cc';
  g.font      = '9px monospace';
  g.textAlign = 'center';
  g.fillText('▼',  barCX, barY - 9);
  g.fillText('⚓', barCX, barY + barH + 14);

  // ── Hearts + stamina box (top-left) ──
  const hudBoxX = 8;
  const hudW    = 28 + (P.maxHealth - 1) * 26;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(hudBoxX, 8, hudW, 35);

  for (let i = 0; i < P.maxHealth; i++) {
    drawHeart(hudBoxX + 14 + i * 26, 17, 8, i < P.health); // raised 9px (was 26)
  }

  const staminaX = hudBoxX + 6;
  const staminaW = hudW - 12;
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.fillRect(staminaX, 34, staminaW, 5); // raised 2px (was 36)
  const staminaIsFlashing = P.exhausted && Math.floor(t * 8) % 2 === 0;
  g.fillStyle = staminaIsFlashing ? '#ff3344' : '#00ffcc';
  g.fillRect(staminaX, 34, staminaW * (P.stamina / P.maxStamina), 5);

  // ── Top centre: descent/ascent progress strip ──
  const ascDepth = clamp((P.y - SURFACE_Y) / (TREASURE_Y - SURFACE_Y), 0, 1);

  if (!hasTreasure) {
    const pct = Math.floor(ascDepth * 100);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(W / 2 - 100, 6, 200, 20);
    g.fillStyle = '#77ccee';
    g.font      = '11px monospace';
    g.textAlign = 'center';
    g.fillText(`▼  DESCENDING  ${pct}%  ▼`, W / 2, 20);

  } else {
    const ascFrac = 1 - ascDepth;
    const ascPct  = Math.floor(ascFrac * 100);
    const flashing = Math.floor(t * 4) % 2 === 0;

    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(W / 2 - 115, 5, 230, 26);
    g.fillStyle = flashing ? '#ffcc00' : '#ff8800';
    g.font      = 'bold 11px monospace';
    g.textAlign = 'center';
    g.fillText(`⚠  SURFACE!  ${ascPct}%  ⚠`, W / 2, 18);

    // Ascent progress bar.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(W / 2 - 80, 23, 160, 5);
    g.fillStyle = '#ffcc00';
    g.fillRect(W / 2 - 80, 23, 160 * ascFrac, 5);
  }
}

// Draws a heart shape centered at (x, y) with radius r.
// full = true draws a red heart, false draws an empty (dark) heart.
function drawHeart(x, y, r, full) {
  g.fillStyle = full ? '#ff3355' : '#2a0e16';
  g.beginPath();
  g.moveTo(x, y + r * 0.25);
  g.bezierCurveTo(x, y - r * 0.55,  x - r * 1.2, y - r * 0.55,  x - r * 1.2, y + r * 0.2);
  g.bezierCurveTo(x - r * 1.2, y + r * 0.85,  x, y + r * 1.3,  x, y + r * 1.3);
  g.bezierCurveTo(x, y + r * 1.3,  x + r * 1.2, y + r * 0.85,  x + r * 1.2, y + r * 0.2);
  g.bezierCurveTo(x + r * 1.2, y - r * 0.55,  x, y - r * 0.55,  x, y + r * 0.25);
  g.fill();
}


//Overlay

function drawPhaseFlash() {
  const prog  = phaseFlashTimer / 2.5; 
  const alpha = Math.min(1, prog * 3) * 0.85;

  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.fillRect(0, 0, W, H);


  if (prog > 0.2) {
    const textAlpha = Math.min(1, (prog - 0.2) / 0.3);
    g.textAlign = 'center';

    g.fillStyle = `rgba(255,200,0,${textAlpha})`;
    g.font      = 'bold 30px monospace';
    g.fillText('TREASURE OBTAINED', W / 2, H / 2 - 22);

    g.fillStyle = `rgba(255,80,80,${textAlpha})`;
    g.font      = 'bold 17px monospace';
    g.fillText('⚠  ALL ENEMIES ANGERED!  ⚠', W / 2, H / 2 + 10);

    g.fillStyle = `rgba(200,240,255,${textAlpha * 0.7})`;
    g.font      = '14px monospace';
    g.fillText('RUSH TO THE SURFACE!', W / 2, H / 2 + 36);
  }
}


function drawMenu() {

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#000c22');
  bg.addColorStop(1, '#00040e');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Rising bubbles in the background
  g.fillStyle = 'rgba(80,180,255,0.15)';
  for (let i = 0; i < 28; i++) {
    const bx = (Math.sin(t * 0.42 + i * 1.82) * 0.5 + 0.5) * W;
    const by = H - ((t * 18 + i * 71) % H);
    g.beginPath();
    g.arc(bx, by, 1.2 + (i % 4) * 0.7, 0, Math.PI * 2);
    g.fill();
  }


  g.textAlign = 'center';
  g.font      = 'bold 52px monospace';
  g.fillStyle = 'rgba(0,20,60,0.85)';
  g.fillText('DEEP DIVE', W / 2 + 3, 74); 

  const titleGrad = g.createLinearGradient(W / 2 - 150, 0, W / 2 + 150, 0);
  titleGrad.addColorStop(0,   '#00aaff');
  titleGrad.addColorStop(0.5, '#00ffe8');
  titleGrad.addColorStop(1,   '#0066ff');
  g.fillStyle = titleGrad;
  g.fillText('DEEP DIVE', W / 2, 71);

  
  g.fillStyle = '#3a6899';
  g.font      = '13px monospace';
  g.fillText("a diver's desperate treasure hunt", W / 2, 93);

  // Horizontal dividers
  g.strokeStyle = 'rgba(0,120,200,0.35)';
  g.lineWidth   = 1;
  g.beginPath();
  g.moveTo(W / 2 - 180, 106);
  g.lineTo(W / 2 + 180, 106);
  g.stroke();

  // Info panel 
  const panelX = W / 2 - 175;
  const panelY = 110;
  const panelW = 350;
  const panelH = 194;
  g.fillStyle = 'rgba(0,10,30,0.80)';
  drawRoundRect(panelX, panelY, panelW, panelH, 8);
  g.fill();
  g.strokeStyle = 'rgba(0,80,160,0.45)';
  g.lineWidth   = 1;
  drawRoundRect(panelX, panelY, panelW, panelH, 8);
  g.stroke();

  // Phase 1
  g.fillStyle = '#ffcc44';
  g.font      = 'bold 12px monospace';
  g.textAlign = 'left';
  g.fillText('▼  PHASE 1 DESCENT', panelX + 14, panelY + 20);
  const phase1Lines = [
    'Dive deep and find the hidden treasure chest.',
    'It spawns somewhere on the seabed each run.',
    'Enemies patrol getting closer angers them.',
  ];
  g.font = '11px monospace';
  for (let i = 0; i < phase1Lines.length; i++) {
    g.fillStyle = '#7aafd4';
    g.fillText(phase1Lines[i], panelX + 14, panelY + 35 + i * 15);
  }

  // Phase 2 
  g.fillStyle = '#ff7755';
  g.font      = 'bold 12px monospace';
  g.fillText('▲  PHASE 2 ASCENT', panelX + 14, panelY + 103);
  const phase2Lines = [
    'Opening the chest triggers a full wave.',
    'ALL enemies are now angered and will chase you.',
    'Reach the surface to escape.',
  ];
  g.font = '11px monospace';
  for (let i = 0; i < phase2Lines.length; i++) {
    g.fillStyle = '#d47a7a';
    g.fillText(phase2Lines[i], panelX + 14, panelY + 118 + i * 15);
  }

  // Controls bar — snug below panel with matching width.
  g.fillStyle = 'rgba(0,30,70,0.6)';
  drawRoundRect(panelX, panelY + panelH + 6, panelW, 22, 5);
  g.fill();
  g.fillStyle = '#6699bb';
  g.font      = '10px monospace';
  g.textAlign = 'center';
  g.fillText('WASD or ↑↓←→ to move     SHIFT  sprint     ESC / P  pause', W / 2, panelY + panelH + 21);

  // Flashing "PRESS ENTER" prompt.
  if (Math.floor(t * 1.8) % 2 === 0) {
    const promptGrad = g.createLinearGradient(W / 2 - 80, 0, W / 2 + 80, 0);
    promptGrad.addColorStop(0, '#00cc99');
    promptGrad.addColorStop(1, '#00ffcc');
    g.fillStyle = promptGrad;
    g.font      = 'bold 16px monospace';
    g.textAlign = 'center';
    g.fillText('PRESS  ENTER  TO  DIVE', W / 2, H - 16);
  }
}

// Pause overlay (drawn on top of the frozen game world).
function drawPaused() {
  // Dim the world behind the panel.
  g.fillStyle = 'rgba(0,0,0,0.62)';
  g.fillRect(0, 0, W, H);

  // Panel.
  const panelW = 300;
  const panelH = 200;
  const panelX = W / 2 - panelW / 2;
  const panelY = H / 2 - panelH / 2;

  g.fillStyle = 'rgba(0,10,28,0.92)';
  drawRoundRect(panelX, panelY, panelW, panelH, 10);
  g.fill();
  g.strokeStyle = 'rgba(0,100,200,0.55)';
  g.lineWidth   = 1.5;
  drawRoundRect(panelX, panelY, panelW, panelH, 10);
  g.stroke();

  // "PAUSED" title with drop shadow.
  g.textAlign = 'center';
  g.font      = 'bold 32px monospace';
  g.fillStyle = '#224466';
  g.fillText('PAUSED', W / 2 + 2, panelY + 50);
  g.fillStyle = '#aaddff';
  g.fillText('PAUSED', W / 2, panelY + 48);

  // Divider.
  g.strokeStyle = 'rgba(0,100,180,0.3)';
  g.lineWidth   = 1;
  g.beginPath();
  g.moveTo(panelX + 24, panelY + 62);
  g.lineTo(panelX + panelW - 24, panelY + 62);
  g.stroke();

  // Resume button.
  g.fillStyle = 'rgba(0,180,120,0.12)';
  drawRoundRect(panelX + 30, panelY + 76, panelW - 60, 34, 6);
  g.fill();
  g.strokeStyle = 'rgba(0,220,150,0.40)';
  g.lineWidth   = 1;
  drawRoundRect(panelX + 30, panelY + 76, panelW - 60, 34, 6);
  g.stroke();
  g.font      = 'bold 14px monospace';
  g.fillStyle = '#00ffcc';
  g.fillText('▶  RESUME  [ ENTER / ESC ]', W / 2, panelY + 98);

  // Main menu button.
  g.fillStyle = 'rgba(0,80,160,0.12)';
  drawRoundRect(panelX + 30, panelY + 120, panelW - 60, 34, 6);
  g.fill();
  g.strokeStyle = 'rgba(60,140,220,0.40)';
  g.lineWidth   = 1;
  drawRoundRect(panelX + 30, panelY + 120, panelW - 60, 34, 6);
  g.stroke();
  g.font      = 'bold 14px monospace';
  g.fillStyle = '#88bbee';
  g.fillText('⌂  MAIN MENU  [ M ]', W / 2, panelY + 142);

  // Hint text.
  g.font      = '10px monospace';
  g.fillStyle = '#335566';
  g.fillText('P or ESC also resumes', W / 2, panelY + panelH - 12);

  // Handle key input inside the draw function (simpler than managing it elsewhere).
  if (KEYS.has('KeyM'))  { STATE = 'menu';    KEYS.clear(); }
  if (isAction())        { STATE = 'playing'; KEYS.clear(); }
}

// Win screen.
function drawWin() {
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.fillRect(0, 0, W, H);

  // Animated gold shimmer behind the panel.
  const shimmer = g.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 260);
  shimmer.addColorStop(0, `rgba(255,200,0,${0.18 + Math.sin(t) * 0.05})`);
  shimmer.addColorStop(1, 'rgba(255,180,0,0)');
  g.fillStyle = shimmer;
  g.fillRect(0, 0, W, H);

  const panelW = 320;
  const panelH = 156;
  const panelX = W / 2 - panelW / 2;
  const panelY = H / 2 - panelH / 2; // perfectly centered, no offset

  g.fillStyle = 'rgba(20,14,0,0.88)';
  drawRoundRect(panelX, panelY, panelW, panelH, 10);
  g.fill();
  g.strokeStyle = 'rgba(180,140,0,0.5)';
  g.lineWidth   = 1.5;
  drawRoundRect(panelX, panelY, panelW, panelH, 10);
  g.stroke();

  g.textAlign = 'center';
  g.font      = 'bold 48px monospace';
  g.fillStyle = '#221100';
  g.fillText('ESCAPED!', W / 2 + 2, panelY + 56);
  g.fillStyle = '#ffdd00';
  g.fillText('ESCAPED!', W / 2, panelY + 54);

  g.font      = '13px monospace';
  g.fillStyle = '#ddaa66';
  g.fillText('The treasure is yours, brave diver!', W / 2, panelY + 84);

  g.strokeStyle = 'rgba(120,90,0,0.3)';
  g.lineWidth   = 1;
  g.beginPath();
  g.moveTo(panelX + 20, panelY + 100);
  g.lineTo(panelX + panelW - 20, panelY + 100);
  g.stroke();

  g.font      = '11px monospace';
  g.fillStyle = '#667788';
  g.fillText('ENTER  play again        M  main menu', W / 2, panelY + 124);

  if (KEYS.has('KeyM')) { STATE = 'menu'; resetGame(); KEYS.clear(); }
}

// Game over screen.
function drawDead() {
  g.fillStyle = 'rgba(0,0,0,0.82)';
  g.fillRect(0, 0, W, H);

  // Red blood pool shimmer.
  const blood = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 260);
  blood.addColorStop(0, 'rgba(180,0,0,0.32)');
  blood.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = blood;
  g.fillRect(0, 0, W, H);

  const panelW = 320;
  const panelH = 156;
  const panelX = W / 2 - panelW / 2;
  const panelY = H / 2 - panelH / 2; // perfectly centered, no offset

  g.fillStyle = 'rgba(20,0,0,0.90)';
  drawRoundRect(panelX, panelY, panelW, panelH, 10);
  g.fill();
  g.strokeStyle = 'rgba(160,0,0,0.5)';
  g.lineWidth   = 1.5;
  drawRoundRect(panelX, panelY, panelW, panelH, 10);
  g.stroke();

  g.textAlign = 'center';
  g.font      = 'bold 46px monospace';
  g.fillStyle = '#330000';
  g.fillText('GAME OVER', W / 2 + 2, panelY + 56);
  g.fillStyle = '#ff3333';
  g.fillText('GAME OVER', W / 2, panelY + 54);

  g.font      = '13px monospace';
  g.fillStyle = '#bb6666';
  g.fillText('The deep has claimed you...', W / 2, panelY + 84);

  g.strokeStyle = 'rgba(120,0,0,0.3)';
  g.lineWidth   = 1;
  g.beginPath();
  g.moveTo(panelX + 20, panelY + 100);
  g.lineTo(panelX + panelW - 20, panelY + 100);
  g.stroke();

  g.font      = '11px monospace';
  g.fillStyle = '#667788';
  g.fillText('ENTER  try again        M  main menu', W / 2, panelY + 124);

  if (KEYS.has('KeyM')) { STATE = 'menu'; resetGame(); KEYS.clear(); }
}


// Tutorial overlay

function drawTutorial() {
  // Dim everything behind the card.
  g.fillStyle = 'rgba(0,0,0,0.72)';
  g.fillRect(0, 0, W, H);

  const PAGES = 3;
  const cardW = 430;
  const cardH = 310;
  const cardX = W / 2 - cardW / 2;
  const cardY = H / 2 - cardH / 2;

  // Card background.
  g.fillStyle = 'rgba(4,10,28,0.96)';
  drawRoundRect(cardX, cardY, cardW, cardH, 12);
  g.fill();

  // Border colour changes per page.
  const borderColors = [
    'rgba(0,180,255,0.7)',
    'rgba(255,140,40,0.7)',
    'rgba(255,60,80,0.7)',
  ];
  g.strokeStyle = borderColors[tutorialSlide];
  g.lineWidth   = 2;
  drawRoundRect(cardX, cardY, cardW, cardH, 12);
  g.stroke();

  // ── Page title ──
  const pageTitles  = ['MISSION & CONTROLS', 'FISH ENEMIES', 'MINES'];
  const pageTColors = ['#00ccff', '#ffaa44', '#ff5566'];
  g.textAlign = 'center';
  g.font      = 'bold 15px monospace';
  g.fillStyle = pageTColors[tutorialSlide];
  g.fillText(pageTitles[tutorialSlide], W / 2, cardY + 24);

  // Divider below title.
  g.strokeStyle = borderColors[tutorialSlide];
  g.lineWidth   = 1;
  g.beginPath();
  g.moveTo(cardX + 16, cardY + 32);
  g.lineTo(cardX + cardW - 16, cardY + 32);
  g.stroke();

  
  const cx  = cardX + 16;      
  const sw  = cardW - 32;        
  const row = cardY + 50;       

  if (tutorialSlide === 0) {
    // Mission page
    g.font = 'bold 11px monospace'; g.fillStyle = '#ffcc44'; g.textAlign = 'left';
    g.fillText('OBJECTIVE', cx, row);
    const missionLines = [
      'A treasure chest is hidden on the seabed',
      'Dive down, locate it, and rush back to the surface.',
      'The chest spawns at a random location each dive.',
    ];
    g.font = '11px monospace'; g.fillStyle = '#aaccdd';
    missionLines.forEach((l, i) => g.fillText(l, cx, row + 14 + i * 15));

    // Phase block
    g.font = 'bold 11px monospace'; g.fillStyle = '#ffcc44';
    g.fillText('PHASES', cx, row + 68);
    const phaseLines = [
      '▼ DESCENT  Navigate to the chest your way to the chest while dodging enemies.',
      '▲ ASCENT  Grab the treasure. ALL enemies while be after you, so rush to the surface!',
    ];
    g.font = '11px monospace'; g.fillStyle = '#aaccdd';
    let phaseY = row + 82;
    for (const line of phaseLines) {
      phaseY = wrapText(line, cx, phaseY, cardW - 32, 14);
    }

    // Controls block — positioned 14px below wherever the phase text ended
    const ctrlHeadY = phaseY + 14;
    g.font = 'bold 11px monospace'; g.fillStyle = '#ffcc44';
    g.fillText('CONTROLS', cx, ctrlHeadY);
    const ctrlLines = [
      'WASD / Arrows  — to swim          SHIFT  — Sprint',
      'ESC / P        — Pause         ENTER  — Confirm',
    ];
    g.font = '11px monospace'; g.fillStyle = '#aaccdd';
    ctrlLines.forEach((l, i) => g.fillText(l, cx, ctrlHeadY + 14 + i * 15));

  } else if (tutorialSlide === 1) {
    // Page 2 fishes

    const spriteScale = 1.6;
    const rowH        = 72;
    const SPRITE_BOX  = 70;  // fixed column width for sprite — gives it breathing room
    const spriteCol   = cx + 8;                 // slight indent from card edge
    const textCol     = cx + SPRITE_BOX + 20;   // text always starts here
    const enemies2    = [
      {
        key:   'fish',
        label: 'FISH',
        col:   '#88ccff',
        stats: ['A normal enemy with a medium speed, dealing 1 DMG', 'Are sometimes found in groups'],
      },
      {
        key:   'fishbig',
        label: 'BIG FISH',
        col:   '#ffaa44',
        stats: ['Slower but bigger, dealing 1 DMG.'],
      },
      {
        key:   'dart',
        label: 'DARTFISH',
        col:   '#ff6688',
        stats: ['Spawns deep and is extremely fast, deals 1 DMG.', 'Hard to dodge'],
      },
    ];

    enemies2.forEach((e, i) => {
      
      const extraY = i >= 1 ? 15 : 0;
      const rowY = row + i * rowH + extraY;
     
      const sc  = spriteScale;
      const sw2 = spriteW(e.key, sc);
      const sh  = spriteH(e.key, sc);
      const sx  = spriteCol + (SPRITE_BOX - sw2) / 2;
      const sy  = rowY + (rowH - sh) / 2 - 19;  
      drawSprite(e.key, 0, 0, sx, sy, sc, false);

      g.font      = 'bold 12px monospace';
      g.fillStyle = e.col;
      g.textAlign = 'left';
      g.fillText(e.label, textCol, rowY + 12);
      
      g.font      = '10px monospace';
      g.fillStyle = '#aaccdd';
      e.stats.forEach((s, si) => g.fillText(s, textCol, rowY + 26 + si * 13));

      if (i < enemies2.length - 1) {
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth   = 1;
        g.beginPath();
        g.moveTo(cx, rowY + rowH - 4);
        g.lineTo(cx + sw, rowY + rowH - 4);
        g.stroke();
      }
    });

  } else {
    //mines page

    const SPRITE_BOX = 52;  
    const spriteCol  = cx + 8;                 
    const textCol    = cx + SPRITE_BOX + 36;   
    const rowH       = 82;

    const mines3 = [
      {
        key:   'minesml',
        sc:    1.0,           
        label: 'SMALL MINE',
        col:   '#aaffcc',
        stats: ['Tiny and easy to swim past, but hard to notice.', '1 DMG on contact.'],
      },
      {
        key:   'mine',
        sc:    1.4,          
        label: 'MINE',
        col:   '#33ff88',
        stats: ['Stationary and bobs gently in place.', '1 DMG on contact'],
      },
      {
        key:   'minebig',
        sc:    1.2,           // capped down so the big mine fits within the sprite box
        label: 'BIG MINE',
        col:   '#ff6622',
        stats: ['A giant obstacle with an even bigger explosion', '2 DMG on contact.'],
      },
    ];

    mines3.forEach((e, i) => {
      const rowY = row + i * rowH;
    
      const sw2 = spriteW(e.key, e.sc);
      const sh  = spriteH(e.key, e.sc);
      const sx  = spriteCol + (SPRITE_BOX - sw2) / 2;       
      const sy  = rowY + (rowH - sh) / 2 - 6;         
      drawSprite(e.key, 0, 0, sx, sy, e.sc, false);

      g.font      = 'bold 12px monospace';
      g.fillStyle = e.col;
      g.textAlign = 'left';
      g.fillText(e.label, textCol, rowY + 16);
      g.font      = '10px monospace';
      g.fillStyle = '#aaccdd';
      e.stats.forEach((s, si) => g.fillText(s, textCol, rowY + 30 + si * 15));

      if (i < mines3.length - 1) {
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth   = 1;
        g.beginPath();
        g.moveTo(cx, rowY + rowH - 4);
        g.lineTo(cx + sw, rowY + rowH - 4);
        g.stroke();
      }
    });
  }

  // Page dots
  const dotY = cardY + cardH - 32; 
  for (let i = 0; i < PAGES; i++) {
    const active = i === tutorialSlide;
    g.fillStyle = active ? pageTColors[tutorialSlide] : 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.arc(W / 2 - (PAGES - 1) * 8 + i * 16, dotY, active ? 5 : 3.5, 0, Math.PI * 2);
    g.fill();
  }

 
  const isLast  = tutorialSlide === PAGES - 1;
  const prompt  = isLast ? '→ / ENTER  —  START DIVING' : '← →  navigate     ENTER  confirm';
  const blinkOn = Math.floor(t * 2) % 2 === 0;
  if (blinkOn) {
    g.font      = 'bold 10px monospace';
    g.fillStyle = isLast ? pageTColors[tutorialSlide] : '#ffffff';
    g.textAlign = 'center';
    g.fillText(prompt, W / 2, cardY + cardH - 10); 
  }

  // inputs
  if (isRight() || isAction()) {
    KEYS.clear();
    if (isLast) {
      tutorialSeen = true;
      STATE        = 'playing';
    } else {
      tutorialSlide++;
    }
  } else if (isLeft() && tutorialSlide > 0) {
    KEYS.clear();
    tutorialSlide--;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rgb(r, g2, b) {
  return `rgb(${r | 0},${g2 | 0},${b | 0})`;
}

// Draws text that wraps at maxWidth. Returns the Y position after the last line.
function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxWidth && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) { g.fillText(line, x, y); y += lineHeight; }
  return y;
}

function drawRoundRect(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);     g.quadraticCurveTo(x + w, y,     x + w, y + r);
  g.lineTo(x + w,     y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r,     y + h);     g.quadraticCurveTo(x,     y + h, x,         y + h - r);
  g.lineTo(x,         y + r);     g.quadraticCurveTo(x,     y,     x + r,     y);
  g.closePath();
}
