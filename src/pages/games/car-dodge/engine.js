// src/pages/games/car-dodge/engine.js
// Game state for Car Dodge. No DOM, no React: CarDodge.jsx calls step() on a
// fixed timestep and draw.js paints whatever is here. Randomness comes in
// through an rng function so whole games can be simulated in node.
//
// The world is a fixed portrait rectangle (WORLD_W x WORLD_H) with a three
// lane road down the middle. The player's car stays near the bottom and only
// moves sideways; the road, traffic and coins slide down past it.
//
// Traffic arrives in rows (one or two vehicles side by side, never three).
// The spawner remembers which lanes the player could possibly be in when each
// row passes, and only blocks lanes so that at least one free lane in the new
// row can be reached in the time the gap gives. That is what keeps it fair:
// there is never a wall you can't get round, however fast it gets.

export const WORLD_W = 320
export const WORLD_H = 540
export const ROAD_X = 40
export const ROAD_W = 240
export const LANES = 3
export const LANE_W = ROAD_W / LANES
export const STEP_MS = 1000 / 60

export const PLAYER_W = 42
export const PLAYER_H = 72
export const PLAYER_Y = WORLD_H - 70 - PLAYER_H // top edge of the player's car
const SLIDE_SPEED = 620 // px per second sideways, a lane in about 0.13 s
const LANE_TIME = LANE_W / SLIDE_SPEED

// Rows are created off the top of the screen so a coin placed in the gap
// below a new row never pops into view.
const SPAWN_BOTTOM = -440

export const VEHICLES = {
  car: { w: 44, h: 72 },
  van: { w: 50, h: 88 },
  lorry: { w: 56, h: 132 },
}

export const MODES = {
  easy: {
    label: 'Easy',
    lives: 3,
    startSpeed: 170, // road speed, px per second
    accel: 2.2, // per second
    maxSpeed: 330,
    traffic: 0.55, // how fast traffic comes at you, as a share of road speed
    gapStart: 330, // clear road between rows
    gapEnd: 200,
    gapRamp: 150, // seconds to go from gapStart to gapEnd
    pairChance: [0.05, 0.3], // chance a row has two vehicles: start, end
    lorryChance: 0.12,
    coinChance: 0.75,
    reaction: 0.75, // seconds of thinking time the spawner allows
  },
  normal: {
    label: 'Normal',
    lives: 1,
    startSpeed: 250,
    accel: 5,
    maxSpeed: 620,
    traffic: 0.6,
    gapStart: 250,
    gapEnd: 120,
    gapRamp: 120,
    pairChance: [0.25, 0.7],
    lorryChance: 0.22,
    coinChance: 0.4,
    reaction: 0.4,
  },
  hard: {
    label: 'Hard',
    lives: 1,
    startSpeed: 330,
    accel: 6.5,
    maxSpeed: 780,
    traffic: 0.68,
    gapStart: 210,
    gapEnd: 105,
    gapRamp: 90,
    pairChance: [0.5, 0.85],
    lorryChance: 0.3,
    coinChance: 0.3,
    reaction: 0.3,
  },
}

export const CAR_COLOURS = ['#e8505b', '#3d8bfd', '#f6c445', '#3bb273', '#9b6bd3', '#f08a3c', '#ececec']
export const VAN_COLOURS = ['#f4f1ea', '#4a6fa5', '#d9534f', '#2f9e8f']
export const LORRY_COLOURS = ['#e07a2f', '#2e86ab', '#5c946e', '#b23a48']

const POINTS_PER_PX = 1 / 40
export const COIN_POINTS = 10
const INVINCIBLE = 2.2 // seconds after a crash in easy
const CRASH_TIME = 0.9 // seconds the wreck shows before game over

export function laneX(lane) {
  return ROAD_X + LANE_W * lane + LANE_W / 2
}

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length]
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t))

export function createGame(mode = 'easy', rng = Math.random) {
  const cfg = MODES[mode] ?? MODES.easy
  return {
    mode: MODES[mode] ? mode : 'easy',
    cfg,
    rng,
    status: 'ready', // 'ready' | 'playing' | 'crashing' | 'over'
    time: 0,
    speed: cfg.startSpeed,
    scroll: 0, // total road distance, drives the markings and verges
    distance: 0,
    coins: 0,
    score: 0,
    lives: cfg.lives,
    invincible: 0,
    flash: 0,
    crashT: 0,
    lane: 1,
    x: laneX(1),
    tilt: 0, // -1..1, leans the car while it slides
    traffic: [],
    pickups: [],
    sparkles: [], // little bursts where coins were collected
    // The last row spawned: where its top edge is and which lanes the player
    // could be in as it goes by. Starts as "everything is open".
    lastRow: null,
    reachable: [true, true, true],
    nextId: 1,
    events: [],
  }
}

