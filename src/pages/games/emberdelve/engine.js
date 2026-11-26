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

// Each boon can be taken more than once unless it has a `max`. `rare` boons
// only turn up in elite and boss rewards, or one time in six otherwise.
export const BOONS = {
  damage: { name: 'Hotter Flame', text: '+25% damage', icon: '🔥', apply: (p) => (p.damage *= 1.25) },
  rate: { name: 'Quick Wick', text: '+20% fire rate', icon: '⚡', apply: (p) => (p.fireDelay *= 0.83) },
  multi: { name: 'Twin Spark', text: '+1 ember per shot', icon: '✨', max: 4, apply: (p) => (p.shots += 1) },
  pierce: { name: 'Needle Ember', text: 'Shots pass through +1 foe', icon: '📌', max: 3, apply: (p) => (p.pierce += 1) },
  heart: { name: 'Stout Heart', text: '+1 max heart, heal 2', icon: '❤️', apply: (p) => { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 2) } },
  speed: { name: 'Light Feet', text: '+12% move speed', icon: '👟', max: 4, apply: (p) => (p.speed *= 1.12) },
  range: { name: 'Long Burn', text: '+25% range and shot speed', icon: '🏹', max: 3, apply: (p) => { p.range *= 1.25; p.shotSpeed *= 1.2 } },
  bounce: { name: 'Ricochet', text: 'Shots bounce off walls', icon: '↩️', max: 2, apply: (p) => (p.bounce += 1) },
  dash: { name: 'Quickstep', text: 'Dash recharges 30% faster', icon: '💨', max: 3, apply: (p) => (p.dashCd *= 0.7) },
  nova: { name: 'Ember Nova', text: 'Dashing bursts out a ring of embers', icon: '💥', rare: true, apply: (p) => (p.nova += 6) },
  orbit: { name: 'Wisp', text: 'A wisp circles you, burning foes', icon: '🌀', rare: true, max: 4, apply: (p) => (p.orbs += 1) },
  crit: { name: 'Keen Eye', text: '+12% chance of a double-damage hit', icon: '🎯', max: 4, apply: (p) => (p.crit += 0.12) },
  burn: { name: 'Kindling', text: 'Hits set foes alight', icon: '♨️', rare: true, max: 3, apply: (p) => (p.burn += 1) },
  leech: { name: 'Hearthfire', text: 'Kills sometimes drop a heart', icon: '💗', rare: true, max: 2, apply: (p) => (p.leech += 0.05) },
  magnet: { name: 'Lodestone', text: 'Pull embers from further away', icon: '🧲', max: 2, apply: (p) => (p.magnet += 2) },
}

function rollBoons(game, count, rareBoost) {
  const p = game.player
  const pool = Object.keys(BOONS).filter((k) => {
    const b = BOONS[k]
    if (b.max && (p.taken[k] || 0) >= b.max) return false
    if (b.rare && !rareBoost && game.rand() > 1 / 6) return false
    return true
  })
  const picks = []
  while (picks.length < count && pool.length) {
    picks.push(pool.splice(Math.floor(game.rand() * pool.length), 1)[0])
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
  boss: { r: 1.3, hp: 220, speed: 1.6, score: 500, touch: 1 },
}

function spawnEnemy(game, kind, x, z) {
  const f = FOES[kind]
  const depth = game.depth
  const tough = 1 + (depth - 1) * 0.12 + (game.room.elite ? 0.4 : 0)
  const hp = Math.round(f.hp * (kind === 'boss' ? 1 + (depth / BOSS_EVERY - 1) * 0.6 : tough))
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
    elite: !!game.room.elite && kind !== 'boss',
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
  const kinds = game.room.boss ? ['boss'] : waveFor(game, game.room.wave)
  for (const kind of kinds) {
    let x = 0
    let z = 0
    for (let tries = 0; tries < 30; tries++) {
      x = (game.rand() * 2 - 1) * (HALF_W - 1)
      z = (game.rand() * 2 - 1) * (HALF_D - 2)
      if (kind === 'boss') {
        x = 0
        z = -3
      }
      const clearOfPlayer = dist2({ x, z }, game.player) > 16
      const clearOfPillars = game.room.pillars.every((p) => dist2({ x, z }, p) > (p.r + 1) ** 2)
      if ((clearOfPlayer && clearOfPillars) || kind === 'boss') break
    }
    game.spawns.push({ kind, x, z, t: kind === 'boss' ? 1.6 : 1 })
  }
  game.room.wave += 1
}

// ---------------------------------------------------------------- rooms

function buildRoom(game, reward) {
  const depth = game.depth
  const boss = depth % BOSS_EVERY === 0
  const pillars = []
  if (!boss) {
    const count = 2 + Math.floor(game.rand() * 4)
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
    waves: boss ? 1 : 2 + (depth >= 6 ? 1 : 0) + (reward === 'elite' ? 1 : 0),
    cleared: false,
    doors: [], // filled in once the room is cleared
    theme: Math.floor((depth - 1) / BOSS_EVERY) % 4, // palette, changes after each boss
  }
  game.enemies = []
  game.shots = []
  game.bolts = []
  game.pickups = []
  game.spawns = []
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
  boss: { label: 'Boss', note: 'Beat the Warden' },
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
    choice: null, // { boons: [keys], title }
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
    for (let i = 0; i < p.nova; i++) {
      const a = (i / p.nova) * Math.PI * 2
      fireShot(game, Math.cos(a), Math.sin(a), 0.8)
    }
  }
}

