// src/pages/games/wobbly-towers/engine.js
// Game state and physics for Wobbly Towers, built on matter-js. No React, no
// drawing: the component calls step() on a fixed timestep and draw.js paints
// whatever is in the world.
//
// How a turn works: the falling piece is under the player's control and falls
// at a steady speed, ignoring gravity. The moment it touches anything it is
// let go, lands without bouncing, and once it has settled it locks in place
// (becomes static), so the tower never collapses under itself. A piece that
// misses and falls off the platform costs a life. Endless: the score is the
// tallest the tower has stood, and pieces fall faster as it grows.

import Matter from 'matter-js'

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter

export const BLOCK = 30 // one square of a piece, in world units
export const WORLD_WIDTH = BLOCK * 12
export const GROUND_Y = 0 // top surface of the platform; up is negative y
const PLATFORM_WIDTH = BLOCK * 6
export const STEP_MS = 1000 / 60

export const LIVES = 3
const FALL_LIMIT = BLOCK * 8 // below the platform by this much = lost
const FALL_START = 1.3 // world units per step
const FALL_PER_BLOCK = 0.03 // extra speed per block of tower height
const FALL_MAX = 3.6
const SETTLE_STEPS = 18 // steps a piece must sit still before it locks

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
  body.plugin = { kind, still: 0 }
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
    target: null, // { x, angle } the active piece is easing towards
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

  Events.on(engine, 'collisionStart', (event) => {
    const active = game.active
    if (!active) return
    for (const pair of event.pairs) {
      if (pair.bodyA.parent === active || pair.bodyB.parent === active) {
        release(game)
        return
      }
    }
  })

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
  Composite.add(game.engine.world, piece)
  game.active = piece
  game.target = { x: snapX, angle: 0 }
}

function release(game) {
  const piece = game.active
  if (!piece) return
  game.active = null
  // Square it up if it was caught mid-turn, and land dead: no bounce, no spin.
  Body.setAngle(piece, game.target.angle)
  Body.setVelocity(piece, { x: 0, y: Math.min(piece.velocity.y, 0.5) })
  Body.setAngularVelocity(piece, 0)
  game.target = null
  game.pieces.push(piece)
  if (game.status === 'playing') spawn(game)
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

  const active = game.active
  if (active) {
    const t = game.target
    const half = BLOCK / 2
    if (input.left) t.x -= half
    if (input.right) t.x += half
    t.x = Math.max(BLOCK, Math.min(WORLD_WIDTH - BLOCK, t.x))
    if (input.rotate) t.angle += Math.PI / 2

    const dx = Math.max(-8, Math.min(8, (t.x - active.position.x) * 0.45))
    const da = Math.max(-0.35, Math.min(0.35, (t.angle - active.angle) * 0.4))
    if (active.isSleeping) Sleeping.set(active, false)
    Body.setVelocity(active, { x: dx, y: fallSpeed(game) })
    Body.setAngularVelocity(active, da)
  }

  // Two half steps: the falling piece sinks less far into the tower before
  // the contact is caught, so it lands cleanly.
  Engine.update(game.engine, STEP_MS / 2)
  Engine.update(game.engine, STEP_MS / 2)

  // The active piece fell straight past the platform without touching anything.
  if (game.active && game.active.position.y > GROUND_Y + FALL_LIMIT) {
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
