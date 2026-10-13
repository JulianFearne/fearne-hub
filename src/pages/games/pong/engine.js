// src/pages/games/pong/engine.js
// Pong rules with no DOM or React, so whole games can be simulated in node.
// The court is portrait: the player's paddle is at the bottom, the computer
// (or second player) at the top, and the ball bounces off the side walls.
//
// Everything is in world units: the court is always WORLD_W wide, and its
// height is picked once per game from the screen's shape (courtHeight), so a
// tall phone gets a taller court rather than wide empty bars. The page scales
// the world to fit the canvas and letterboxes anything left over. Randomness comes from the rng passed to createGame.

export const WORLD_W = 300

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const WORLD_H = 500 // default court height
const MIN_H = 440
const MAX_H = 660

// Court height for a play area of cssW x cssH.
export function courtHeight(cssW, cssH) {
  if (!cssW || !cssH) return WORLD_H
  return Math.round(clamp((WORLD_W * cssH) / cssW, MIN_H, MAX_H))
}
export const STEP_MS = 1000 / 120
export const WIN_SCORE = 7
export const WALL_LIVES = 3
export const SERVE_MS = 2400 // 3, 2, 1 at 800ms each

export const BALL_R = 7
export const PADDLE_H = 14
const PADDLE_GAP = 34 // paddle centre to the end of the court
const MAX_BOUNCE = (60 * Math.PI) / 180 // steepest angle off a paddle edge
const KEY_SPEED = 420 // world units a second for keyboard play
const FOLLOW = 22 // finger smoothing: higher sticks closer to the finger
const FOLLOW_MAX = 1600
const TRAIL = 9

export const MODES = {
  cpu: { label: 'Vs computer' },
  duo: { label: 'Two players' },
  wall: { label: 'Wall rally' },
}

export const LEVELS = {
  easy: { label: 'Easy' },
  medium: { label: 'Medium' },
  hard: { label: 'Hard' },
}

// Ball speeds are world units a second. `cpu` tunes the computer: how fast
// its paddle can move, how far off its aim is, how often it rethinks, how
// often it has a lapse, and whether it works out the bounce off the walls.
const SETTINGS = {
  easy: {
    speed: 165, gain: 5, maxSpeed: 290, playerW: 112, otherW: 66,
    cpu: { speed: 105, error: 62, think: 420, lapse: 0.15, predict: false },
  },
  medium: {
    speed: 235, gain: 11, maxSpeed: 470, playerW: 78, otherW: 64,
    cpu: { speed: 200, error: 34, think: 240, lapse: 0.1, predict: true },
  },
  hard: {
    speed: 290, gain: 15, maxSpeed: 600, playerW: 66, otherW: 62,
    cpu: { speed: 320, error: 17, think: 130, lapse: 0.05, predict: true },
  },
  duo: { speed: 235, gain: 12, maxSpeed: 520, playerW: 78, otherW: 78, cpu: null },
  wall: { speed: 215, gain: 10, maxSpeed: 640, playerW: 80, otherW: 0, cpu: null },
}

function settingsFor(mode, level) {
  if (mode === 'cpu') return SETTINGS[level] ?? SETTINGS.medium
  return SETTINGS[mode] ?? SETTINGS.duo
}

function makePaddle(w, y) {
  return { x: WORLD_W / 2, y, w, target: null }
}