export function startGame(game) {
  if (game.status === 'ready') game.status = 'playing'
}

// dir: -1 left, +1 right. Moves a lane at a time; the slide happens in step().
export function steer(game, dir) {
  if (game.status !== 'playing' || !dir) return
  game.lane = Math.max(0, Math.min(LANES - 1, game.lane + Math.sign(dir)))
}

function trafficSpeed(game) {
  return game.speed * game.cfg.traffic
}

// How many lanes the player can cross between two rows `gap` px apart.
// Speed is padded because it will have risen a little by the time they meet.
function lanesInGap(game, gap) {
  const v = trafficSpeed(game) * 1.15
  const time = (gap - PLAYER_H - 10) / v - game.cfg.reaction
  if (time <= 0) return 0
  return Math.min(LANES - 1, Math.floor(time / LANE_TIME))
}

function makeVehicle(game, lane, kind, top) {
  const size = VEHICLES[kind]
  const colours = kind === 'lorry' ? LORRY_COLOURS : kind === 'van' ? VAN_COLOURS : CAR_COLOURS
  return {
    id: game.nextId++,
    kind,
    lane,
    x: laneX(lane),
    y: top,
    w: size.w,
    h: size.h,
    colour: pick(game.rng, colours),
    wobble: game.rng() * Math.PI * 2, // tiny weave so traffic looks alive
  }
}

function spawnRow(game, gap, bottom = SPAWN_BOTTOM) {
  const { cfg, rng } = game
  const allowed = game.lastRow ? lanesInGap(game, gap) : LANES - 1
  const prev = game.reachable

  // Lanes reachable in the new row if `blocked` lanes are filled.
  function reachableWith(blocked) {
    const out = []
    for (let l = 0; l < LANES; l++) {
      let ok = !blocked.includes(l)
      if (ok) {
        ok = false
        for (let p = 0; p < LANES; p++) if (prev[p] && Math.abs(p - l) <= allowed) ok = true
      }
      out.push(ok)
    }
    return out
  }

  const pairChance = lerp(cfg.pairChance[0], cfg.pairChance[1], game.time / cfg.gapRamp)
  let count = rng() < pairChance ? 2 : 1
  let blocked = []
  let reach = null
  for (; count >= 0 && !reach; count--) {
    // A few random tries at this size before falling back to fewer vehicles.
    for (let attempt = 0; attempt < 6; attempt++) {
      const lanes = [0, 1, 2].sort(() => rng() - 0.5).slice(0, count)
      const r = reachableWith(lanes)
      if (r.some(Boolean)) {
        blocked = lanes
        reach = r
        break
      }
    }
  }

  const vehicles = blocked.map((lane) => {
    const roll = rng()
    const kind = roll < cfg.lorryChance ? 'lorry' : roll < cfg.lorryChance + 0.22 ? 'van' : 'car'
    return makeVehicle(game, lane, kind, 0)
  })
  // All vehicles in a row share a top edge (their trailing edge), so the gap
  // to the next row is the same in every lane.
  const tallest = vehicles.reduce((m, v) => Math.max(m, v.h), 0)
  const top = bottom - tallest
  for (const v of vehicles) {
    v.y = top + (tallest - v.h)
    game.traffic.push(v)
  }

  // Coins go in the gap below this row, in a lane the player can get to.
  if (game.lastRow && rng() < cfg.coinChance) {
    const options = []
    for (let l = 0; l < LANES; l++) if (reach[l] && prev[l]) options.push(l)
    if (!options.length) for (let l = 0; l < LANES; l++) if (reach[l]) options.push(l)
    const lane = pick(rng, options)
    const room = gap - 70
    const n = Math.max(1, Math.min(3, Math.floor(room / 46), 1 + Math.floor(rng() * 3)))
    const mid = SPAWN_BOTTOM + gap / 2
    for (let i = 0; i < n; i++) {
      game.pickups.push({ id: game.nextId++, lane, x: laneX(lane), y: mid + (i - (n - 1) / 2) * 46, spin: rng() * 6 })
    }
  }

  game.reachable = reach
  game.lastRow = { top: vehicles.length ? top : bottom, gap }
}

