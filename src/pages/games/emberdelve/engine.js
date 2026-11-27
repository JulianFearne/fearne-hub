// src/pages/games/emberdelve/engine.js
// Emberdelve's rules, with no rendering in them. scene.js draws whatever state
// this leaves behind; Emberdelve.jsx feeds it input and runs the clock.
//
// The world is a top-down plane in metres: x runs left to right, z runs from
// the entrance (positive, bottom of the screen) to the exit doors (negative,
// top). Every room is the same size so the camera framing never changes.
//
// A run: clear a room of every wave, pick what the next room rewards by walking
// through one of its doors, repeat. Every fifth room is a boss with a single
// door. One life, and the run ends when the hearts run out.

export const STEP = 1 / 60
export const ROOM_W = 12
export const ROOM_D = 18
const HALF_W = ROOM_W / 2
const HALF_D = ROOM_D / 2
const PLAYER_R = 0.4
const DOOR_W = 1.8
const DOOR_Z = -HALF_D + 0.4
const BOSS_EVERY = 5

// ---------------------------------------------------------------- helpers

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2

// ---------------------------------------------------------------- upgrades

// Boons, in four tiers. Common ones are steady stat bumps; rare ones change
// how your flame behaves; epic ones bend the run around them. Duo boons need
// two others first and are the reward for building towards something, the
// way Hades pairs two gods' gifts. Each can be taken until its `max`.
export const TIERS = {
  common: { label: 'Common', price: 25 },
  rare: { label: 'Rare', price: 40 },
  epic: { label: 'Epic', price: 60 },
  duo: { label: 'Duo', price: 60 },
}

export const BOONS = {
  // Common
  damage: { tier: 'common', name: 'Hotter Flame', text: '+20% damage', icon: '🔥', apply: (p) => (p.damage *= 1.2) },
  rate: { tier: 'common', name: 'Quick Wick', text: '+18% fire rate', icon: '⚡', max: 6, apply: (p) => (p.fireDelay *= 0.85) },
  speed: { tier: 'common', name: 'Light Feet', text: '+12% move speed', icon: '👟', max: 4, apply: (p) => (p.speed *= 1.12) },
  range: { tier: 'common', name: 'Long Burn', text: '+25% range and shot speed', icon: '🏹', max: 3, apply: (p) => { p.range *= 1.25; p.shotSpeed *= 1.2 } },
  heart: { tier: 'common', name: 'Stout Heart', text: '+1 max heart, heal 2', icon: '❤️', apply: (p) => { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 2) } },
  crit: { tier: 'common', name: 'Keen Eye', text: '+12% chance of a double-damage hit', icon: '🎯', max: 4, apply: (p) => (p.crit += 0.12) },
  dash: { tier: 'common', name: 'Quickstep', text: 'Dash recharges 30% faster', icon: '💨', max: 3, apply: (p) => (p.dashCd *= 0.7) },
  magnet: { tier: 'common', name: 'Lodestone', text: 'Pull embers in from much further away', icon: '🧲', max: 2, apply: (p) => (p.magnet += 2.5) },
  steady: { tier: 'common', name: 'Still Flame', text: 'Fire 35% faster while standing still', icon: '🕯️', max: 3, apply: (p) => (p.steady += 1) },
  hearth: { tier: 'common', name: 'Hearthside', text: 'Heal 1 heart after every room', icon: '🏠', max: 2, apply: (p) => (p.hearth += 1) },
  ward: { tier: 'common', name: 'Wax Ward', text: 'A shield soaks up the first hit in each room', icon: '🛡️', max: 2, apply: (p) => { p.wardMax += 1; p.ward += 1 } },
  greed: { tier: 'common', name: 'Magpie', text: 'Embers are worth 50% more', icon: '🪙', max: 2, apply: (p) => (p.greed += 0.5) },
  // Rare
  multi: { tier: 'rare', name: 'Twin Spark', text: '+1 ember in every volley', icon: '✨', max: 3, apply: (p) => (p.shots += 1) },
  side: { tier: 'rare', name: 'Side Sparks', text: 'Also fire diagonally', icon: '↔️', max: 2, apply: (p) => (p.side += 1) },
  rear: { tier: 'rare', name: 'Backfire', text: 'Also fire behind you', icon: '🔙', max: 2, apply: (p) => (p.rear += 1) },
  pierce: { tier: 'rare', name: 'Needle Ember', text: 'Shots pass through +1 foe', icon: '📌', max: 3, apply: (p) => (p.pierce += 1) },
  bounce: { tier: 'rare', name: 'Ricochet', text: 'Shots bounce off walls', icon: '↩️', max: 2, apply: (p) => (p.bounce += 1) },
  homing: { tier: 'rare', name: 'Seeker', text: 'Embers curve towards foes', icon: '🧭', max: 2, apply: (p) => (p.homing += 1) },
  giant: { tier: 'rare', name: 'Bonfire Shot', text: 'Bigger embers, +40% damage, a little slower', icon: '🌕', max: 2, apply: (p) => { p.giant += 1; p.shotSpeed *= 0.88 } },
  burn: { tier: 'rare', name: 'Kindling', text: 'Hits set foes alight', icon: '♨️', max: 3, apply: (p) => (p.burn += 1) },
  frost: { tier: 'rare', name: 'Rimeflame', text: 'Hits chill foes, slowing them down', icon: '❄️', max: 2, apply: (p) => (p.frost += 1) },
  chain: { tier: 'rare', name: 'Arc Spark', text: 'Hits leap to a nearby foe', icon: '🌩️', max: 3, apply: (p) => (p.chain += 1) },
  boom: { tier: 'rare', name: 'Cinderburst', text: 'Foes explode when they fall', icon: '💣', max: 3, apply: (p) => (p.boom += 1) },
  spite: { tier: 'rare', name: 'Spitfire', text: 'Getting hurt bursts out a ring of embers', icon: '🌋', max: 2, apply: (p) => (p.spite += 1) },
  leech: { tier: 'rare', name: 'Hearthfire', text: 'Kills sometimes drop a heart', icon: '💗', max: 2, apply: (p) => (p.leech += 0.05) },
  // Epic
  nova: { tier: 'epic', name: 'Ember Nova', text: 'Dashing bursts out a ring of embers', icon: '💥', max: 2, apply: (p) => (p.nova += 8) },
  orbit: { tier: 'epic', name: 'Wisp', text: 'A wisp circles you, burning foes', icon: '🌀', max: 4, apply: (p) => (p.orbs += 1) },
  trail: { tier: 'epic', name: 'Firewalk', text: 'Dashing leaves burning ground behind', icon: '👣', max: 2, apply: (p) => (p.trail += 1) },
  glass: { tier: 'epic', name: 'Glass Wick', text: '+60% damage, but -1 max heart', icon: '🥂', max: 1, apply: (p) => { p.damage *= 1.6; p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp) } },
  second: { tier: 'epic', name: 'Second Wick', text: 'Relight once with 3 hearts when snuffed out', icon: '🔁', max: 1, apply: (p) => (p.lives += 1) },
  fury: { tier: 'epic', name: 'Fury', text: 'Kills fire you up: faster shots for a few seconds, stacking', icon: '😤', max: 1, apply: (p) => (p.fury += 1) },
  // Duo: need both boons in `needs` first
  wildfire: { tier: 'duo', needs: ['burn', 'boom'], name: 'Wildfire', text: 'Explosions are bigger and set everything they touch alight', icon: '☄️', max: 1, apply: (p) => (p.wildfire = 1) },
  shatter: { tier: 'duo', needs: ['frost', 'crit'], name: 'Shatter', text: 'Critical hits on chilled foes deal triple damage', icon: '🧊', max: 1, apply: (p) => (p.shatter = 1) },
  storm: { tier: 'duo', needs: ['orbit', 'chain'], name: 'Stormwisp', text: 'Wisps throw lightning at everything they touch', icon: '⛈️', max: 1, apply: (p) => (p.storm = 1) },
  supernova: { tier: 'duo', needs: ['nova', 'dash'], name: 'Supernova', text: 'Dash rings double up and pierce everything', icon: '☀️', max: 1, apply: (p) => (p.supernova = 1) },
  hail: { tier: 'duo', needs: ['multi', 'side'], name: 'Hailstorm', text: 'Every fourth volley fires a full ring', icon: '🌨️', max: 1, apply: (p) => (p.hail = 1) },
  sear: { tier: 'duo', needs: ['giant', 'pierce'], name: 'Searing Lance', text: 'Big embers pierce every foe in a line', icon: '🗡️', max: 1, apply: (p) => (p.pierce += 99) },
}