export function createGame(mode = 'cpu', level = 'medium', rng = Math.random, height = WORLD_H) {
  const s = settingsFor(mode, level)
  const game = {
    mode,
    level,
    rng,
    s,
    h: height,
    status: 'serve', // 'serve' | 'play' | 'over'
    serveLeft: SERVE_MS,
    serveTo: 1, // +1 serves down to the bottom player, -1 up to the top
    bottom: makePaddle(s.playerW, height - PADDLE_GAP),
    top: mode === 'wall' ? null : makePaddle(s.otherW, PADDLE_GAP),
    ball: { x: WORLD_W / 2, y: height / 2, vx: 0, vy: 0, speed: s.speed },
    trail: [],
    score: { bottom: 0, top: 0 },
    hits: 0, // paddle hits this game (the wall rally score)
    rally: 0, // hits since the last serve
    lives: mode === 'wall' ? WALL_LIVES : 0,
    winner: null, // 'bottom' | 'top' when over (two-player modes)
    events: [], // 'hit' | 'wall' | 'miss', drained by the page each frame
    ai: { target: WORLD_W / 2, thinkLeft: 0, error: 0, approaching: false },
    time: 0,
  }
  // The first serve heads away from the computer, towards the player.
  game.serveTo = 1
  resetBall(game)
  return game
}

function resetBall(game) {
  const b = game.ball
  b.x = WORLD_W / 2
  b.y = game.mode === 'wall' ? game.h * 0.35 : game.h / 2
  b.vx = 0
  b.vy = 0
  b.speed = game.s.speed
  game.trail = []
  game.rally = 0
  game.status = 'serve'
  game.serveLeft = SERVE_MS
}

function launch(game) {
  const b = game.ball
  const angle = (game.rng() * 2 - 1) * (25 * Math.PI) / 180
  b.vx = Math.sin(angle) * b.speed
  b.vy = Math.cos(angle) * b.speed * game.serveTo
  game.status = 'play'
}

// Whole seconds left on the serve countdown (3, 2, 1), or 0 when in play.
export function serveCount(game) {
  return game.status === 'serve' ? Math.ceil(game.serveLeft / (SERVE_MS / 3)) : 0
}

// input: { bottomTarget, topTarget } world x of a finger (or null), and
// { bottomDir, topDir } -1, 0 or 1 from the keyboard.
function movePaddle(p, target, dir, dt) {
  if (!p) return
  if (dir) {
    p.x += dir * KEY_SPEED * dt
  } else if (target != null) {
    const want = (target - p.x) * Math.min(1, FOLLOW * dt)
    const most = FOLLOW_MAX * dt
    p.x += clamp(want, -most, most)
  }
  p.x = clamp(p.x, p.w / 2, WORLD_W - p.w / 2)
}

// Where the ball will cross height y, folding its path off the side walls.
function predictX(ball, y) {
  if (ball.vy === 0) return ball.x
  const t = (y - ball.y) / ball.vy
  if (t < 0) return ball.x
  const lo = BALL_R
  const span = WORLD_W - 2 * BALL_R
  let x = ball.x + ball.vx * t - lo
  x = ((x % (2 * span)) + 2 * span) % (2 * span)
  if (x > span) x = 2 * span - x
  return x + lo
}

function thinkCpu(game, dt) {
  const p = game.top
  const c = game.s.cpu
  const ai = game.ai
  const b = game.ball
  const approaching = game.status === 'play' && b.vy < 0
  // A fresh aiming error for each approach, so it doesn't shiver about.
  if (approaching && !ai.approaching) {
    // Long, fast rallies wear it down, so even Hard can be beaten.
    const lapse = game.rng() < c.lapse + game.rally * 0.012 ? 3 : 1
    ai.error = (game.rng() * 2 - 1) * c.error * lapse
  }
  ai.approaching = approaching
  ai.thinkLeft -= dt * 1000
  if (ai.thinkLeft <= 0) {
    ai.thinkLeft = c.think
    if (approaching) {
      const aimAt = c.predict ? predictX(b, p.y + PADDLE_H / 2 + BALL_R) : b.x
      ai.target = aimAt + ai.error
    } else {
      // Drift back towards the middle while the ball is going away.
      ai.target = WORLD_W / 2 + (b.x - WORLD_W / 2) * 0.3
    }
  }
  const most = c.speed * dt
  p.x += clamp(ai.target - p.x, -most, most)
  p.x = clamp(p.x, p.w / 2, WORLD_W - p.w / 2)
}