function currentGap(game) {
  const { cfg, rng } = game
  const base = lerp(cfg.gapStart, cfg.gapEnd, game.time / cfg.gapRamp)
  return base * (0.85 + rng() * 0.4)
}

function overlaps(a, b, insetA = 0) {
  return (
    Math.abs(a.x - b.x) * 2 < a.w - insetA * 2 + b.w &&
    a.y + insetA < b.y + b.h &&
    b.y < a.y + a.h - insetA
  )
}

function playerBox(game) {
  return { x: game.x, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H }
}

function crash(game) {
  game.events.push('crash')
  game.lives -= 1
  if (game.lives <= 0) {
    game.status = 'crashing'
    game.crashT = 0
    return
  }
  // Forgiving crash: blink, clear the road around the car, ease off a bit.
  game.invincible = INVINCIBLE
  game.flash = INVINCIBLE
  game.traffic = game.traffic.filter((v) => v.y + v.h < WORLD_H * 0.25)
  game.speed = Math.max(game.cfg.startSpeed, game.speed * 0.85)
}

export function step(game, dtMs = STEP_MS, input = null) {
  if (input?.dir) steer(game, input.dir)
  const dt = dtMs / 1000
  if (game.status === 'ready' || game.status === 'over') return game

  if (game.status === 'crashing') {
    // The world rolls to a stop around the wreck, then it's over.
    game.crashT += dt
    game.speed = Math.max(0, game.speed - 900 * dt)
    game.scroll += game.speed * dt
    for (const v of game.traffic) v.y += trafficSpeed(game) * dt
    if (game.crashT >= CRASH_TIME) {
      game.status = 'over'
      game.events.push('over')
    }
    return game
  }

  const { cfg } = game
  game.time += dt
  game.speed = Math.min(cfg.maxSpeed, game.speed + cfg.accel * dt)
  game.scroll += game.speed * dt
  game.distance += game.speed * dt

  // Slide towards the chosen lane at a steady speed, leaning into it.
  const target = laneX(game.lane)
  const dx = target - game.x
  const move = SLIDE_SPEED * dt
  game.x = Math.abs(dx) <= move ? target : game.x + Math.sign(dx) * move
  const lean = Math.abs(dx) > 1 ? Math.sign(dx) : 0
  game.tilt += (lean - game.tilt) * Math.min(1, dt * 14)

  const tv = trafficSpeed(game)
  for (const v of game.traffic) {
    v.y += tv * dt
    v.wobble += dt * 2
  }
  for (const c of game.pickups) {
    c.y += tv * dt
    c.spin += dt * 6
  }
  if (game.lastRow) game.lastRow.top += tv * dt

  // A new row once the last one has moved far enough down to leave the gap.
  if (!game.lastRow) {
    // First row: a short lead-in so the player can settle, then it starts
    // just above the screen rather than at the far spawn line.
    if (game.time > 0.6) spawnRow(game, 0, -60)
  } else {
    const gap = game.lastRow.nextGap ?? (game.lastRow.nextGap = currentGap(game))
    if (game.lastRow.top - SPAWN_BOTTOM >= gap) spawnRow(game, game.lastRow.top - SPAWN_BOTTOM)
  }

  game.traffic = game.traffic.filter((v) => v.y < WORLD_H + 20)
  game.pickups = game.pickups.filter((c) => c.y < WORLD_H + 20)

  const me = playerBox(game)
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const c = game.pickups[i]
    if (Math.abs(c.x - me.x) < 34 && c.y > me.y - 14 && c.y < me.y + me.h + 14) {
      game.pickups.splice(i, 1)
      game.coins += 1
      game.events.push('coin')
      game.sparkles.push({ x: c.x, y: c.y, t: 0 })
    }
  }
  for (const s of game.sparkles) s.t += dt
  game.sparkles = game.sparkles.filter((s) => s.t < 0.5)

  if (game.invincible > 0) game.invincible = Math.max(0, game.invincible - dt)
  if (game.flash > 0) game.flash = Math.max(0, game.flash - dt)
  if (game.invincible <= 0) {
    // A small inset so a brushed wing mirror doesn't count.
    for (const v of game.traffic) {
      if (overlaps(me, v, 5)) {
        crash(game)
        break
      }
    }
  }

  game.score = Math.floor(game.distance * POINTS_PER_PX) + game.coins * COIN_POINTS
  return game
}

// Hands any events since the last call to the caller (sounds, buzzes).
export function takeEvents(game) {
  const out = game.events
  game.events = []
  return out
}