export function boonAvailable(game, key) {
  const b = BOONS[key]
  const p = game.player
  if (b.max && (p.taken[key] || 0) >= b.max) return false
  if (b.needs && !b.needs.every((k) => p.taken[k])) return false
  return true
}

// Weighted by tier; better rooms tilt towards rarer boons. A duo you have
// earned is likely (certain in elite and boss rewards) to be offered.
function rollBoons(game, count, rich, exclude = []) {
  const weights = rich ? { common: 35, rare: 45, epic: 20 } : { common: 62, rare: 31, epic: 7 }
  const keys = Object.keys(BOONS).filter((k) => !exclude.includes(k) && boonAvailable(game, k))
  const picks = []
  const duos = keys.filter((k) => BOONS[k].tier === 'duo')
  if (duos.length && (rich || game.rand() < 0.5)) picks.push(duos[Math.floor(game.rand() * duos.length)])
  const pool = keys.filter((k) => BOONS[k].tier !== 'duo' && !picks.includes(k))
  while (picks.length < count && pool.length) {
    const total = pool.reduce((a, k) => a + weights[BOONS[k].tier], 0)
    let r = game.rand() * total
    let i = 0
    for (; i < pool.length - 1; i++) {
      r -= weights[BOONS[pool[i]].tier]
      if (r <= 0) break
    }
    picks.push(pool.splice(i, 1)[0])
  }
  return picks
}

// ---------------------------------------------------------------- enemies

// hp and speed scale with depth in spawnEnemy. `score` is what a kill is worth.
export const FOES = {
  mite: { r: 0.38, hp: 3, speed: 2.3, score: 10, touch: 1 },
  wisp: { r: 0.3, hp: 2, speed: 4.2, score: 12, touch: 1 },
  spitter: { r: 0.45, hp: 5, speed: 1.6, score: 20, touch: 1 },
  brute: { r: 0.7, hp: 16, speed: 1.4, score: 40, touch: 1 },
  splitter: { r: 0.55, hp: 8, speed: 1.9, score: 25, touch: 1 },
  // Bosses, one per stretch of five rooms, in this order, then round again
  // tougher. `boss` is the Warden (its key predates the others).
  boss: { r: 1.3, hp: 220, speed: 1.6, score: 500, touch: 1, boss: true },
  bloom: { r: 1.4, hp: 260, speed: 0.6, score: 600, touch: 1, boss: true },
  stag: { r: 1.1, hp: 240, speed: 2.4, score: 700, touch: 1, boss: true },
  twin: { r: 1, hp: 150, speed: 2, score: 450, touch: 1, boss: true },
}

export const BOSS_ORDER = ['boss', 'bloom', 'stag', 'twin']
export const BOSSES = {
  boss: { name: 'The Warden', falls: 'The Warden falls!' },
  bloom: { name: 'The Bloomhusk', falls: 'The Bloomhusk withers!' },
  stag: { name: 'The Rime Stag', falls: 'The Rime Stag shatters!' },
  twin: { name: 'The Cinder Twins', falls: 'The Cinder Twins gutter out!' },
}
export const isBoss = (kind) => !!FOES[kind]?.boss
export function bossFor(depth) {
  return BOSS_ORDER[(Math.floor(depth / BOSS_EVERY) - 1) % BOSS_ORDER.length]
}

function spawnEnemy(game, kind, x, z) {
  const f = FOES[kind]
  const depth = game.depth
  const tough = 1 + (depth - 1) * 0.12 + (game.room.elite ? 0.4 : 0)
  const hp = Math.round(f.hp * (f.boss ? 1 + (depth / BOSS_EVERY - 1) * 0.3 : tough))
  game.enemies.push({
    id: game.nextId++,
    kind,
    x,
    z,
    vx: 0,
    vz: 0,
    r: f.r,
    hp,
    maxHp: hp,
    speed: f.speed * (1 + Math.min(0.5, (depth - 1) * 0.03)),
    t: game.rand() * 3, // personal clock, staggers attacks
    state: 'move',
    stateT: 0,
    hit: 0, // white flash timer
    burn: 0,
    burnTick: 0,
    elite: !!game.room.elite && !f.boss,
    twinIdx: kind === 'twin' ? game.enemies.filter((o) => o.kind === 'twin').length : 0,
  })
}

// What each wave in a room looks like. Later rooms mix in nastier foes.
function waveFor(game, waveIndex) {
  const d = game.depth
  const r = game.rand
  const n = Math.min(14, 3 + Math.floor(d * 0.9) + waveIndex * 2 + (game.room.elite ? 3 : 0))
  const kinds = []
  for (let i = 0; i < n; i++) {
    const roll = r()
    if (d >= 4 && roll < 0.12) kinds.push('brute')
    else if (d >= 3 && roll < 0.27) kinds.push('splitter')
    else if (d >= 2 && roll < 0.47) kinds.push('spitter')
    else if (roll < 0.67) kinds.push('wisp')
    else kinds.push('mite')
  }
  return kinds
}

// Telegraphs: a glowing ring on the floor that becomes a foe a second later,
// so nothing ever appears on top of the player without warning.
function queueWave(game) {
  const boss = game.room.boss
  const kinds = boss ? (boss === 'twin' ? ['twin', 'twin'] : [boss]) : waveFor(game, game.room.wave)
  kinds.forEach((kind, idx) => {
    let x = 0
    let z = 0
    for (let tries = 0; tries < 30; tries++) {
      x = (game.rand() * 2 - 1) * (HALF_W - 1)
      z = (game.rand() * 2 - 1) * (HALF_D - 2)
      if (boss) {
        x = kind === 'twin' ? (idx ? 3 : -3) : 0
        z = -3
        break
      }
      const clearOfPlayer = dist2({ x, z }, game.player) > 16
      const clearOfPillars = game.room.pillars.every((p) => dist2({ x, z }, p) > (p.r + 1) ** 2)
      if (clearOfPlayer && clearOfPillars) break
    }
    game.spawns.push({ kind, x, z, t: boss ? 1.6 : 1 })
  })
  game.room.wave += 1
}

// ---------------------------------------------------------------- rooms

