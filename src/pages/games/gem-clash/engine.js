// src/pages/games/gem-clash/engine.js
// Gem Clash rules, no DOM: a falling-gem battler in the style of Puzzle
// Pirates' Swordfight (itself after Puzzle Fighter). The page calls
// update(game, dt) every frame and move / rotate / setSoftDrop / hardDrop
// on input; the state is mutated in place.
//
//   - The well is 6 wide and 13 tall. Pairs of gems fall; once a pair
//     lands, each half drops on its own to the bottom of its column.
//   - Some gems are breakers (round). A breaker touching a gem of its own
//     colour smashes the whole connected group of that colour. Whatever's
//     left falls, and if another breaker now touches its colour that's a
//     chain, worth more.
//   - Same-coloured gems in a rectangle of at least 2 x 2 fuse into one big
//     power gem, which counts double when smashed.
//   - Smashing gems sends junk to your opponent: rows of ordinary gems in
//     a pattern that drop in on top of their well. Junk coming at you is
//     cancelled first by whatever you smash.
//   - You lose when there's no room for the next pair at the top.
//
// game.events collects what happened ({ type: 'lock' | 'clear' | 'junk' |
// 'over', ... }); the page empties it with takeEvents. game.outbox is junk
// waiting to be sent to the opponent (versus) and is emptied by the page.

export const COLS = 6
export const ROWS = 13
export const SPAWN_COL = 2
export const COLOURS = ['red', 'green', 'blue', 'yellow']
const CLEAR_MS = 420
const SETTLE_MS = 200 // lets the gems fall into place before a chain is checked
const JUNK_PER_DROP = 18

export const MODES = {
  easy: { label: 'Easy', colours: 3, breaker: 0.26, fallMs: 950, minFallMs: 420, pressure: 0 },
  solo: { label: 'Solo', colours: 4, breaker: 0.17, fallMs: 720, minFallMs: 170, pressure: 10 },
  versus: { label: 'Vs computer', colours: 4, breaker: 0.17, fallMs: 720, minFallMs: 300, pressure: 0 },
}

// Junk patterns, one row of colours per line, repeated from the top.
export const JUNK_PATTERNS = [
  [
    [0, 0, 1, 1, 2, 2],
    [3, 3, 0, 0, 1, 1],
    [2, 2, 3, 3, 0, 0],
  ],
  [
    [0, 1, 2, 3, 0, 1],
    [0, 1, 2, 3, 0, 1],
    [2, 3, 0, 1, 2, 3],
  ],
]

// Small seeded random generator, so a game can be replayed from its seed.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const idx = (r, c) => r * COLS + c
const OFFSETS = [
  [-1, 0], // satellite above the pivot
  [0, 1], // right
  [1, 0], // below
  [0, -1], // left
]

let nextId = 1

function randomGem(game) {
  const colour = Math.floor(game.rng() * game.colours)
  return { colour, breaker: game.rng() < game.breakerChance, id: nextId++ }
}

function randomPair(game) {
  return [randomGem(game), randomGem(game)]
}

export function createGame(mode = 'solo', { seed = Math.floor(Math.random() * 2 ** 31), junkPattern = 0 } = {}) {
  const m = MODES[mode]
  const game = {
    mode,
    rng: mulberry32(seed),
    colours: m.colours,
    breakerChance: m.breaker,
    grid: Array(ROWS * COLS).fill(null),
    gems: [], // power gems: { r, c, w, h, colour }
    gemOf: Array(ROWS * COLS).fill(-1),
    piece: null,
    next: [],
    phase: 'fall', // 'fall' | 'clear' | 'settle' | 'over'
    timer: 0,
    fallMs: m.fallMs,
    softDrop: false,
    clearing: new Set(),
    chain: 0,
    score: 0,
    smashed: 0,
    pieces: 0,
    biggestChain: 0,
    pendingIn: 0, // junk on its way to this well
    outbox: 0, // junk to send to the opponent
    junkPattern,
    events: [],
  }
  game.next = [randomPair(game), randomPair(game)]
  spawn(game)
  return game
}

// ---------- the falling pair ----------

export function pieceCells(piece) {
  const [dr, dc] = OFFSETS[piece.o]
  return [
    { r: piece.r, c: piece.c, gem: piece.gems[0] },
    { r: piece.r + dr, c: piece.c + dc, gem: piece.gems[1] },
  ]
}

function fits(game, piece) {
  return pieceCells(piece).every(({ r, c }) => c >= 0 && c < COLS && r < ROWS && (r < 0 || !game.grid[idx(r, c)]))
}

