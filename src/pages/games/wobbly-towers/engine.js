// src/pages/games/wobbly-towers/engine.js
// Game state and physics for Wobbly Towers, built on matter-js. No React, no
// drawing: the component calls step() on a fixed timestep and draw.js paints
// whatever is in the world.
//
// How a turn works (the Tricky Towers rule): the falling piece is under the
// player's control and falls at a steady speed, ignoring gravity. The moment
// it touches anything it is let go and becomes an ordinary physics body, and
// the next piece appears at the top. Pieces that fall off the platform cost a
// life. Hold the tower's top above the finish line for a few seconds to win.

import Matter from 'matter-js'

const { Engine, Bodies, Body, Composite, Events } = Matter

export const BLOCK = 30 // one square of a piece, in world units
export const WORLD_WIDTH = BLOCK * 12
export const VIEW_HEIGHT = BLOCK * 16 // world units visible on screen at once
export const GROUND_Y = 0 // top surface of the platform; up is negative y
export const STEP_MS = 1000 / 60

export const LIVES = 3
const HOLD_SECONDS = 3 // how long the tower must stay above the line
const SPAWN_GAP = BLOCK * 9 // spawn this far above the tower top
const FALL_LIMIT = BLOCK * 8 // below the platform by this much = lost

export const DIFFICULTIES = {
  easy: { label: 'Easy', goalBlocks: 10, platformBlocks: 8, fall: 1.2, fast: 6 },
  medium: { label: 'Medium', goalBlocks: 16, platformBlocks: 6, fall: 1.5, fast: 7 },
  hard: { label: 'Hard', goalBlocks: 22, platformBlocks: 5, fall: 1.9, fast: 8 },
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
  body.friction = 0.9
  body.frictionStatic = 1.2
  body.restitution = 0
  body.slop = 0.02
  body.label = 'piece'
  body.plugin = { kind }
  Body.setPosition(body, { x, y })
  return body
}

export function createGame(difficulty) {
  const settings = DIFFICULTIES[difficulty]
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 12,
    velocityIterations: 10,
  })
  engine.gravity.y = 1

  const platform = Bodies.rectangle(
    WORLD_WIDTH / 2,
    GROUND_Y + BLOCK,
    settings.platformBlocks * BLOCK,
    BLOCK * 2,
    { isStatic: true, friction: 1, frictionStatic: 1.5, label: 'platform', chamfer: { radius: 4 } },
  )
  Composite.add(engine.world, platform)

  const game = {
    difficulty,
    settings,
    engine,
    platform,
    goalY: GROUND_Y - settings.goalBlocks * BLOCK,
    bag: refillBag(),
    active: null, // the piece under control
    target: null, // { x, angle } the active piece is easing towards
    next: null,
    pieces: [], // released pieces
    lives: LIVES,
    status: 'playing', // 'playing' | 'won' | 'lost'
    elapsed: 0, // seconds
    holdTime: 0, // seconds the tower has stayed above the line
    towerTop: GROUND_Y, // top of the settled pieces, which is what counts
    stackTop: GROUND_Y, // top of every piece still on the tower, settled or not
    cameraY: GROUND_Y - VIEW_HEIGHT + BLOCK * 4, // world y at the top of the view
    flash: 0, // seconds left of the "lost a piece" flash
  }
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

  spawn(game)
  return game
}

function spawn(game) {
  const kind = game.next
  game.next = nextKind(game)
  const y = game.stackTop - SPAWN_GAP
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
  game.target = null
  // Land at the gentle speed even after a fast drop, so dropping fast saves
  // time without smashing the tower.
  Body.setVelocity(piece, { x: 0, y: Math.min(piece.velocity.y, game.settings.fall) })
  Body.setAngularVelocity(piece, 0)
  game.pieces.push(piece)
  piece.plugin.releasedAt = game.elapsed
  if (game.status === 'playing') spawn(game)
}