function buildRoom(game, reward) {
  const depth = game.depth
  const boss = depth % BOSS_EVERY === 0 ? bossFor(depth) : null
  const pillars = []
  if (!boss) {
    const count = reward === 'shop' ? 0 : 2 + Math.floor(game.rand() * 4)
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const p = {
          x: (game.rand() * 2 - 1) * (HALF_W - 2),
          z: (game.rand() * 2 - 1) * (HALF_D - 4),
          r: 0.5 + game.rand() * 0.4,
        }
        const nearStart = Math.abs(p.x) < 2 && p.z > HALF_D - 5
        const crowded = pillars.some((q) => dist2(p, q) < (p.r + q.r + 1.6) ** 2)
        if (!nearStart && !crowded) {
          pillars.push(p)
          break
        }
      }
    }
  }
  game.room = {
    boss,
    elite: reward === 'elite',
    reward: boss ? 'boss' : reward,
    pillars,
    wave: 0,
    waves: reward === 'shop' ? 0 : boss ? 1 : 2 + (depth >= 6 ? 1 : 0) + (reward === 'elite' ? 1 : 0),
    cleared: false,
    doors: [], // filled in once the room is cleared
    theme: Math.floor((depth - 1) / BOSS_EVERY) % 4, // palette, changes after each boss
  }
  game.enemies = []
  game.shots = []
  game.bolts = []
  game.pickups = []
  game.spawns = []
  game.hazards = []
  game.rings = []
  game.mines = []
  game.player.ward = game.player.wardMax
  game.player.x = 0
  game.player.z = HALF_D - 1.5
  game.player.vx = 0
  game.player.vz = 0
  game.roomTime = 0
  game.waveDelay = 0.8
  game.events.push({ type: 'room', depth })
}

// The doors out of a cleared room. Boss rooms lead into one plain door; any
// other room offers two different rewards for the room beyond.
function openDoors(game) {
  const nextIsBoss = (game.depth + 1) % BOSS_EVERY === 0
  if (nextIsBoss) {
    game.room.doors = [{ x: 0, reward: 'boss' }]
    return
  }
  const options = ['boon', 'boon', 'rest', 'elite']
  if (game.player.hp >= game.player.maxHp) options.splice(2, 1) // no point resting
  if (game.depth >= 2 && game.room.reward !== 'shop' && game.embers >= 20) options.push('shop', 'shop')
  const a = options.splice(Math.floor(game.rand() * options.length), 1)[0]
  const rest = options.filter((o) => o !== a)
  const b = rest[Math.floor(game.rand() * rest.length)] ?? (a === 'boon' ? 'elite' : 'boon')
  game.room.doors = [
    { x: -3, reward: a },
    { x: 3, reward: b },
  ]
}

export const REWARDS = {
  boon: { label: 'Boon', note: 'Choose a new power' },
  rest: { label: 'Rest', note: 'Heal 3 hearts' },
  elite: { label: 'Elite', note: 'Tougher foes, rare powers, double score' },
  boss: { label: 'Boss', note: 'Face the guardian of this depth' },
  shop: { label: 'Shop', note: 'Spend your embers' },
}

// ---------------------------------------------------------------- public API

export function createGame(seed = Date.now()) {
  const game = {
    rand: rng(seed),
    status: 'ready', // ready | playing | choosing | dying | over
    depth: 1,
    score: 0,
    kills: 0,
    time: 0,
    roomTime: 0,
    nextId: 1,
    shake: 0,
    flash: 0, // red screen flash when hurt
    events: [],
    choice: null, // { boons: [keys], title, rich }
    shop: null, // { items: [{ kind, key, price, sold }] }
    embers: 0, // currency for the shop; every ember also scores
    emberFrac: 0,
    rerolls: 1,
    hazards: [], // burning ground from Firewalk
    rings: [], // explosion flashes, for the renderer
    mines: [], // boss seeds that burst into rings of orbs
    bossKills: 0,
    priceMult: 1,
    player: {
      x: 0,
      z: HALF_D - 1.5,
      vx: 0,
      vz: 0,
      fx: 0,
      fz: -1, // facing
      hp: 5,
      maxHp: 5,
      speed: 4.6,
      damage: 2,
      fireDelay: 0.42,
      fireT: 0,
      shots: 1,
      pierce: 0,
      bounce: 0,
      shotSpeed: 11,
      range: 6.5,
      crit: 0,
      burn: 0,
      leech: 0,
      nova: 0,
      orbs: 0,
      orbAngle: 0,
      magnet: 2,
      steady: 0,
      hearth: 0,
      ward: 0,
      wardMax: 0,
      greed: 0,
      side: 0,
      rear: 0,
      homing: 0,
      giant: 0,
      frost: 0,
      chain: 0,
      boom: 0,
      spite: 0,
      trail: 0,
      trailT: 0,
      lives: 0,
      lastLight: 0,
      fury: 0,
      furyStacks: 0,
      furyT: 0,
      volleys: 0,
      dashCd: 1.4,
      dashT: 0, // cooldown left
      dashing: 0, // dash time left
      inv: 0, // invulnerable time left
      taken: {},
    },
    enemies: [],
    shots: [],
    bolts: [],
    pickups: [],
    spawns: [],
    particles: [],
    room: null,
  }
  buildRoom(game, 'boon')
  return game
}

export function startGame(game) {
  if (game.status === 'ready') game.status = 'playing'
}

export function takeEvents(game) {
  const e = game.events
  game.events = []
  return e
}

export function choose(game, key) {
  if (game.status !== 'choosing' || !game.choice?.boons.includes(key)) return
  const p = game.player
  BOONS[key].apply(p)
  p.taken[key] = (p.taken[key] || 0) + 1
  game.choice = null
  game.status = 'playing'
  openDoors(game)
  game.events.push({ type: 'boon', key })
}

export function reroll(game) {
  if (game.status !== 'choosing' || game.rerolls <= 0) return
  game.rerolls -= 1
  game.choice = { ...game.choice, boons: rollBoons(game, 3, game.choice.rich, game.choice.boons) }
  if (game.choice.boons.length === 0) game.choice.boons = rollBoons(game, 3, game.choice.rich)
  game.events.push({ type: 'reroll' })
}

function openShop(game) {
  const keys = rollBoons(game, 3, true)
  const cost = (n) => Math.max(1, Math.round(n * game.priceMult))
  const items = keys.map((key) => ({ kind: 'boon', key, price: cost(TIERS[BOONS[key].tier].price), sold: false }))
  items.push({ kind: 'heart', price: cost(15), sold: false })
  items.push({ kind: 'reroll', price: cost(20), sold: false })
  game.shop = { items }
  game.status = 'shopping'
}

export function buy(game, index) {
  const item = game.shop?.items[index]
  if (game.status !== 'shopping' || !item || item.sold || game.embers < item.price) return
  const p = game.player
  if (item.kind === 'heart') {
    if (p.hp >= p.maxHp) return
    p.hp += 1
  } else if (item.kind === 'reroll') {
    game.rerolls += 1
  } else {
    if (!boonAvailable(game, item.key)) return
    BOONS[item.key].apply(p)
    p.taken[item.key] = (p.taken[item.key] || 0) + 1
  }
  game.embers -= item.price
  // Hearts can be bought again and again; everything else once.
  if (item.kind !== 'heart') item.sold = true
  game.shop = { items: [...game.shop.items] }
  game.events.push({ type: 'buy', kind: item.kind })
}

export function leaveShop(game) {
  if (game.status !== 'shopping') return
  game.shop = null
  game.status = 'playing'
  openDoors(game)
}

export function dash(game, input) {
  const p = game.player
  if (game.status !== 'playing' || p.dashT > 0) return
  let dx = input.x
  let dz = input.z
  const len = Math.hypot(dx, dz)
  if (len < 0.2) {
    dx = p.fx
    dz = p.fz
  } else {
    dx /= len
    dz /= len
  }
  p.vx = dx * 17
  p.vz = dz * 17
  p.dashing = 0.16
  p.dashT = p.dashCd
  p.inv = Math.max(p.inv, 0.3)
  game.events.push({ type: 'dash' })
  burst(game, p.x, p.z, 8, 0xffb347, 3)
  if (p.nova) {
    const n = p.nova * (p.supernova ? 2 : 1)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      fireShot(game, Math.cos(a), Math.sin(a), 0.8, p.supernova ? { pierce: 99 } : null)
    }
  }
}

// ---------------------------------------------------------------- the step

