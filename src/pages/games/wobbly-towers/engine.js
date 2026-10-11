// src/pages/games/wobbly-towers/engine.js
// Game state and physics for Wobbly Towers, built on matter-js. No React, no
// drawing: the component calls step() on a fixed timestep and draw.js paints
// whatever is in the world.
//
// How a turn works: the falling piece is under the player's control. While it
// is, it's a static sensor that the physics ignores: we move it ourselves and
// only ever into free space (every move, turn and step down is checked first),
// so it can never shove the tower. When it touches down the player gets
// LOCK_DELAY seconds to slide or turn it, then it's let go from a resting,
// non-overlapping pose, and once it has settled it locks in place (becomes
// static), so the tower never collapses under itself. A piece that misses and
// falls off the platform costs a life. Endless: the score is the tallest the
// tower has stood, and pieces fall faster as it grows.

import Matter from 'matter-js'

const { Engine, Bodies, Body, Composite, Events, Query, Sleeping } = Matter

export const BLOCK = 30 // one square of a piece, in world units
export const WORLD_WIDTH = BLOCK * 12
export const GROUND_Y = 0 // top surface of the platform; up is negative y
const PLATFORM_WIDTH = BLOCK * 6
export const STEP_MS = 1000 / 60

export const LIVES = 3
const FALL_LIMIT = BLOCK * 8 // below the platform by this much = lost
const FALL_START = 1.3 // world units per step
const FALL_PER_BLOCK = 0.05 // extra speed per block of tower height
const FALL_MAX = 7
const SETTLE_STEPS = 18 // steps a piece must sit still before it locks
const MAX_RISE = 0.6 // fastest a loose piece may move upwards, per step
const LOCK_DELAY = 0.5 // seconds a touched-down piece stays under control
const SLIDE_SPEED = 6 // world units per step the piece eases sideways
const TURN_SPEED = 0.35 // radians per step the piece eases round
// Nudges tried, in order, when a turn doesn't fit where the piece is.
const KICKS = [
  [0, 0],
  [-BLOCK / 2, 0],
  [BLOCK / 2, 0],
  [-BLOCK, 0],
  [BLOCK, 0],
  [0, -BLOCK / 2],
]

// Heights (in blocks) that earn a medal, lowest first.
export const MEDALS = [
  { key: 'bronze', label: 'Bronze', emoji: '🥉', blocks: 10 },
  { key: 'silver', label: 'Silver', emoji: '🥈', blocks: 20 },
  { key: 'gold', label: 'Gold', emoji: '🥇', blocks: 30 },
  { key: 'diamond', label: 'Diamond', emoji: '💎', blocks: 50 },
]

export function medalFor(blocks) {
  let medal = null
  for (const m of MEDALS) if (blocks >= m.blocks) medal = m
  return medal
}

// Cells as [col, row] with row increasing downwards.
const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [0, 1], [0, 2], [1, 2]],
  J: [[1, 0], [1, 1], [1, 2], [0, 2]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
}
export const PIECE_KINDS = Object.keys(SHAPES)

export const PIECE_COLOURS = {
  I: '#2f8fa6',
  O: '#f0a32b',
  T: '#95436a',
  L: '#d4692c',
  J: '#2f5d8c',
  S: '#4b8a5e',
  Z: '#b02a21',
}

export function shapeCells(kind) {
  return SHAPES[kind]
}

