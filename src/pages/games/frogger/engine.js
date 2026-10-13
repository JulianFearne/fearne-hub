// src/pages/games/frogger/engine.js
// Frogger rules with no DOM or React, so whole games can be simulated in node.
// The world is measured in cells: 11 wide by 13 tall, row 0 at the top (the
// bank with the home bays) and row 12 at the bottom (the starting grass).
// Lane objects move continuously and wrap round, and the frog's x is a float
// so it can drift along with a log rather than snapping to a column.
//
// Randomness only comes from the rng passed to createGame, so a seeded rng
// gives a repeatable game.

export const COLS = 11
export const ROWS = 13
export const STEP_MS = 1000 / 60
export const HOP_MS = 120
export const HOME_ROW = 0
export const VERGE_ROW = 6
export const START_ROW = 12
export const START_X = 5.5
export const BAY_X = [1.5, 3.5, 5.5, 7.5, 9.5]
export const DEATH_MS = 900

export const MODES = {
  easy: {
    label: 'Easy',
    lives: 5,
    timer: 0, // no time limit
    speed: 0.55,
    logBonus: 1.5, // extra log length
    turtleBonus: 1, // extra turtle in each group
    riverExtra: 1, // one more log or turtle group per lane
    roadFewer: 1, // one fewer vehicle per lane
    diving: false,
    bayReach: 0.95, // how far off a bay still counts as in it
    standGrace: 0.35, // how far past a log's end the frog can still stand
    hitInset: 0.15, // vehicles hit a bit less than their full size
  },
  classic: {
    label: 'Classic',
    lives: 3,
    timer: 30000,
    speed: 1,
    logBonus: 0,
    turtleBonus: 0,
    riverExtra: 0,
    roadFewer: 0,
    diving: true,
    bayReach: 0.55,
    standGrace: 0.12,
    hitInset: 0.05,
  },
}

// Base lanes for level 1 in classic. len is cells (for turtles, the number
// in the group); speed is cells per second; gap is the least room between
// two objects in the lane.
const ROAD = [
  { row: 11, kind: 'car', len: 1, dir: -1, speed: 1.2, count: 3, gap: 2, colour: 0 },
  { row: 10, kind: 'van', len: 1.6, dir: 1, speed: 0.9, count: 3, gap: 2, colour: 1 },
  { row: 9, kind: 'sports', len: 1.1, dir: -1, speed: 3.2, count: 1, gap: 4, colour: 2 },
  { row: 8, kind: 'lorry', len: 3, dir: 1, speed: 1.0, count: 2, gap: 3, colour: 3 },
  { row: 7, kind: 'car', len: 1, dir: -1, speed: 1.7, count: 3, gap: 2, colour: 4 },
]
const RIVER = [
  { row: 5, kind: 'turtle', len: 3, dir: -1, speed: 1.0, count: 3, gap: 1.5, dive: true },
  { row: 4, kind: 'log', len: 3, dir: 1, speed: 0.8, count: 3, gap: 1.5 },
  { row: 3, kind: 'log', len: 5, dir: 1, speed: 1.6, count: 2, gap: 2 },
  { row: 2, kind: 'turtle', len: 2, dir: -1, speed: 1.2, count: 4, gap: 1.5, dive: true },
  { row: 1, kind: 'log', len: 4, dir: 1, speed: 1.1, count: 3, gap: 1.5 },
]

export function rowKind(row) {
  if (row === HOME_ROW) return 'home'
  if (row < VERGE_ROW) return 'river'
  if (row === VERGE_ROW) return 'verge'
  if (row < START_ROW) return 'road'
  return 'start'
}

// One lane at a given level. Objects are spread evenly round a loop (span)
// that is always longer than the screen plus one object, so an object
// leaving one side is never visible at the other at the same time.
function buildLane(def, level, cfg, rng) {
  const river = def.kind === 'log' || def.kind === 'turtle'
  const levelSpeed = Math.min(2, 1 + 0.12 * (level - 1))
  let len = def.len
  let count = def.count
  if (def.kind === 'log') len = Math.max(2, len + cfg.logBonus - 0.5 * Math.floor((level - 1) / 2))
  if (def.kind === 'turtle') len = def.len + cfg.turtleBonus
  if (river) count += cfg.riverExtra
  else count = Math.max(1, count - cfg.roadFewer + Math.min(2, Math.floor((level - 1) / 2)))
  const span = Math.max(count * (len + def.gap), COLS + len + 1)
  const spacing = span / count
  const offset = rng() * spacing
  const objects = []
  for (let i = 0; i < count; i++) {
    const obj = { x: offset + i * spacing - len, len }
    // Every other turtle group dives, so there is always a safe one nearby.
    if (def.dive && cfg.diving && i % 2 === 0) {
      obj.dive = { period: 6000 + rng() * 2500, phase: rng() * 6000 }
    }
    obj.depth = 0
    objects.push(obj)
  }
  for (const o of objects) wrapObject(o, def.dir, span)
  return {
    row: def.row,
    kind: def.kind,
    dir: def.dir,
    colour: def.colour ?? 0,
    vx: def.dir * def.speed * cfg.speed * levelSpeed,
    span,
    objects,
  }
}