export function step(game, input) {
  if (game.status === 'ready' || game.status === 'over' || game.status === 'choosing' || game.status === 'shopping') {
    stepParticles(game, STEP)
    return
  }
  const dt = STEP
  game.time += dt
  game.roomTime += dt
  game.shake = Math.max(0, game.shake - dt * 3)
  game.flash = Math.max(0, game.flash - dt * 2.5)

  if (game.status === 'dying') {
    game.dyingT -= dt
    stepParticles(game, dt)
    if (game.dyingT <= 0) {
      game.status = 'over'
      game.events.push({ type: 'over' })
    }
    return
  }

  stepPlayer(game, input, dt)
  stepSpawns(game, dt)
  stepEnemies(game, dt)
  stepShots(game, dt)
  sweepDead(game)
  stepBolts(game, dt)
  stepPickups(game, dt)
  stepHazards(game, dt)
  stepParticles(game, dt)
  stepRoom(game, dt)
}

function stepPlayer(game, input, dt) {
  const p = game.player
  p.dashT = Math.max(0, p.dashT - dt)
  p.inv = Math.max(0, p.inv - dt)

  p.furyT = Math.max(0, p.furyT - dt)
  if (p.furyT <= 0) p.furyStacks = 0
  if (p.dashing > 0) {
    p.dashing -= dt
    if (game.rand() < 0.6) particle(game, p.x, p.z, 0xffb347, 0.4, 0, 0)
    if (p.trail) {
      p.trailT -= dt
      if (p.trailT <= 0) {
        p.trailT = 0.03
        game.hazards.push({ x: p.x, z: p.z, r: 0.7 + p.trail * 0.15, t: 2.2 + p.trail * 0.8, max: 2.2 + p.trail * 0.8, tick: 0 })
      }
    }
  } else {
    let ix = input.x
    let iz = input.z
    const len = Math.hypot(ix, iz)
    if (len > 1) {
      ix /= len
      iz /= len
    }
    // Snappy but not instant: a short ease makes the stick feel weighty.
    const k = 1 - Math.exp(-dt * 18)
    p.vx += (ix * p.speed - p.vx) * k
    p.vz += (iz * p.speed - p.vz) * k
    if (len > 0.15) {
      p.fx = ix / Math.max(len, 1e-6) * Math.min(1, len)
      p.fz = iz / Math.max(len, 1e-6) * Math.min(1, len)
      const fl = Math.hypot(p.fx, p.fz) || 1
      p.fx /= fl
      p.fz /= fl
    }
  }

  p.x += p.vx * dt
  p.z += p.vz * dt
  collideWorld(game, p, PLAYER_R, true)

  // Walking out through an open door.
  if (game.room.doors.length && !game.room.leaving && p.z < DOOR_Z + 0.6) {
    for (const d of game.room.doors) {
      if (Math.abs(p.x - d.x) < DOOR_W / 2) {
        game.room.leaving = true
        game.depth += 1
        game.events.push({ type: 'door', reward: d.reward })
        buildRoom(game, d.reward)
        return
      }
    }
  }

  // Auto-aim at the nearest foe in range. Standing still is not required:
  // you kite with the stick and the candle fires on its own.
  p.fireT -= dt
  if (p.fireT <= 0) {
    let best = null
    let bestD = p.range * p.range
    for (const e of game.enemies) {
      const d = dist2(p, e)
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    if (best) {
      // Lead the target a little so moving foes are hittable.
      const t = Math.sqrt(bestD) / p.shotSpeed
      const ax = best.x + best.vx * t * 0.6 - p.x
      const az = best.z + best.vz * t * 0.6 - p.z
      const al = Math.hypot(ax, az) || 1
      const aim = (off) => {
        const c = Math.cos(off)
        const s = Math.sin(off)
        fireShot(game, (ax / al) * c - (az / al) * s, (ax / al) * s + (az / al) * c, 1)
      }
      const spread = 0.16
      for (let i = 0; i < p.shots; i++) aim((i - (p.shots - 1) / 2) * spread)
      if (p.side >= 1) [-0.78, 0.78].forEach(aim)
      if (p.side >= 2) [-1.57, 1.57].forEach(aim)
      if (p.rear === 1) aim(Math.PI)
      if (p.rear >= 2) [Math.PI - 0.2, Math.PI + 0.2].forEach(aim)
      p.volleys += 1
      if (p.hail && p.volleys % 4 === 0) for (let i = 0; i < 16; i++) aim((i / 16) * Math.PI * 2)
      let delay = p.fireDelay
      if (p.steady && Math.hypot(p.vx, p.vz) < 0.6) delay /= 1 + 0.35 * p.steady
      if (p.furyStacks) delay /= 1 + 0.12 * p.furyStacks
      p.fireT = delay
      game.events.push({ type: 'shoot' })
    } else {
      p.fireT = 0.05
    }
  }

  // Orbiting wisps.
  if (p.orbs) {
    p.orbAngle += dt * 3.2
    for (let i = 0; i < p.orbs; i++) {
      const a = p.orbAngle + (i / p.orbs) * Math.PI * 2
      const ox = p.x + Math.cos(a) * 1.5
      const oz = p.z + Math.sin(a) * 1.5
      for (const e of game.enemies) {
        if (e.orbHit > game.time) continue
        if ((e.x - ox) ** 2 + (e.z - oz) ** 2 < (e.r + 0.3) ** 2) {
          e.orbHit = game.time + 0.35
          hurtEnemy(game, e, p.damage * 0.8, false)
          if (p.storm) arc(game, e, p.damage * 0.7, 2 + p.chain)
        }
      }
    }
  }
}

function fireShot(game, dx, dz, scale, opts) {
  const p = game.player
  if (game.shots.length > 280) return
  const crit = game.rand() < p.crit
  game.shots.push({
    x: p.x + dx * 0.4,
    z: p.z + dz * 0.4,
    vx: dx * p.shotSpeed,
    vz: dz * p.shotSpeed,
    life: p.range / p.shotSpeed + 0.05,
    damage: p.damage * scale * (crit ? 2 : 1) * (1 + 0.4 * p.giant),
    size: 1 + 0.45 * p.giant,
    crit,
    pierce: opts?.pierce ?? p.pierce,
    bounce: p.bounce,
    hits: [],
  })
}

// Lightning that leaps from foe to foe, never hitting the same one twice.
function arc(game, from, damage, jumps) {
  const seen = new Set([from.id])
  let cur = from
  for (let j = 0; j < jumps; j++) {
    let next = null
    let best = 3.8 * 3.8
    for (const e of game.enemies) {
      if (seen.has(e.id) || e.hp <= 0) continue
      const d = dist2(cur, e)
      if (d < best) {
        best = d
        next = e
      }
    }
    if (!next) break
    seen.add(next.id)
    for (let k = 1; k < 6; k++) {
      const f = k / 6
      particle(game, cur.x + (next.x - cur.x) * f, cur.z + (next.z - cur.z) * f, 0x9fe8ff, 0.22, 0, 0)
    }
    hurtEnemy(game, next, damage, false, true)
    cur = next
  }
}

function explode(game, x, z, radius, damage, ignite) {
  game.rings.push({ x, z, r: radius, t: 0.35, max: 0.35, color: ignite ? 0xff6a20 : 0xffb050 })
  burst(game, x, z, 14, ignite ? 0xff5a10 : 0xffa040, radius * 3)
  for (const e of game.enemies) {
    if (e.hp <= 0) continue
    if (dist2(e, { x, z }) < (radius + e.r) ** 2) {
      hurtEnemy(game, e, damage, false, true)
      if (ignite) {
        e.burn = 3
        if (e.burnTick <= 0) e.burnTick = 0.4
      }
    }
  }
  game.shake = Math.min(1, game.shake + 0.12)
  game.events.push({ type: 'boom' })
}

function stepHazards(game, dt) {
  const p = game.player
  for (let i = game.hazards.length - 1; i >= 0; i--) {
    const h = game.hazards[i]
    h.t -= dt
    if (h.t <= 0) {
      game.hazards.splice(i, 1)
      continue
    }
    h.tick -= dt
    if (h.tick <= 0) {
      h.tick = 0.4
      for (const e of game.enemies) {
        if (dist2(e, h) < (h.r + e.r) ** 2) hurtEnemy(game, e, p.damage * 0.35 * p.trail, false, true)
      }
    }
  }
  game.rings = game.rings.filter((r) => (r.t -= dt) > 0)
  for (let i = game.mines.length - 1; i >= 0; i--) {
    const m = game.mines[i]
    m.t -= dt
    if (m.t <= 0) {
      ring(game, m.x, m.z, m.n, 3, game.rand())
      burst(game, m.x, m.z, 10, 0xff70d0, 3)
      game.mines.splice(i, 1)
    }
  }
  sweepDead(game)
}

function stepSpawns(game, dt) {
  for (let i = game.spawns.length - 1; i >= 0; i--) {
    const s = game.spawns[i]
    s.t -= dt
    if (s.t <= 0) {
      spawnEnemy(game, s.kind, s.x, s.z)
      burst(game, s.x, s.z, 6, 0x9a7bff, 2.5)
      game.spawns.splice(i, 1)
    }
  }
}

function stepEnemies(game, dt) {
  const p = game.player
  const list = game.enemies
  for (const e of list) {
    e.chill = Math.max(0, (e.chill || 0) - dt)
    const slow = e.chill > 0 ? 1 - Math.min(0.6, 0.3 + 0.15 * p.frost) : 1
    e.t += dt * slow
    e.hit = Math.max(0, e.hit - dt)
    const dx = p.x - e.x
    const dz = p.z - e.z
    const d = Math.hypot(dx, dz) || 1
    const ux = dx / d
    const uz = dz / d
    let tx = 0
    let tz = 0

    if (e.burn > 0) {
      e.burn -= dt
      e.burnTick -= dt
      if (e.burnTick <= 0) {
        e.burnTick = 0.5
        hurtEnemy(game, e, 0.6 * p.burn, false, true)
        particle(game, e.x, e.z, 0xff7a1a, 0.5, 0, 0)
      }
    }

    switch (e.kind) {
      case 'mite':
        tx = ux
        tz = uz
        break
      case 'wisp': {
        // Weaves in a sine path so it's harder to pick off.
        const w = Math.sin(e.t * 4) * 0.8
        tx = ux - uz * w
        tz = uz + ux * w
        break
      }
      case 'splitter':
        tx = ux
        tz = uz
        break
      case 'spitter': {
        // Keeps its distance and lobs slow orbs.
        const want = 5
        const sign = d > want + 0.5 ? 1 : d < want - 0.5 ? -1 : 0
        tx = ux * sign - uz * 0.5
        tz = uz * sign + ux * 0.5
        if (e.t > 2.2) {
          e.t = 0
          bolt(game, e.x, e.z, ux, uz, 4.5)
          if (game.depth >= 7) {
            bolt(game, e.x, e.z, ux * 0.96 - uz * 0.26, uz * 0.96 + ux * 0.26, 4.5)
            bolt(game, e.x, e.z, ux * 0.96 + uz * 0.26, uz * 0.96 - ux * 0.26, 4.5)
          }
        }
        break
      }
      case 'brute': {
        // Walk, wind up (shown by a shake), then charge in a straight line.
        if (e.state === 'move') {
          tx = ux
          tz = uz
          if (e.t > 3 && d < 7) {
            e.state = 'wind'
            e.stateT = 0.7
            e.cx = ux
            e.cz = uz
          }
        } else if (e.state === 'wind') {
          e.stateT -= dt
          if (e.stateT <= 0) {
            e.state = 'charge'
            e.stateT = 0.55
          }
        } else if (e.state === 'charge') {
          e.stateT -= dt
          e.vx = e.cx * 11
          e.vz = e.cz * 11
          if (e.stateT <= 0) {
            e.state = 'move'
            e.t = 0
          }
        }
        break
      }
      case 'boss':
        stepBoss(game, e, ux, uz, d, dt)
        tx = e.tx ?? 0
        tz = e.tz ?? 0
        break
      case 'bloom':
        stepBloom(game, e, ux, uz, d, dt)
        tx = e.tx ?? 0
        tz = e.tz ?? 0
        break
      case 'stag':
        stepStag(game, e, ux, uz, d, dt)
        tx = e.tx ?? 0
        tz = e.tz ?? 0
        break
      case 'twin':
        stepTwin(game, e, ux, uz, d, dt)
        tx = e.tx ?? 0
        tz = e.tz ?? 0
        break
    }

    if (e.state === 'move') {
      const k = 1 - Math.exp(-dt * 6)
      e.vx += (tx * e.speed * slow - e.vx) * k
      e.vz += (tz * e.speed * slow - e.vz) * k
    } else if (e.state !== 'charge') {
      // Winding up, aiming or burrowing: brake to a stop.
      e.vx *= 0.8
      e.vz *= 0.8
    }
    const chargeSlow = e.state === 'charge' ? slow : 1
    e.x += e.vx * dt * chargeSlow
    e.z += e.vz * dt * chargeSlow
  }

  // Keep foes from stacking into one blob.
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]
      const rr = a.r + b.r
      const ddx = b.x - a.x
      const ddz = b.z - a.z
      const dd = ddx * ddx + ddz * ddz
      if (dd < rr * rr && dd > 1e-6) {
        const d = Math.sqrt(dd)
        const push = (rr - d) / 2
        const nx = ddx / d
        const nz = ddz / d
        const wa = isBoss(a.kind) ? 0.1 : 1
        const wb = isBoss(b.kind) ? 0.1 : 1
        a.x -= nx * push * wa
        a.z -= nz * push * wa
        b.x += nx * push * wb
        b.z += nz * push * wb
      }
    }
  }

  for (const e of list) {
    const wasCharging = e.state === 'charge'
    collideWorld(game, e, e.r, false)
    if (e.kind === 'stag' && wasCharging && e.state === 'charge') {
      const atWall = Math.abs(e.x) >= HALF_W - e.r - 0.02 || Math.abs(e.z) >= HALF_D - e.r - 0.02
      if (atWall) stagImpact(game, e)
    }
    // Touching the player hurts.
    if (dist2(e, p) < (e.r + PLAYER_R - 0.08) ** 2) hurtPlayer(game, FOES[e.kind].touch, e)
  }
}

