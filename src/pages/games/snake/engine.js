// src/pages/games/snake/engine.js
// Snake rules, no DOM. The page calls update(game, dtMs) every frame and
// turn(game, dir) on input; update moves the snake one cell every
// game.tickMs and returns what happened so the page can buzz or show a
// message. The state is mutated in place (it changes every frame).
//
// Modes
//   kids     slow, big cells, the edges wrap round, and bumping into
//            yourself only snips the tail off and costs a heart (3 hearts)
//   classic  walls and your own tail are deadly, speeds up as you eat
//   maze     classic with walls inside the board; every 8 fruit opens the
//            next maze
//   rush     60 seconds, edges wrap, several fruit out at once and golden
//            stars worth 3; bumping yourself just snips the tail
//
// The snake waits for the first direction before it moves (and in Fruit
// rush the clock waits too), so nobody is caught out at the start.

export const MODES = {
  kids: { label: 'Kids', blurb: 'Slow and safe. Go off one side, come back on the other.', cols: 11, rows: 13 },
  classic: { label: 'Classic', blurb: "Don't hit the walls or your own tail. Gets faster as you grow.", cols: 15, rows: 19 },
  maze: { label: 'Maze', blurb: 'Walls inside the board. Eat 8 fruit to open the next maze.', cols: 15, rows: 19 },
  rush: { label: 'Fruit rush', blurb: 'Eat as much as you can in 60 seconds. Stars are worth 3.', cols: 15, rows: 19 },
}

export const KIDS_HEARTS = 3
export const RUSH_MS = 60_000
export const MAZE_FRUIT = 8

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

const key = (x, y) => `${x},${y}`

// ---------- mazes ----------
// Each maze is drawn for a 15 x 19 board as wall cells. The start lane
// (row 15, the left half) is always kept clear.

function bar(cells, x0, y0, x1, y1) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) cells.push([x, y])
  }
}

const MAZES = [
  // Two long bars
  (c) => {
    bar(c, 3, 5, 11, 5)
    bar(c, 3, 12, 11, 12)
  },
  // A cross with gaps at the middle
  (c) => {
    bar(c, 7, 2, 7, 7)
    bar(c, 7, 11, 7, 16)
    bar(c, 1, 9, 5, 9)
    bar(c, 9, 9, 13, 9)
  },
  // Four corner brackets
  (c) => {
    bar(c, 2, 2, 5, 2)
    bar(c, 2, 2, 2, 5)
    bar(c, 9, 2, 12, 2)
    bar(c, 12, 2, 12, 5)
    bar(c, 2, 12, 2, 13)
    bar(c, 12, 12, 12, 16)
    bar(c, 9, 16, 12, 16)
    bar(c, 5, 8, 9, 8)
    bar(c, 5, 10, 9, 10)
  },
  // Zig-zag lanes
  (c) => {
    bar(c, 0, 4, 10, 4)
    bar(c, 4, 8, 14, 8)
    bar(c, 0, 12, 10, 12)
  },
]

function mazeWalls(level, cols, rows) {
  const cells = []
  MAZES[level % MAZES.length](cells)
  const walls = new Set()
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue
    // Keep the start lane clear.
    if (y >= rows - 5 && y <= rows - 3 && x <= 7) continue
    walls.add(key(x, y))
  }
  return walls
}

// ---------- setup ----------

function startSnake(cols, rows) {
  const y = rows - 4
  return [
    { x: 4, y },
    { x: 3, y },
    { x: 2, y },
  ]
}

export function createGame(mode, rng = Math.random) {
  const { cols, rows } = MODES[mode]
  const game = {
    mode,
    cols,
    rows,
    rng,
    wraps: mode === 'kids' || mode === 'rush',
    snake: startSnake(cols, rows),
    prev: null, // the snake before the last move, for smooth drawing
    dir: 'right',
    queue: [],
    moving: false, // waits for the first direction
    walls: mode === 'maze' ? mazeWalls(0, cols, rows) : new Set(),
    fruits: [],
    score: 0,
    eaten: 0, // fruit eaten this maze level
    level: 0,
    hearts: mode === 'kids' ? KIDS_HEARTS : 1,
    timeLeft: mode === 'rush' ? RUSH_MS : null,
    tickMs: { kids: 260, classic: 150, maze: 140, rush: 115 }[mode],
    acc: 0,
    sinceMove: 0, // ms since the last move, for drawing between cells
    status: 'playing', // 'playing' | 'over'
    overReason: null, // 'wall' | 'tail' | 'hearts' | 'time'
    flash: 0, // ms of "ouch" flash left
  }
  game.prev = game.snake.map((s) => ({ ...s }))
  fillFruit(game)
  return game
}

// ---------- fruit ----------

function isFree(game, x, y) {
  if (game.walls.has(key(x, y))) return false
  if (game.snake.some((s) => s.x === x && s.y === y)) return false
  return !game.fruits.some((f) => f.x === x && f.y === y)
}

function placeFruit(game) {
  const free = []
  const head = game.snake[0]
  for (let x = 0; x < game.cols; x++) {
    for (let y = 0; y < game.rows; y++) {
      // Not right under the snake's nose, so it isn't eaten by accident.
      if (Math.abs(x - head.x) + Math.abs(y - head.y) < 2) continue
      if (isFree(game, x, y)) free.push({ x, y })
    }
  }
  if (!free.length) return
  const spot = free[Math.floor(game.rng() * free.length)]
  const star = game.mode === 'rush' && game.rng() < 0.18
  const kinds = ['apple', 'cherry', 'orange']
  game.fruits.push({
    ...spot,
    kind: star ? 'star' : kinds[Math.floor(game.rng() * kinds.length)],
    value: star ? 3 : 1,
    born: null, // set by the drawing on first sight, for the pop-in
  })
}