// A "bag" of all seven shapes in random order, so droughts can't happen.
function refillBag() {
  const bag = PIECE_KINDS.slice()
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function nextKind(game) {
  if (game.bag.length === 0) game.bag = refillBag()
  return game.bag.pop()
}

function makePiece(kind, x, y) {
  const cells = SHAPES[kind]
  const parts = cells.map(([c, r]) =>
    Bodies.rectangle(c * BLOCK, r * BLOCK, BLOCK, BLOCK, { chamfer: { radius: 2 } }),
  )
  const body = Body.create({ parts })
  body.friction = 1
  body.frictionStatic = 2
  body.frictionAir = 0.04
  body.restitution = 0
  body.slop = 0.02
  body.label = 'piece'
  // Where each square sits relative to the centre of mass, for fit checks.
  const offsets = body.parts.slice(1).map((p) => ({ x: p.position.x - body.position.x, y: p.position.y - body.position.y }))
  body.plugin = { kind, still: 0, offsets }
  Body.setPosition(body, { x, y })
  return body
}

// viewHeight is how many world units tall the screen is; it depends on the
// phone's shape, so the component passes it in (and updates game.viewHeight).
export function createGame(viewHeight) {
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 12,
    velocityIterations: 10,
  })
  engine.gravity.y = 1

  const platform = Bodies.rectangle(WORLD_WIDTH / 2, GROUND_Y + BLOCK, PLATFORM_WIDTH, BLOCK * 2, {
    isStatic: true,
    friction: 1,
    frictionStatic: 2,
    label: 'platform',
    chamfer: { radius: 4 },
  })
  Composite.add(engine.world, platform)

  const game = {
    engine,
    platform,
    viewHeight,
    bag: refillBag(),
    active: null, // the piece under control
    pose: null, // { x, y, angle } where the active piece logically is
    grounded: 0, // seconds the active piece has been touching down
    next: null,
    pieces: [], // released pieces
    lives: LIVES,
    status: 'ready', // 'ready' | 'playing' | 'over'
    elapsed: 0, // seconds
    towerTop: GROUND_Y, // top of the locked pieces, which is what scores
    stackTop: GROUND_Y, // top of every piece still on the tower
    best: 0, // tallest the tower has stood this game, in blocks
    medal: null, // best medal reached this game
    newMedal: null, // set for one step when a medal is reached; read by the UI
    cameraY: 0,
    flash: 0, // seconds left of the "lost a piece" flash
  }
  game.cameraY = restingCamera(game)
  game.next = nextKind(game)
  // Four loose squares, never added to the world, posed to test whether the
  // active piece would fit somewhere. A hair smaller than a block so pieces
  // can sit flush against each other.
  game.ghost = [0, 1, 2, 3].map(() => Bodies.rectangle(0, 0, BLOCK - 1, BLOCK - 1))
  return game
}

export function startGame(game) {
  if (game.status !== 'ready') return
  game.status = 'playing'
  spawn(game)
}

function restingCamera(game) {
  return GROUND_Y - game.viewHeight + BLOCK * 3
}

function fallSpeed(game) {
  return Math.min(FALL_MAX, FALL_START + towerHeightBlocks(game) * FALL_PER_BLOCK)
}

function spawn(game) {
  const kind = game.next
  game.next = nextKind(game)
  // Appear just inside the top of the screen, whatever its shape.
  const gap = Math.max(BLOCK * 5, Math.min(BLOCK * 10, game.viewHeight * 0.6 - BLOCK * 1.5))
  const y = game.stackTop - gap
  const piece = makePiece(kind, WORLD_WIDTH / 2, y)
  // Snap the centre of mass onto the half-block grid so steps line up.
  const snapX = Math.round(piece.position.x / (BLOCK / 2)) * (BLOCK / 2)
  Body.setPosition(piece, { x: snapX, y })
  Body.setStatic(piece, true)
  for (const part of piece.parts) part.isSensor = true
  Composite.add(game.engine.world, piece)
  game.active = piece
  game.pose = { x: snapX, y, angle: 0 }
  game.grounded = 0
}

// Would the active piece overlap anything at this pose?
function fits(game, x, y, angle) {
  const others = [game.platform, ...game.pieces]
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const offsets = game.active.plugin.offsets
  for (let i = 0; i < offsets.length; i++) {
    const o = offsets[i]
    const sq = game.ghost[i]
    Body.setAngle(sq, angle)
    Body.setPosition(sq, { x: x + o.x * cos - o.y * sin, y: y + o.x * sin + o.y * cos })
    if (Query.collides(sq, others).length > 0) return false
  }
  return true
}

function release(game) {
  const piece = game.active
  if (!piece) return
  game.active = null
  const { x, y, angle } = game.pose
  game.pose = null
  // Hand it to the physics where it logically is, at rest. The fit checks use
  // squares a hair smaller than the real ones, so lift it clear by that much;
  // it drops the last pixel instead of being shoved out of an overlap.
  Body.setAngle(piece, angle)
  Body.setPosition(piece, { x, y: y - 1.5 })
  Body.setStatic(piece, false)
  for (const part of piece.parts) part.isSensor = false
  Body.setVelocity(piece, { x: 0, y: 0 })
  Body.setAngularVelocity(piece, 0)
  Sleeping.set(piece, false) // static bodies are left asleep; it must fall
  game.pieces.push(piece)
  if (game.status === 'playing') spawn(game)
}