// The Warden: drifts about, alternating between three attacks, and gets
// angrier below half health.
function stepBoss(game, e, ux, uz, d, dt) {
  const angry = e.hp < e.maxHp / 2
  const tier = Math.floor(game.depth / BOSS_EVERY)
  e.tx = ux * (d > 4 ? 0.6 : -0.3) + Math.cos(e.t * 0.7) * 0.5
  e.tz = uz * (d > 4 ? 0.6 : -0.3) + Math.sin(e.t * 0.9) * 0.4
  e.stateT -= dt
  if (e.stateT > 0) return
  e.attack = ((e.attack ?? -1) + 1) % 3
  if (e.attack === 0) {
    // Ring of orbs.
    const n = 14 + tier * 2 + (angry ? 6 : 0)
    const off = game.rand() * Math.PI
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2
      bolt(game, e.x, e.z, Math.cos(a), Math.sin(a), 3.6)
    }
    e.stateT = angry ? 1.3 : 1.8
  } else if (e.attack === 1) {
    // Aimed fan.
    const n = 5 + (angry ? 2 : 0)
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.18
      const c = Math.cos(off)
      const s = Math.sin(off)
      bolt(game, e.x, e.z, ux * c - uz * s, ux * s + uz * c, 6)
    }
    e.stateT = angry ? 1.1 : 1.6
  } else {
    // Summon a few mites.
    const n = 2 + tier + (angry ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const a = game.rand() * Math.PI * 2
      game.spawns.push({ kind: game.rand() < 0.5 ? 'mite' : 'wisp', x: clamp(e.x + Math.cos(a) * 2.5, -HALF_W + 1, HALF_W - 1), z: clamp(e.z + Math.sin(a) * 2.5, -HALF_D + 1, HALF_D - 1), t: 0.9 })
    }
    e.stateT = 2
  }
  game.events.push({ type: 'boss-attack' })
}