function wrapObject(o, dir, span) {
  if (dir > 0) {
    while (o.x > COLS) o.x -= span
  } else {
    while (o.x + o.len < 0) o.x += span
  }
}

function buildLanes(level, cfg, rng) {
  return [...ROAD, ...RIVER].map((def) => buildLane(def, level, cfg, rng))
}

function newFrog(cfg) {
  return {
    x: START_X,
    row: START_ROW,
    fromX: START_X,
    fromRow: START_ROW,
    toX: START_X,
    toRow: START_ROW,
    hopT: 0, // ms into the current hop, 0 when sitting
    hopping: false,
    face: 'up',
    bestRow: START_ROW,
    timeLeft: cfg.timer,
  }
}

export function createGame(mode = 'classic', rng = Math.random) {
  const cfg = MODES[mode] ?? MODES.classic
  return {
    mode: MODES[mode] ? mode : 'classic',
    cfg,
    rng,
    status: 'ready', // 'ready' | 'playing' | 'over'
    score: 0,
    lives: cfg.lives,
    level: 1,
    time: 0,
    lanes: buildLanes(1, cfg, rng),
    bays: BAY_X.map(() => false),
    frog: newFrog(cfg),
    queued: null,
    dying: null, // { kind: 'splash' | 'squash', x, row, t }
    fly: null, // { bay, t } while a fly sits in a bay
    flyWait: 4000 + rng() * 6000,
    banner: null, // { text, t } shown briefly over the play area
    homeFlash: null, // { bay, t } sparkle when a frog gets home
    events: [], // drained by the page for buzzes: 'die', 'home', 'level', 'over'
  }
}

export function startGame(game) {
  if (game.status === 'ready') game.status = 'playing'
}

export function laneAt(game, row) {
  return game.lanes.find((l) => l.row === row) ?? null
}

// Queue a hop. One hop can wait while the current one animates; more taps
// than that are dropped so a burst of swipes can't run the frog into a car.
export function hop(game, dir) {
  if (game.status !== 'playing' || game.dying) return
  if (game.frog.hopping) {
    if (!game.queued) game.queued = dir
    return
  }
  beginHop(game, dir)
}

function snapX(x) {
  return Math.min(COLS - 0.5, Math.max(0.5, Math.round(x - 0.5) + 0.5))
}

function beginHop(game, dir) {
  const f = game.frog
  f.face = dir
  let toX = f.x
  let toRow = f.row
  if (dir === 'up') toRow -= 1
  else if (dir === 'down') toRow += 1
  else if (dir === 'left') toX -= 1
  else if (dir === 'right') toX += 1
  if (toRow < HOME_ROW || toRow > START_ROW) return
  if (toX < 0.4 || toX > COLS - 0.4) return
  // Land rows keep the frog on the grid so the road reads cleanly.
  const kind = rowKind(toRow)
  if (kind === 'road' || kind === 'verge' || kind === 'start') toX = snapX(toX)
  f.fromX = f.x
  f.fromRow = f.row
  f.toX = toX
  f.toRow = toRow
  f.hopT = 0
  f.hopping = true
}

// The row the frog counts as being in mid-hop (it changes lane halfway).
export function frogRow(f) {
  if (!f.hopping) return f.row
  return f.hopT < HOP_MS / 2 ? f.fromRow : f.toRow
}

export function hopProgress(f) {
  return f.hopping ? Math.min(1, f.hopT / HOP_MS) : 0
}

// Turtle depth for drawing and riding: 0 up, rising to 1 when fully under.
// The sinking stretch is the warning; the turtles still hold the frog then.
function diveDepth(dive, time) {
  const t = (time + dive.phase) % dive.period
  const up = dive.period - 3000
  if (t < up) return 0
  const s = t - up
  if (s < 1000) return s / 1000 // sinking
  if (s < 2000) return 1 // under
  return 1 - (s - 2000) / 1000 // rising
}

function moveLanes(game, dt) {
  for (const lane of game.lanes) {
    const dx = (lane.vx * dt) / 1000
    for (const o of lane.objects) {
      o.x += dx
      wrapObject(o, lane.dir, lane.span)
      o.depth = o.dive ? diveDepth(o.dive, game.time) : 0
    }
  }
}

function die(game, kind) {
  const f = game.frog
  game.dying = { kind, x: f.x, row: frogRow(f), t: DEATH_MS }
  game.lives -= 1
  game.queued = null
  game.events.push('die')
}

function resetFrog(game) {
  game.frog = newFrog(game.cfg)
  game.queued = null
}

function standingOn(game, lane, x) {
  const g = game.cfg.standGrace
  for (const o of lane.objects) {
    if (o.depth >= 0.95) continue // under water
    if (x >= o.x - g && x <= o.x + o.len + g) return o
  }
  return null
}

function hitByVehicle(game, lane, x) {
  const inset = game.cfg.hitInset
  const half = 0.32
  for (const o of lane.objects) {
    if (x + half > o.x + inset && x - half < o.x + o.len - inset) return true
  }
  return false
}