// The angle off a paddle depends on where it hits: the middle sends it
// straight back, the edges send it off steeply.
function bounceOff(game, p, dirY) {
  const b = game.ball
  const reach = p.w / 2 + BALL_R
  const off = clamp((b.x - p.x) / reach, -1, 1)
  const angle = off * MAX_BOUNCE
  b.speed = Math.min(game.s.maxSpeed, b.speed + game.s.gain)
  b.vx = Math.sin(angle) * b.speed
  b.vy = Math.cos(angle) * b.speed * dirY
  game.hits += 1
  game.rally += 1
  game.events.push('hit')
}

function pointTo(game, side) {
  game.events.push('miss')
  if (game.mode === 'wall') {
    game.lives -= 1
    if (game.lives <= 0) {
      game.status = 'over'
      game.ball.vx = game.ball.vy = 0
      return
    }
    game.serveTo = -1
    resetBall(game)
    return
  }
  game.score[side] += 1
  if (game.score[side] >= WIN_SCORE) {
    game.status = 'over'
    game.winner = side
    game.ball.vx = game.ball.vy = 0
    return
  }
  // Serve towards whoever just lost the point, so they get the next touch.
  game.serveTo = side === 'top' ? 1 : -1
  resetBall(game)
}

function moveBall(game, dt) {
  const b = game.ball
  const prevY = b.y
  b.x += b.vx * dt
  b.y += b.vy * dt

  if (b.x < BALL_R) {
    b.x = BALL_R + (BALL_R - b.x)
    b.vx = Math.abs(b.vx)
    game.events.push('wall')
  } else if (b.x > WORLD_W - BALL_R) {
    b.x = WORLD_W - BALL_R - (b.x - (WORLD_W - BALL_R))
    b.vx = -Math.abs(b.vx)
    game.events.push('wall')
  }

  // Bottom paddle: did the ball's lower edge cross the paddle's top face this
  // step? Checking the crossing (not the overlap) stops fast balls tunnelling.
  const bp = game.bottom
  const face = bp.y - PADDLE_H / 2
  if (b.vy > 0 && prevY + BALL_R <= face + 2 && b.y + BALL_R >= face) {
    if (Math.abs(b.x - bp.x) <= bp.w / 2 + BALL_R) {
      b.y = face - BALL_R
      bounceOff(game, bp, -1)
    }
  }

  const tp = game.top
  if (tp) {
    const tface = tp.y + PADDLE_H / 2
    if (b.vy < 0 && prevY - BALL_R >= tface - 2 && b.y - BALL_R <= tface) {
      if (Math.abs(b.x - tp.x) <= tp.w / 2 + BALL_R) {
        b.y = tface + BALL_R
        bounceOff(game, tp, 1)
      }
    }
  } else if (b.y < BALL_R) {
    // Wall rally: the top of the court is a wall.
    b.y = BALL_R + (BALL_R - b.y)
    b.vy = Math.abs(b.vy)
    game.events.push('wall')
  }

  if (b.y > game.h + BALL_R * 2) pointTo(game, 'top')
  else if (tp && b.y < -BALL_R * 2) pointTo(game, 'bottom')
}

export function step(game, input = {}) {
  if (game.status === 'over') return
  const dt = STEP_MS / 1000
  game.time += STEP_MS

  movePaddle(game.bottom, input.bottomTarget, input.bottomDir, dt)
  if (game.top) {
    if (game.mode === 'cpu') thinkCpu(game, dt)
    else movePaddle(game.top, input.topTarget, input.topDir, dt)
  }

  if (game.status === 'serve') {
    game.serveLeft -= STEP_MS
    if (game.serveLeft <= 0) launch(game)
    return
  }

  moveBall(game, dt)
  if (game.status === 'play') {
    game.trail.push({ x: game.ball.x, y: game.ball.y })
    if (game.trail.length > TRAIL) game.trail.shift()
  }
}

// Seeded rng for tests and simulations (mulberry32).
export function seededRng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