const bossTier = (game) => Math.floor(game.depth / BOSS_EVERY)

function ring(game, x, z, n, speed, off = 0, acc = 0) {
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2
    bolt(game, x, z, Math.cos(a), Math.sin(a), speed, acc)
  }
}

function fan(game, x, z, ux, uz, n, step, speed) {
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * step
    const c = Math.cos(off)
    const s = Math.sin(off)
    bolt(game, x, z, ux * c - uz * s, ux * s + uz * c, speed)
  }
}

// The Bloomhusk: a rooted flower. It sprays spiralling spores, sows seeds
// around you that burst a moment later, and uproots itself to pop up
// somewhere else in a ring of spores.
function stepBloom(game, e, ux, uz, d, dt) {
  const angry = e.hp < e.maxHp / 2
  const tier = bossTier(game)
  e.tx = -e.x * 0.15
  e.tz = (-3 - e.z) * 0.15
  if (e.state === 'burrow') {
    e.stateT -= dt
    if (e.stateT <= 0) {
      e.x = e.digX
      e.z = e.digZ
      e.state = 'emerge'
      e.stateT = 0.5
      ring(game, e.x, e.z, 14 + tier * 2, 3.4, game.rand())
      burst(game, e.x, e.z, 20, 0x8fd06a, 5)
      game.shake = Math.min(1, game.shake + 0.4)
    }
    return
  }
  if (e.state === 'emerge') {
    e.stateT -= dt
    if (e.stateT <= 0) {
      e.state = 'move'
      e.stateT = 1.2
    }
    return
  }
  if (e.spiralT > 0) {
    e.spiralT -= dt
    e.emitT = (e.emitT ?? 0) - dt
    if (e.emitT <= 0) {
      e.emitT = angry ? 0.07 : 0.1
      e.spin = (e.spin ?? 0) + 0.32
      const arms = angry ? 3 : 2
      for (let k = 0; k < arms; k++) {
        const a = e.spin + (k / arms) * Math.PI * 2
        bolt(game, e.x, e.z, Math.cos(a), Math.sin(a), 3.3)
      }
    }
    return
  }
  e.stateT -= dt
  if (e.stateT > 0) return
  e.attack = ((e.attack ?? -1) + 1) % 3
  const p = game.player
  if (e.attack === 0) {
    e.spiralT = 2.6
    e.stateT = 0.8
  } else if (e.attack === 1) {
    const n = 4 + tier + (angry ? 2 : 0)
    for (let i = 0; i < n; i++) {
      const a = game.rand() * Math.PI * 2
      const r = 0.8 + game.rand() * 2.8
      game.mines.push({
        x: clamp(p.x + Math.cos(a) * r, -HALF_W + 0.5, HALF_W - 0.5),
        z: clamp(p.z + Math.sin(a) * r, -HALF_D + 0.5, HALF_D - 0.5),
        t: 1.3 + i * 0.12,
        max: 1.3 + i * 0.12,
        n: 8,
      })
    }
    e.stateT = 2
  } else {
    // Dig to a spot well away from the candle.
    let bx = 0
    let bz = 0
    for (let tries = 0; tries < 20; tries++) {
      bx = (game.rand() * 2 - 1) * (HALF_W - 2)
      bz = (game.rand() * 2 - 1) * (HALF_D - 3)
      if (dist2({ x: bx, z: bz }, p) > 25) break
    }
    e.digX = bx
    e.digZ = bz
    e.state = 'burrow'
    e.stateT = 0.9
    game.spawns.push({ kind: 'mite', x: clamp(e.x + 1, -HALF_W + 1, HALF_W - 1), z: e.z, t: 0.9 })
  }
  game.events.push({ type: 'boss-attack' })
}

// The Rime Stag: lowers its antlers, shows you its line, then charges. A
// wall stops it in a burst of ice shards; a pillar stuns it.
function stepStag(game, e, ux, uz, d, dt) {
  const angry = e.hp < e.maxHp / 2
  const tier = bossTier(game)
  if (e.state === 'aim') {
    e.stateT -= dt
    // Tracks you until the last moment, then commits.
    if (e.stateT > 0.25) {
      e.cx = ux
      e.cz = uz
    }
    if (e.stateT <= 0) {
      e.state = 'charge'
      e.stateT = 1.4
    }
    return
  }
  if (e.state === 'charge') {
    e.stateT -= dt
    e.vx = e.cx * 13
    e.vz = e.cz * 13
    if (game.rand() < 0.5) particle(game, e.x, e.z, 0xbfe8ff, 0.4, 0, 0)
    if (e.stateT <= 0) {
      e.state = 'move'
      e.stateT = 0.6
    }
    return
  }
  // Circle the candle at a wary distance.
  const want = 4.5
  const sign = d > want + 0.5 ? 1 : d < want - 0.5 ? -1 : 0
  e.tx = ux * sign - uz * 0.7
  e.tz = uz * sign + ux * 0.7
  e.stateT -= dt
  if (e.stateT > 0) return
  if (e.charges > 0) {
    e.charges -= 1
    e.state = 'aim'
    e.stateT = angry ? 0.65 : 0.85
    return
  }
  e.attack = ((e.attack ?? -1) + 1) % 3
  if (e.attack === 0) {
    e.charges = angry ? 3 : 2
    e.stateT = 0.3
  } else if (e.attack === 1) {
    // A slow ring that speeds up as it spreads.
    ring(game, e.x, e.z, 16 + tier * 2, 1.2, game.rand(), 0.9)
    if (angry) ring(game, e.x, e.z, 16 + tier * 2, 1.2, game.rand() + 0.2, 0.9)
    e.stateT = 1.8
  } else {
    fan(game, e.x, e.z, ux, uz, 7 + (angry ? 2 : 0), 0.14, 6.5)
    e.stateT = 1.4
  }
  game.events.push({ type: 'boss-attack' })
}

function stagImpact(game, e) {
  e.state = 'move'
  e.stateT = 0.9
  e.vx = 0
  e.vz = 0
  fan(game, e.x, e.z, -e.cx, -e.cz, 9, 0.22, 4.5)
  burst(game, e.x, e.z, 18, 0xbfe8ff, 5)
  game.shake = Math.min(1, game.shake + 0.5)
  game.events.push({ type: 'boom' })
}

// The Cinder Twins: two flames circling the room's heart, taking turns. Put
// one out and the other burns twice as hot.
function stepTwin(game, e, ux, uz, d, dt) {
  const tier = bossTier(game)
  const alone = !game.enemies.some((o) => o !== e && o.kind === 'twin' && o.hp > 0)
  e.orbit = (e.orbit ?? (e.twinIdx ? Math.PI : 0)) + dt * (alone ? 0.9 : 0.5)
  const r = alone ? 4 : 3.5
  const gx = Math.cos(e.orbit) * r
  const gz = -2 + Math.sin(e.orbit) * r * 1.3
  e.tx = clamp((gx - e.x) * 0.8, -1.5, 1.5)
  e.tz = clamp((gz - e.z) * 0.8, -1.5, 1.5)
  e.stateT -= dt
  if (e.stateT > 0) return
  e.attack = ((e.attack ?? (e.twinIdx ? 0 : 1)) + 1) % 3
  if (alone) {
    // Enraged: everything at once, faster.
    fan(game, e.x, e.z, ux, uz, 5, 0.2, 6)
    if (e.attack !== 1) ring(game, e.x, e.z, 12 + tier * 2, 3.4, game.rand())
    e.stateT = 0.9
  } else if (e.attack === 0) {
    fan(game, e.x, e.z, ux, uz, 5, 0.18, 5.5)
    e.stateT = 1.6
  } else if (e.attack === 1) {
    ring(game, e.x, e.z, 10 + tier * 2, 3.2, game.rand())
    e.stateT = 1.9
  } else {
    // Lob a cinder seed at the candle.
    const p = game.player
    game.mines.push({ x: p.x, z: p.z, t: 1.1, max: 1.1, n: 10 })
    e.stateT = 1.4
  }
  game.events.push({ type: 'boss-attack' })
}