function fillFruit(game) {
  const want = game.mode === 'rush' ? 3 : 1
  while (game.fruits.length < want) {
    const before = game.fruits.length
    placeFruit(game)
    if (game.fruits.length === before) break // board full
  }
}

// ---------- input ----------

// Queues a turn. Up to two turns can wait, so a quick "up then left" isn't
// lost between moves. Turning straight back on yourself is ignored.
export function turn(game, dir) {
  if (game.status !== 'playing' || !DIRS[dir]) return
  const last = game.queue.length ? game.queue[game.queue.length - 1] : game.dir
  if (!game.moving) {
    // First press picks the starting direction (anything but backwards).
    if (dir === OPPOSITE[game.dir]) return
    game.moving = true
    game.queue = [dir]
    game.acc = game.tickMs // move straight away
    return
  }
  if (dir === last || dir === OPPOSITE[last]) return
  if (game.queue.length < 2) game.queue.push(dir)
}

// ---------- the clock ----------

// Advances the game by dt ms. Returns a list of events:
// { type: 'eat', value } | { type: 'snip' } | { type: 'level' } |
// { type: 'over', reason }
export function update(game, dt) {
  const events = []
  if (game.status !== 'playing') return events
  if (game.flash > 0) game.flash = Math.max(0, game.flash - dt)
  if (!game.moving) return events

  if (game.timeLeft != null) {
    game.timeLeft = Math.max(0, game.timeLeft - dt)
    if (game.timeLeft === 0) {
      game.status = 'over'
      game.overReason = 'time'
      events.push({ type: 'over', reason: 'time' })
      return events
    }
  }

  game.acc += dt
  game.sinceMove += dt
  // At most two moves per frame, so a stalled tab can't fling the snake.
  for (let n = 0; n < 2 && game.acc >= game.tickMs && game.status === 'playing'; n++) {
    game.acc -= game.tickMs
    step(game, events)
  }
  if (game.acc > game.tickMs) game.acc = game.tickMs
  return events
}

function step(game, events) {
  if (game.queue.length) game.dir = game.queue.shift()
  const d = DIRS[game.dir]
  const head = game.snake[0]
  let x = head.x + d.x
  let y = head.y + d.y

  if (game.wraps) {
    x = (x + game.cols) % game.cols
    y = (y + game.rows) % game.rows
  } else if (x < 0 || y < 0 || x >= game.cols || y >= game.rows) {
    return die(game, events, 'wall')
  }
  if (game.walls.has(key(x, y))) return die(game, events, 'wall')

  const fruitIndex = game.fruits.findIndex((f) => f.x === x && f.y === y)
  const growing = fruitIndex >= 0
  // The tail moves out of the way this step unless we're growing.
  const body = growing ? game.snake : game.snake.slice(0, -1)
  const hitAt = body.findIndex((s) => s.x === x && s.y === y)

  game.prev = game.snake.map((s) => ({ ...s }))
  game.sinceMove = 0

  if (hitAt >= 0) {
    if (game.mode === 'kids' || game.mode === 'rush') {
      // Snip: keep the body up to the bump, drop the rest.
      game.snake = [{ x, y }, ...game.snake.slice(0, Math.max(1, hitAt))]
      game.prev = game.prev.slice(0, game.snake.length)
      game.flash = 600
      if (game.mode === 'kids') {
        game.hearts -= 1
        if (game.hearts <= 0) {
          game.status = 'over'
          game.overReason = 'hearts'
          events.push({ type: 'over', reason: 'hearts' })
          return
        }
      }
      events.push({ type: 'snip' })
      return
    }
    return die(game, events, 'tail')
  }

  game.snake.unshift({ x, y })
  if (growing) {
    const fruit = game.fruits.splice(fruitIndex, 1)[0]
    game.score += fruit.value
    game.eaten += 1
    events.push({ type: 'eat', value: fruit.value, kind: fruit.kind })
    speedUp(game)
    if (game.mode === 'maze' && game.eaten >= MAZE_FRUIT) {
      nextMaze(game)
      events.push({ type: 'level', level: game.level })
      return
    }
    fillFruit(game)
  } else {
    game.snake.pop()
  }
}

function speedUp(game) {
  const floor = { kids: 200, classic: 70, maze: 85, rush: 90 }[game.mode]
  const by = { kids: 2, classic: 3, maze: 2, rush: 1 }[game.mode]
  game.tickMs = Math.max(floor, game.tickMs - by)
}

function nextMaze(game) {
  game.level += 1
  game.eaten = 0
  game.walls = mazeWalls(game.level, game.cols, game.rows)
  // Back to the start lane at the same length, waiting for a direction.
  const len = game.snake.length
  const start = startSnake(game.cols, game.rows)
  const snake = []
  for (let i = 0; i < len; i++) snake.push(start[Math.min(i, start.length - 1)])
  game.snake = snake.map((s) => ({ ...s }))
  game.prev = game.snake.map((s) => ({ ...s }))
  game.dir = 'right'
  game.queue = []
  game.moving = false
  game.fruits = []
  game.tickMs = Math.max(85, 140 - game.level * 8)
  fillFruit(game)
}

function die(game, events, reason) {
  game.status = 'over'
  game.overReason = reason
  game.flash = 600
  events.push({ type: 'over', reason })
}

// Fraction of the way from the last cell to the next, for smooth drawing.
export function progress(game) {
  if (!game.moving || game.status !== 'playing') return 1
  return Math.min(1, game.sinceMove / game.tickMs)
}