function spawn(game) {
  const gems = game.next.shift()
  game.next.push(randomPair(game))
  const piece = { r: 1, c: SPAWN_COL, o: 0, gems }
  if (!fits(game, piece) || game.grid[idx(0, SPAWN_COL)]) {
    game.phase = 'over'
    game.piece = null
    game.events.push({ type: 'over' })
    return
  }
  game.piece = piece
  game.timer = 0
  game.pieces += 1
}

export function move(game, dc) {
  if (game.phase !== 'fall' || !game.piece) return false
  const next = { ...game.piece, c: game.piece.c + dc }
  if (!fits(game, next)) return false
  game.piece = next
  return true
}

// Turns the pair round its pivot, nudging it sideways or up if a wall or
// a gem is in the way.
export function rotate(game, dir = 1) {
  if (game.phase !== 'fall' || !game.piece) return false
  const o = (game.piece.o + dir + 4) % 4
  for (const [dr, dc] of [[0, 0], [0, -1], [0, 1], [-1, 0]]) {
    const next = { ...game.piece, o, r: game.piece.r + dr, c: game.piece.c + dc }
    if (fits(game, next)) {
      game.piece = next
      return true
    }
  }
  return false
}

export function setSoftDrop(game, on) {
  game.softDrop = on
}

export function hardDrop(game) {
  if (game.phase !== 'fall' || !game.piece) return
  while (fits(game, { ...game.piece, r: game.piece.r + 1 })) game.piece.r += 1
  lock(game)
}

// Where the pair would land, for the ghost outline.
export function ghost(game) {
  if (!game.piece) return null
  const p = { ...game.piece }
  while (fits(game, { ...p, r: p.r + 1 })) p.r += 1
  return p
}

// ---------- settling ----------

// Drops every gem to the bottom of its column. Returns true if anything moved.
function gravity(grid) {
  let moved = false
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1
    for (let r = ROWS - 1; r >= 0; r--) {
      const g = grid[idx(r, c)]
      if (!g) continue
      if (r !== write) {
        grid[idx(write, c)] = g
        grid[idx(r, c)] = null
        moved = true
      }
      write -= 1
    }
  }
  return moved
}

// Breakers touching their colour, and everything connected to them.
export function findClears(grid) {
  const out = new Set()
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    if (!g?.breaker || out.has(i)) continue
    const group = new Set([i])
    const stack = [i]
    while (stack.length) {
      const j = stack.pop()
      const r = Math.floor(j / COLS)
      const c = j % COLS
      for (const [dr, dc] of OFFSETS) {
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
        const k = idx(rr, cc)
        if (!group.has(k) && grid[k]?.colour === g.colour) {
          group.add(k)
          stack.push(k)
        }
      }
    }
    if (group.size > 1) for (const k of group) out.add(k)
  }
  return out
}

// Power gems: rectangles of at least 2 x 2 of one colour (breakers never
// fuse). Found greedily from the top left, biggest rectangle first.
export function findGems(grid) {
  const gemOf = Array(grid.length).fill(-1)
  const gems = []
  const same = (r, c, colour) => {
    const g = grid[idx(r, c)]
    return g && !g.breaker && g.colour === colour && gemOf[idx(r, c)] === -1
  }
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const g = grid[idx(r, c)]
      if (!g || g.breaker || gemOf[idx(r, c)] !== -1) continue
      let best = null
      let maxW = COLS - c
      for (let h = 1; r + h <= ROWS; h++) {
        let w = 0
        while (w < maxW && same(r + h - 1, c + w, g.colour)) w++
        if (w === 0) break
        maxW = w
        if (h >= 2 && w >= 2 && (!best || w * h > best.w * best.h)) best = { r, c, w, h, colour: g.colour }
      }
      if (best) {
        const n = gems.length
        gems.push(best)
        for (let rr = best.r; rr < best.r + best.h; rr++) {
          for (let cc = best.c; cc < best.c + best.w; cc++) gemOf[idx(rr, cc)] = n
        }
      }
    }
  }
  return { gems, gemOf }
}

function refreshGems(game) {
  const { gems, gemOf } = findGems(game.grid)
  game.gems = gems
  game.gemOf = gemOf
}

// Damage for one wave of smashing: 1 per gem, 2 per gem that's part of a
// power gem, multiplied up for chains.
export function damageOf(cells, gemOf, chain) {
  let base = 0
  for (const i of cells) base += gemOf[i] >= 0 ? 2 : 1
  return Math.round(base * (1 + 0.5 * (chain - 1)))
}

function lock(game) {
  for (const { r, c, gem } of pieceCells(game.piece)) {
    if (r >= 0) game.grid[idx(r, c)] = gem
  }
  game.piece = null
  game.events.push({ type: 'lock' })
  gravity(game.grid)
  game.chain = 0
  startResolve(game)
}