function bolt(game, x, z, dx, dz, speed, acc = 0) {
  game.bolts.push({ x, z, vx: dx * speed, vz: dz * speed, life: 7, acc })
}

function stepShots(game, dt) {
  const shots = game.shots
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    if (game.player.homing) steerShot(game, s, dt)
    s.x += s.vx * dt
    s.z += s.vz * dt
    s.life -= dt
    let dead = s.life <= 0

    // Walls: bounce if it can, otherwise fizzle.
    if (!dead && (Math.abs(s.x) > HALF_W - 0.15 || Math.abs(s.z) > HALF_D - 0.15)) {
      if (s.bounce > 0) {
        s.bounce -= 1
        if (Math.abs(s.x) > HALF_W - 0.15) s.vx = -s.vx
        if (Math.abs(s.z) > HALF_D - 0.15) s.vz = -s.vz
        s.x = clamp(s.x, -HALF_W + 0.16, HALF_W - 0.16)
        s.z = clamp(s.z, -HALF_D + 0.16, HALF_D - 0.16)
        s.life += 0.3
      } else dead = true
    }
    if (!dead) {
      for (const pl of game.room.pillars) {
        if (dist2(s, pl) < pl.r * pl.r) {
          dead = true
          break
        }
      }
    }
    if (!dead) {
      for (const e of game.enemies) {
        if (e.hp <= 0 || s.hits.includes(e.id)) continue
        if (dist2(s, e) < (e.r + 0.15 * s.size) ** 2) {
          s.hits.push(e.id)
          hurtEnemy(game, e, s.damage, s.crit)
          if (game.player.chain) arc(game, e, s.damage * 0.55, game.player.chain)
          e.vx += s.vx * 0.08
          e.vz += s.vz * 0.08
          if (s.pierce > 0) s.pierce -= 1
          else {
            dead = true
            break
          }
        }
      }
    }
    if (dead) {
      particle(game, s.x, s.z, 0xffc266, 0.25, 0, 0)
      shots.splice(i, 1)
    }
  }
}

// Seeker: turn towards the nearest foe this shot hasn't hit yet.
function steerShot(game, s, dt) {
  let best = null
  let bestD = 4 * 4
  for (const e of game.enemies) {
    if (e.hp <= 0 || s.hits.includes(e.id)) continue
    const d = dist2(s, e)
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  if (!best) return
  const speed = Math.hypot(s.vx, s.vz)
  const cur = Math.atan2(s.vz, s.vx)
  const want = Math.atan2(best.z - s.z, best.x - s.x)
  let diff = want - cur
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  const turn = clamp(diff, -dt * 5 * game.player.homing, dt * 5 * game.player.homing)
  s.vx = Math.cos(cur + turn) * speed
  s.vz = Math.sin(cur + turn) * speed
}

function stepBolts(game, dt) {
  const p = game.player
  const bolts = game.bolts
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]
    if (b.acc && Math.hypot(b.vx, b.vz) < 7.5) {
      b.vx *= 1 + b.acc * dt
      b.vz *= 1 + b.acc * dt
    }
    b.x += b.vx * dt
    b.z += b.vz * dt
    b.life -= dt
    let dead = b.life <= 0 || Math.abs(b.x) > HALF_W || Math.abs(b.z) > HALF_D
    if (!dead) {
      for (const pl of game.room.pillars) {
        if (dist2(b, pl) < pl.r * pl.r) {
          dead = true
          break
        }
      }
    }
    if (!dead && dist2(b, p) < (PLAYER_R + 0.12) ** 2) {
      if (hurtPlayer(game, 1, b)) dead = true
      else if (p.dashing > 0) dead = false // dash straight through
    }
    if (dead) bolts.splice(i, 1)
  }
}

function hurtEnemy(game, e, amount, crit, quiet) {
  if (e.hp <= 0) return
  const p = game.player
  if (p.shatter && crit && e.chill > 0) amount *= 1.5
  e.hp -= amount
  e.hit = 0.08
  if (p.frost && !quiet) e.chill = 1.2 + 0.6 * p.frost
  if (game.player.burn && !quiet) {
    e.burn = 2
    if (e.burnTick <= 0) e.burnTick = 0.5
  }
  if (!quiet) {
    burst(game, e.x, e.z, crit ? 5 : 2, crit ? 0xfff2a8 : 0xffa64d, 2)
    game.events.push({ type: 'hit', crit })
  }
  // Never removed here: sweepDead clears the fallen after each pass, so no
  // loop ever has its list changed under it.
}

// Explosions can kill more foes, which can explode in turn, so keep sweeping
// until nothing else falls.
function sweepDead(game) {
  for (let pass = 0; pass < 20; pass++) {
    let any = false
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      if (i < game.enemies.length && game.enemies[i].hp <= 0) {
        killEnemy(game, i)
        any = true
      }
    }
    if (!any) break
  }
}

function killEnemy(game, i) {
  const e = game.enemies[i]
  game.enemies.splice(i, 1)
  const f = FOES[e.kind]
  const mult = game.room.elite ? 2 : 1
  game.score += f.score * mult
  game.kills += 1
  const boss = !!f.boss
  if (boss) game.bossKills += 1
  burst(game, e.x, e.z, boss ? 40 : 10, boss ? 0xff5f5f : 0xb38bff, boss ? 7 : 4)
  game.shake = Math.min(1, game.shake + (boss ? 1 : 0.15))
  game.events.push({ type: 'kill', kind: e.kind })
  const p = game.player
  if (p.boom) {
    const big = p.wildfire ? 1.6 : 1
    explode(game, e.x, e.z, (1.4 + 0.3 * p.boom) * big, p.damage * (0.7 + 0.4 * p.boom), !!p.wildfire)
  }
  if (p.fury) {
    p.furyStacks = Math.min(6, p.furyStacks + 1)
    p.furyT = 3
  }

  // Embers to collect; each is worth a couple of points.
  const embers = boss ? (e.kind === 'twin' ? 18 : 30) : e.kind === 'brute' ? 4 : 2
  for (let k = 0; k < embers; k++) {
    const a = game.rand() * Math.PI * 2
    const s = 1 + game.rand() * 3
    game.pickups.push({ kind: 'ember', x: e.x, z: e.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, t: 0 })
  }
  if (game.player.leech && game.rand() < game.player.leech) {
    game.pickups.push({ kind: 'heart', x: e.x, z: e.z, vx: 0, vz: 0, t: 0 })
  }
  if (e.kind === 'splitter') {
    for (let k = 0; k < 2; k++) {
      spawnEnemy(game, 'mite', e.x + (k ? 0.4 : -0.4), e.z)
      const m = game.enemies[game.enemies.length - 1]
      m.hp = m.maxHp = Math.max(2, Math.round(m.maxHp * 0.6))
    }
  }
}