function nearestBay(x) {
  let best = 0
  for (let i = 1; i < BAY_X.length; i++) {
    if (Math.abs(BAY_X[i] - x) < Math.abs(BAY_X[best] - x)) best = i
  }
  return best
}

function land(game) {
  const f = game.frog
  f.hopping = false
  f.hopT = 0
  f.x = f.toX
  f.row = f.toRow
  if (f.row < f.bestRow) {
    game.score += 10 * (f.bestRow - f.row)
    f.bestRow = f.row
  }
  if (f.row !== HOME_ROW) return

  const cfg = game.cfg
  // Easy mode looks for the nearest empty bay rather than the nearest bay.
  let bay = nearestBay(f.x)
  if (game.mode === 'easy' && game.bays[bay]) {
    const open = BAY_X.map((bx, i) => ({ i, d: Math.abs(bx - f.x) })).filter((b) => !game.bays[b.i])
    open.sort((a, b) => a.d - b.d)
    if (open.length) bay = open[0].i
  }
  const inBay = Math.abs(BAY_X[bay] - f.x) <= cfg.bayReach && !game.bays[bay]
  if (!inBay) {
    if (game.mode === 'easy') {
      // Kids get bounced back instead of losing a life.
      f.x = f.fromX
      f.row = f.fromRow
      f.face = 'down'
      return
    }
    die(game, 'squash')
    return
  }

  game.bays[bay] = true
  let points = 50
  if (cfg.timer) points += Math.floor(f.timeLeft / 1000) * 2
  if (game.fly && game.fly.bay === bay) {
    points += 200
    game.fly = null
    game.flyWait = 6000 + game.rng() * 6000
  }
  game.score += points
  game.homeFlash = { bay, t: 600, points }
  game.events.push('home')

  if (game.bays.every(Boolean)) {
    game.score += 1000
    game.level += 1
    game.bays = BAY_X.map(() => false)
    game.lanes = buildLanes(game.level, cfg, game.rng)
    game.fly = null
    game.banner = { text: `Level ${game.level}`, t: 1600 }
    game.events.push('level')
  }
  resetFrog(game)
}

function updateFly(game, dt) {
  if (game.fly) {
    game.fly.t -= dt
    if (game.fly.t <= 0 || game.bays[game.fly.bay]) {
      game.fly = null
      game.flyWait = 6000 + game.rng() * 6000
    }
    return
  }
  game.flyWait -= dt
  if (game.flyWait > 0) return
  const open = game.bays.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0)
  if (open.length) game.fly = { bay: open[Math.floor(game.rng() * open.length)], t: 5000 }
  else game.flyWait = 3000
}

// Advance by dt milliseconds. Lanes keep moving on the start and game over
// screens so the river looks alive behind them.
export function step(game, dt) {
  game.time += dt
  moveLanes(game, dt)
  if (game.banner) {
    game.banner.t -= dt
    if (game.banner.t <= 0) game.banner = null
  }
  if (game.homeFlash) {
    game.homeFlash.t -= dt
    if (game.homeFlash.t <= 0) game.homeFlash = null
  }
  if (game.status !== 'playing') return

  if (game.dying) {
    game.dying.t -= dt
    if (game.dying.t <= 0) {
      game.dying = null
      if (game.lives <= 0) {
        game.status = 'over'
        game.events.push('over')
      } else resetFrog(game)
    }
    return
  }

  updateFly(game, dt)
  const f = game.frog

  if (f.hopping) {
    f.hopT += dt
    const p = Math.min(1, f.hopT / HOP_MS)
    f.x = f.fromX + (f.toX - f.fromX) * p
    if (f.hopT >= HOP_MS) {
      land(game)
      if (game.dying || game.frog !== f) return
    }
  }

  const row = frogRow(f)
  const kind = rowKind(row)
  if (kind === 'road' && hitByVehicle(game, laneAt(game, row), f.x)) {
    die(game, 'squash')
    return
  }

  if (!f.hopping && kind === 'river') {
    const lane = laneAt(game, row)
    f.x += (lane.vx * dt) / 1000
    if (game.mode === 'easy') {
      f.x = Math.min(COLS - 0.35, Math.max(0.35, f.x))
    } else if (f.x < 0.15 || f.x > COLS - 0.15) {
      die(game, 'splash')
      return
    }
    if (!standingOn(game, lane, f.x)) {
      die(game, 'splash')
      return
    }
  }

  if (game.cfg.timer) {
    f.timeLeft -= dt
    if (f.timeLeft <= 0) {
      f.timeLeft = 0
      die(game, rowKind(frogRow(f)) === 'river' ? 'splash' : 'squash')
      return
    }
  }

  if (!f.hopping && game.queued) {
    const dir = game.queued
    game.queued = null
    beginHop(game, dir)
  }
}

export function timeFraction(game) {
  if (!game.cfg.timer) return 1
  return Math.max(0, game.frog.timeLeft / game.cfg.timer)
}