function loseLife(game) {
  game.lives -= 1
  game.flash = 0.6
  if (game.lives <= 0) {
    game.lives = 0
    game.status = 'lost'
  }
}

// Input is { left, right, rotate, fast } where left/right/rotate are one-shot
// presses this step and fast is held.
export function step(game, input) {
  if (game.status !== 'playing') {
    // Let the tower keep wobbling after the game ends; it looks nicer.
    Engine.update(game.engine, STEP_MS)
    return
  }
  const dt = STEP_MS / 1000
  game.elapsed += dt
  if (game.flash > 0) game.flash = Math.max(0, game.flash - dt)

  const active = game.active
  if (active) {
    const t = game.target
    const half = BLOCK / 2
    if (input.left) t.x -= half
    if (input.right) t.x += half
    t.x = Math.max(BLOCK, Math.min(WORLD_WIDTH - BLOCK, t.x))
    if (input.rotate) t.angle += Math.PI / 2

    const fall = input.fast ? game.settings.fast : game.settings.fall
    const dx = Math.max(-8, Math.min(8, (t.x - active.position.x) * 0.45))
    const da = Math.max(-0.35, Math.min(0.35, (t.angle - active.angle) * 0.4))
    if (active.isSleeping) Matter.Sleeping.set(active, false)
    Body.setVelocity(active, { x: dx, y: fall })
    Body.setAngularVelocity(active, da)
  }

  // Two half steps: a fast-dropped piece sinks less far into the tower before
  // the contact is caught, so it lands without bouncing.
  Engine.update(game.engine, STEP_MS / 2)
  Engine.update(game.engine, STEP_MS / 2)

  // The active piece fell straight past the platform without touching anything.
  if (game.active && game.active.position.y > GROUND_Y + FALL_LIMIT) {
    Composite.remove(game.engine.world, game.active)
    game.active = null
    loseLife(game)
    if (game.status === 'playing') spawn(game)
  }

  // Released pieces that have tumbled off.
  for (let i = game.pieces.length - 1; i >= 0; i--) {
    const p = game.pieces[i]
    if (p.position.y > GROUND_Y + FALL_LIMIT) {
      Composite.remove(game.engine.world, p)
      game.pieces.splice(i, 1)
      loseLife(game)
    }
  }

  // Tower top: only count pieces that have come to rest on something, so a
  // piece mid-tumble doesn't count towards the finish line.
  let top = GROUND_Y
  let stackTop = GROUND_Y
  for (const p of game.pieces) {
    if (p.bounds.max.y > GROUND_Y + BLOCK) continue // falling off
    if (p.bounds.min.y < stackTop) stackTop = p.bounds.min.y
    const resting = p.isSleeping || (p.speed < 0.25 && Math.abs(p.angularSpeed) < 0.01)
    if (resting && p.bounds.min.y < top) top = p.bounds.min.y
  }
  game.towerTop = top
  game.stackTop = stackTop

  if (game.status === 'playing') {
    if (top <= game.goalY) {
      game.holdTime += dt
      if (game.holdTime >= HOLD_SECONDS) {
        game.status = 'won'
        if (game.active) {
          Composite.remove(game.engine.world, game.active)
          game.active = null
        }
      }
    } else {
      game.holdTime = 0
    }
  }

  // Camera: keep the tower top about two thirds of the way down, leaving room
  // above for the falling piece, and never scroll below the ground.
  const wanted = Math.min(GROUND_Y - VIEW_HEIGHT + BLOCK * 4, stackTop - VIEW_HEIGHT * 0.65)
  game.cameraY += (wanted - game.cameraY) * 0.06
}

export function holdRemaining(game) {
  return Math.max(0, HOLD_SECONDS - game.holdTime)
}

export function towerHeightBlocks(game) {
  return Math.max(0, (GROUND_Y - game.towerTop) / BLOCK)
}

export function destroyGame(game) {
  Events.off(game.engine)
  Composite.clear(game.engine.world, false)
  Engine.clear(game.engine)
}