function hurtPlayer(game, amount, from) {
  const p = game.player
  if (p.inv > 0 || game.status !== 'playing') return false
  if (p.ward > 0) {
    p.ward -= 1
    p.inv = 0.8
    burst(game, p.x, p.z, 16, 0xa8e0ff, 4)
    game.events.push({ type: 'ward' })
    return true
  }
  p.hp -= amount
  if (p.spite) {
    const n = 8 + 4 * p.spite
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      fireShot(game, Math.cos(a), Math.sin(a), 1)
    }
  }
  p.inv = 1
  game.shake = Math.min(1, game.shake + 0.6)
  game.flash = 1
  const dx = p.x - from.x
  const dz = p.z - from.z
  const d = Math.hypot(dx, dz) || 1
  p.vx += (dx / d) * 8
  p.vz += (dz / d) * 8
  burst(game, p.x, p.z, 12, 0xff4d4d, 4)
  game.events.push({ type: 'hurt' })
  if (p.hp <= 0 && p.lastLight > 0 && p.lives <= 0) {
    // Last Light (from the Chandlery): cling on with one heart, once a run.
    p.lastLight = 0
    p.hp = 1
    p.inv = 2
    game.bolts = []
    burst(game, p.x, p.z, 30, 0xfff0a0, 5)
    game.events.push({ type: 'relight' })
    return true
  }
  if (p.hp <= 0 && p.lives > 0) {
    // Second Wick: relight, clear the air and shove everything back.
    p.lives -= 1
    p.hp = Math.min(3, p.maxHp)
    p.inv = 2.5
    game.bolts = []
    for (const e of game.enemies) {
      const dx = e.x - p.x
      const dz = e.z - p.z
      const d = Math.hypot(dx, dz) || 1
      e.vx = (dx / d) * 12
      e.vz = (dz / d) * 12
    }
    burst(game, p.x, p.z, 50, 0xfff0a0, 7)
    game.rings.push({ x: p.x, z: p.z, r: 5, t: 0.6, max: 0.6, color: 0xfff0a0 })
    game.events.push({ type: 'relight' })
    return true
  }
  if (p.hp <= 0) {
    p.hp = 0
    game.status = 'dying'
    game.dyingT = 1.4
    burst(game, p.x, p.z, 40, 0xffb347, 6)
    game.events.push({ type: 'die' })
  }
  return true
}

function stepPickups(game, dt) {
  const p = game.player
  const cleared = game.room.cleared
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const k = game.pickups[i]
    k.t += dt
    k.vx *= 0.9
    k.vz *= 0.9
    const d = Math.sqrt(dist2(k, p)) || 1
    // Once the room is clear everything flies to you, so nothing is left behind.
    const reach = cleared ? 99 : p.magnet
    if (d < reach && k.t > 0.3) {
      const pull = cleared ? 16 : 10
      k.vx += ((p.x - k.x) / d) * pull * dt * 4
      k.vz += ((p.z - k.z) / d) * pull * dt * 4
    }
    k.x = clamp(k.x + k.vx * dt, -HALF_W + 0.3, HALF_W - 0.3)
    k.z = clamp(k.z + k.vz * dt, -HALF_D + 0.3, HALF_D - 0.3)
    if (d < PLAYER_R + 0.35 && k.t > 0.2) {
      if (k.kind === 'ember') {
        game.score += game.room.elite ? 4 : 2
        game.emberFrac += 1 + p.greed
        const whole = Math.floor(game.emberFrac)
        game.embers += whole
        game.emberFrac -= whole
        game.events.push({ type: 'ember' })
      } else {
        p.hp = Math.min(p.maxHp, p.hp + 1)
        game.events.push({ type: 'heal' })
      }
      game.pickups.splice(i, 1)
    }
  }
}

function stepRoom(game) {
  const room = game.room
  if (room.cleared) return
  const busy = game.enemies.length || game.spawns.length
  if (!busy) {
    if (room.wave < room.waves) {
      game.waveDelay -= STEP
      if (game.waveDelay <= 0) {
        queueWave(game)
        game.waveDelay = 0.9
      }
      return
    }
    room.cleared = true
    game.bolts = []
    const p = game.player
    if (room.reward === 'shop') {
      openShop(game)
      return
    }
    game.score += 50 * game.depth * (room.elite ? 2 : 1)
    game.events.push({ type: 'clear' })
    if (p.hearth) p.hp = Math.min(p.maxHp, p.hp + p.hearth)
    if (room.reward === 'rest') {
      p.hp = Math.min(p.maxHp, p.hp + 3)
      game.events.push({ type: 'heal' })
      openDoors(game)
    } else {
      if (room.reward === 'boss') {
        p.hp = p.maxHp
        game.rerolls += 1
      }
      const rare = room.reward === 'elite' || room.reward === 'boss'
      game.choice = {
        rich: rare,
        boons: rollBoons(game, 3, rare),
        title: room.reward === 'boss' ? BOSSES[room.boss].falls : room.elite ? 'Elite cleared!' : 'Room cleared!',
      }
      if (!game.choice.boons.length) {
        game.choice = null
        openDoors(game)
      } else game.status = 'choosing'
    }
  }
}

// ---------------------------------------------------------------- physics

function collideWorld(game, b, r, isPlayer) {
  const doorsOpen = isPlayer && game.room.doors.length
  const minX = -HALF_W + r
  const maxX = HALF_W - r
  const maxZ = HALF_D - r
  let minZ = -HALF_D + r
  // An open doorway lets the player step into it.
  if (doorsOpen && game.room.doors.some((d) => Math.abs(b.x - d.x) < DOOR_W / 2 - r * 0.5)) minZ = -HALF_D - 1
  if (b.x < minX) {
    b.x = minX
    b.vx = Math.max(0, b.vx)
  } else if (b.x > maxX) {
    b.x = maxX
    b.vx = Math.min(0, b.vx)
  }
  if (b.z < minZ) {
    b.z = minZ
    b.vz = Math.max(0, b.vz)
  } else if (b.z > maxZ) {
    b.z = maxZ
    b.vz = Math.min(0, b.vz)
  }
  for (const p of game.room.pillars) {
    const dx = b.x - p.x
    const dz = b.z - p.z
    const rr = r + p.r
    const dd = dx * dx + dz * dz
    if (dd < rr * rr && dd > 1e-6) {
      const d = Math.sqrt(dd)
      b.x = p.x + (dx / d) * rr
      b.z = p.z + (dz / d) * rr
      // A charging brute that hits a pillar is stunned.
      if (b.state === 'charge') {
        b.state = 'move'
        b.t = -0.8
        game.shake = Math.min(1, game.shake + 0.3)
      }
    }
  }
}

// ---------------------------------------------------------------- particles

function particle(game, x, z, color, life, vx, vz) {
  if (game.particles.length > 260) return
  game.particles.push({ x, y: 0.5, z, vx, vy: 1 + Math.random(), vz, life, max: life, color })
}

function burst(game, x, z, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const s = speed * (0.3 + Math.random() * 0.7)
    particle(game, x, z, color, 0.35 + Math.random() * 0.4, Math.cos(a) * s, Math.sin(a) * s)
  }
}

function stepParticles(game, dt) {
  const ps = game.particles
  for (let i = ps.length - 1; i >= 0; i--) {
    const q = ps[i]
    q.life -= dt
    if (q.life <= 0) {
      ps.splice(i, 1)
      continue
    }
    q.x += q.vx * dt
    q.y = Math.max(0.05, q.y + q.vy * dt)
    q.z += q.vz * dt
    q.vx *= 0.92
    q.vz *= 0.92
    q.vy -= 6 * dt
  }
}

// One name per stretch of five rooms; scene.js gives each its own palette.
export const THEME_NAMES = ['Ashen Crypt', 'Mossdeep', 'Rimefall', 'Cinderheart']

export const WORLD = { ROOM_W, ROOM_D, HALF_W, HALF_D, DOOR_W, DOOR_Z, PLAYER_R, BOSS_EVERY }