function startResolve(game) {
  refreshGems(game)
  const clears = findClears(game.grid)
  if (clears.size) {
    game.chain += 1
    game.clearing = clears
    game.phase = 'clear'
    game.timer = 0
    const damage = damageOf(clears, game.gemOf, game.chain)
    game.score += damage * 10
    game.smashed += clears.size
    game.biggestChain = Math.max(game.biggestChain, game.chain)
    // Smashing cancels junk on its way in first; the rest goes out.
    const attack = Math.floor(damage / 2)
    const cancel = Math.min(attack, game.pendingIn)
    game.pendingIn -= cancel
    game.outbox += attack - cancel
    game.events.push({ type: 'clear', count: clears.size, chain: game.chain, damage, attack })
    return
  }
  // Settled. Junk lands now, then the next pair.
  game.phase = 'fall'
  if (MODES[game.mode].pressure && game.pieces % MODES[game.mode].pressure === 0) {
    game.pendingIn += 2 + Math.min(10, Math.floor(game.pieces / 50))
  }
  if (game.pendingIn > 0) dropJunk(game)
  if (game.pieces % 5 === 0) game.fallMs = Math.max(MODES[game.mode].minFallMs, game.fallMs - 18)
  spawn(game)
}

function dropJunk(game) {
  const n = Math.min(JUNK_PER_DROP, game.pendingIn)
  game.pendingIn -= n
  const pattern = JUNK_PATTERNS[game.junkPattern % JUNK_PATTERNS.length]
  for (let i = 0; i < n; i++) {
    const c = i % COLS
    const row = Math.floor(i / COLS)
    const colour = pattern[row % pattern.length][c] % game.colours
    // On top of whatever's in that column.
    let r = ROWS - 1
    while (r >= 0 && game.grid[idx(r, c)]) r--
    if (r >= 0) game.grid[idx(r, c)] = { colour, breaker: false, junk: true, id: nextId++ }
  }
  refreshGems(game)
  game.events.push({ type: 'junk', count: n })
}

// Junk sent by the opponent.
export function receive(game, n) {
  if (game.phase === 'over' || n <= 0) return
  game.pendingIn += n
}

// ---------- the clock ----------

export function update(game, dt) {
  if (game.phase === 'over') return
  game.timer += dt
  if (game.phase === 'clear') {
    if (game.timer < CLEAR_MS) return
    for (const i of game.clearing) game.grid[i] = null
    game.clearing = new Set()
    gravity(game.grid)
    refreshGems(game)
    game.phase = 'settle'
    game.timer = 0
    return
  }
  if (game.phase === 'settle') {
    if (game.timer >= SETTLE_MS) startResolve(game)
    return
  }
  const every = game.softDrop ? Math.min(45, game.fallMs) : game.fallMs
  while (game.phase === 'fall' && game.piece && game.timer >= every) {
    game.timer -= every
    const down = { ...game.piece, r: game.piece.r + 1 }
    if (fits(game, down)) {
      game.piece = down
      if (game.softDrop) game.score += 1
    } else {
      lock(game)
    }
  }
}

export function takeEvents(game) {
  const out = game.events
  game.events = []
  return out
}

export function stackHeight(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (grid[idx(r, c)]) return ROWS - r
  }
  return 0
}

// ---------- for the computer player ----------

// Lands a pair at column c, orientation o on a copy of the grid, then plays
// out every smash. Returns null if it can't go there, else
// { grid, damage, chains, cells } where cells are the landing squares.
export function simulate(grid, gems, c, o) {
  const piece = { r: 1, c, o, gems }
  const g = grid.slice()
  const cells = pieceCells(piece)
  if (cells.some((p) => p.c < 0 || p.c >= COLS)) return null
  // Lowest gem first, so a vertical pair stacks the right way up.
  cells.sort((a, b) => b.r - a.r)
  const landed = []
  for (const p of cells) {
    let r = -1
    while (r + 1 < ROWS && !g[idx(r + 1, p.c)]) r++
    if (r < 0) return null
    g[idx(r, p.c)] = p.gem
    landed.push({ r, c: p.c, gem: p.gem })
  }
  let damage = 0
  let chains = 0
  for (;;) {
    const { gemOf } = findGems(g)
    const clears = findClears(g)
    if (!clears.size) break
    chains += 1
    damage += damageOf(clears, gemOf, chains)
    for (const i of clears) g[i] = null
    gravity(g)
  }
  return { grid: g, damage, chains, cells: landed }
}