// ---------------------------------------------------------------- the step

export function step(game, input) {
  if (game.status === 'ready' || game.status === 'over' || game.status === 'choosing') {
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
  stepParticles(game, dt)
  stepRoom(game, dt)
}

function stepPlayer(game, input, dt) {
  const p = game.player
  p.dashT = Math.max(0, p.dashT - dt)
  p.inv = Math.max(0, p.inv - dt)

  if (p.dashing > 0) {
    p.dashing -= dt
    if (game.rand() < 0.6) particle(game, p.x, p.z, 0xffb347, 0.4, 0, 0)
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
      const spread = 0.16
      for (let i = 0; i < p.shots; i++) {
        const off = (i - (p.shots - 1) / 2) * spread
        const c = Math.cos(off)
        const s = Math.sin(off)
        const dx = (ax / al) * c - (az / al) * s
        const dz = (ax / al) * s + (az / al) * c
        fireShot(game, dx, dz, 1)
      }
      p.fireT = p.fireDelay
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
        }
      }
    }
  }
}

function fireShot(game, dx, dz, scale) {
  const p = game.player
  const crit = game.rand() < p.crit
  game.shots.push({
    x: p.x + dx * 0.4,
    z: p.z + dz * 0.4,
    vx: dx * p.shotSpeed,
    vz: dz * p.shotSpeed,
    life: p.range / p.shotSpeed + 0.05,
    damage: p.damage * scale * (crit ? 2 : 1),
    crit,
    pierce: p.pierce,
    bounce: p.bounce,
    hits: [],
  })
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
    e.t += dt
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
    }

    if (e.kind !== 'brute' || e.state === 'move') {
      const k = 1 - Math.exp(-dt * 6)
      e.vx += (tx * e.speed - e.vx) * k
      e.vz += (tz * e.speed - e.vz) * k
    } else if (e.state === 'wind') {
      e.vx *= 0.8
      e.vz *= 0.8
    }
    e.x += e.vx * dt
    e.z += e.vz * dt
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
        const wa = a.kind === 'boss' ? 0.1 : 1
        const wb = b.kind === 'boss' ? 0.1 : 1
        a.x -= nx * push * wa
        a.z -= nz * push * wa
        b.x += nx * push * wb
        b.z += nz * push * wb
      }
    }
  }

  for (const e of list) {
    collideWorld(game, e, e.r, false)
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

function bolt(game, x, z, dx, dz, speed) {
  game.bolts.push({ x, z, vx: dx * speed, vz: dz * speed, life: 6 })
}

function stepShots(game, dt) {
  const shots = game.shots
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
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
        if (dist2(s, e) < (e.r + 0.15) ** 2) {
          s.hits.push(e.id)
          hurtEnemy(game, e, s.damage, s.crit)
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

function stepBolts(game, dt) {
  const p = game.player
  const bolts = game.bolts
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]
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
  e.hp -= amount
  e.hit = 0.08
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

function sweepDead(game) {
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    if (game.enemies[i].hp <= 0) killEnemy(game, i)
  }
}

function killEnemy(game, i) {
  const e = game.enemies[i]
  game.enemies.splice(i, 1)
  const f = FOES[e.kind]
  const mult = game.room.elite ? 2 : 1
  game.score += f.score * mult
  game.kills += 1
  burst(game, e.x, e.z, e.kind === 'boss' ? 40 : 10, e.kind === 'boss' ? 0xff5f5f : 0xb38bff, e.kind === 'boss' ? 7 : 4)
  game.shake = Math.min(1, game.shake + (e.kind === 'boss' ? 1 : 0.15))
  game.events.push({ type: 'kill', kind: e.kind })

  // Embers to collect; each is worth a couple of points.
  const embers = e.kind === 'boss' ? 30 : e.kind === 'brute' ? 4 : 2
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
  p.hp -= amount
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
    game.score += 50 * game.depth * (room.elite ? 2 : 1)
    game.events.push({ type: 'clear' })
    const p = game.player
    if (room.reward === 'rest') {
      p.hp = Math.min(p.maxHp, p.hp + 3)
      game.events.push({ type: 'heal' })
      openDoors(game)
    } else {
      if (room.reward === 'boss') p.hp = p.maxHp
      const rare = room.reward === 'elite' || room.reward === 'boss'
      game.choice = {
        boons: rollBoons(game, 3, rare),
        title: room.reward === 'boss' ? 'The Warden falls!' : room.elite ? 'Elite cleared!' : 'Room cleared!',
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