// Player input and gravity for the active piece, all checked against the
// tower so it only ever moves into free space.
function controlActive(game, input) {
  const pose = game.pose
  const half = BLOCK / 2
  const clampX = (x) => Math.max(BLOCK, Math.min(WORLD_WIDTH - BLOCK, x))

  if (input.left && fits(game, clampX(pose.x - half), pose.y, pose.angle)) pose.x = clampX(pose.x - half)
  if (input.right && fits(game, clampX(pose.x + half), pose.y, pose.angle)) pose.x = clampX(pose.x + half)
  if (input.rotate) {
    const angle = pose.angle + Math.PI / 2
    for (const [kx, ky] of KICKS) {
      const x = clampX(pose.x + kx)
      if (fits(game, x, pose.y + ky, angle)) {
        pose.x = x
        pose.y += ky
        pose.angle = angle
        break
      }
    }
  }

  // Fall, stopping flush on whatever is below.
  const fall = fallSpeed(game)
  if (fits(game, pose.x, pose.y + fall, pose.angle)) {
    pose.y += fall
    game.grounded = 0
  } else {
    let dy = 0
    while (dy + 0.5 <= fall && fits(game, pose.x, pose.y + dy + 0.5, pose.angle)) dy += 0.5
    pose.y += dy
    game.grounded += STEP_MS / 1000
  }

  // The drawn piece eases towards the logical pose; it's a sensor, so the
  // in-between frames can't knock anything.
  const piece = game.active
  const dx = Math.max(-SLIDE_SPEED, Math.min(SLIDE_SPEED, pose.x - piece.position.x))
  const da = Math.max(-TURN_SPEED, Math.min(TURN_SPEED, pose.angle - piece.angle))
  Body.setAngle(piece, piece.angle + da)
  Body.setPosition(piece, { x: piece.position.x + dx, y: pose.y })

  if (game.grounded >= LOCK_DELAY) release(game)
}

function loseLife(game) {
  game.lives -= 1
  game.flash = 0.6
  if (game.lives <= 0) {
    game.lives = 0
    game.status = 'over'
    if (game.active) {
      Composite.remove(game.engine.world, game.active)
      game.active = null
    }
  }
}

// Input is { left, right, rotate }: one-shot presses this step.
export function step(game, input) {
  if (game.status === 'ready') return
  const dt = STEP_MS / 1000
  if (game.status === 'playing') game.elapsed += dt
  if (game.flash > 0) game.flash = Math.max(0, game.flash - dt)
  game.newMedal = null

  if (game.active) controlActive(game, input)

  Engine.update(game.engine, STEP_MS)

  // Nothing in this game should ever fly upwards. When two pieces end up a
  // pixel into each other the engine can shove them apart hard enough to
  // make one leap; cap that so they just ease apart.
  for (const p of game.pieces) {
    if (!p.isStatic && p.velocity.y < -MAX_RISE) Body.setVelocity(p, { x: p.velocity.x, y: -MAX_RISE })
  }

  // The active piece fell straight past the platform without touching anything.
  if (game.active && game.pose.y > GROUND_Y + FALL_LIMIT) {
    Composite.remove(game.engine.world, game.active)
    game.active = null
    loseLife(game)
    if (game.status === 'playing') spawn(game)
  }

  for (let i = game.pieces.length - 1; i >= 0; i--) {
    const p = game.pieces[i]
    if (p.isStatic) continue
    // Tumbled off the edge.
    if (p.position.y > GROUND_Y + FALL_LIMIT) {
      Composite.remove(game.engine.world, p)
      game.pieces.splice(i, 1)
      loseLife(game)
      continue
    }
    // Lock pieces that have come to rest on the tower.
    const still = p.isSleeping || (p.speed < 0.15 && Math.abs(p.angularSpeed) < 0.004)
    p.plugin.still = still ? p.plugin.still + 1 : 0
    if (p.plugin.still >= SETTLE_STEPS && p.bounds.max.y <= GROUND_Y + BLOCK) {
      Body.setStatic(p, true)
    }
  }

  let top = GROUND_Y
  let stackTop = GROUND_Y
  for (const p of game.pieces) {
    if (p.bounds.max.y > GROUND_Y + BLOCK) continue // on its way off the edge
    if (p.bounds.min.y < stackTop) stackTop = p.bounds.min.y
    if (p.isStatic && p.bounds.min.y < top) top = p.bounds.min.y
  }
  game.towerTop = top
  game.stackTop = stackTop

  const height = towerHeightBlocks(game)
  if (height > game.best) {
    game.best = height
    const medal = medalFor(height)
    if (medal && medal !== game.medal) {
      game.medal = medal
      game.newMedal = medal
    }
  }

  // Camera: keep the stack top a bit over halfway down, leaving room above
  // for the falling piece, and never scroll below the ground.
  const wanted = Math.min(restingCamera(game), stackTop - game.viewHeight * 0.6)
  game.cameraY += (wanted - game.cameraY) * 0.06
}

export function towerHeightBlocks(game) {
  // Rounded to the half block so wobble of a pixel or two doesn't count.
  return Math.max(0, Math.round(((GROUND_Y - game.towerTop) / BLOCK) * 2) / 2)
}

export function destroyGame(game) {
  Events.off(game.engine)
  Composite.clear(game.engine.world, false)
  Engine.clear(game.engine)
}
