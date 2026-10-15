// src/pages/games/gravity-well/engine.js
// The rules of Gravity Well, after the 1995 Windows game by Software
// Engineering, Inc. Each empire has one fighter, flown by a person or the
// computer (ai.js), drifting through a sector of stars and planets. Stars
// pull hard; planets pull a little. Land gently on a planet nobody holds and
// it's yours: freighters then fly out on their own to build a Base, a Colony
// and an orbiting High Port, in that order. Bases and ports shoot at enemies
// in range. Colonies make the materials that pay for freighters. Bases have
// labs that slowly invent upgrades (rockets, then homing missiles, then
// stronger shields), fitted when the fighter next lands at a base. An empire
// with no buildings and no freighters left is out of the sector.
//
// Everything is plain data stepped on a fixed timestep (STEP) so the page,
// the computer players and node test scripts all share it. Distances are
// world units, times seconds, angles radians with y pointing down.

export const SECTOR = 2600
export const STEP = 1 / 60

const ROT_SPEED = 3.4
const THRUST = 150
const MAX_SPEED = 300
const STAR_GM = 1.6e6
const PLANET_GM = 16000
const SOFTEN = 1600 // 40², stops gravity going infinite at a star's centre
const PLANET_R = 30
const STAR_R = 34
const PORT_ORBIT = 66
const PORT_R = 11
const BULLET_SPEED = 480
const TURRET_SPEED = 360
const TURRET_RANGE = 320
const RESPAWN_S = 4
const FREIGHTER_COST = 30
const STOCK_MAX = 150
const MAX_FREIGHTERS = 4
const FREIGHTER_SPEED = 120
const FREIGHTER_ACCEL = 80
const ROCKET_SPEED = 330
const ROCKET_DAMAGE = 35
const ROCKET_EVERY = 0.7
const AMMO_MAX = 6
const MISSILE_TURN = 2.6
export const SAVE_VERSION = 1

// What the labs invent, in order, and how much research each takes in all.
// Research runs at 0.75 a second with one base, up to 1.25 with three.
export const UPGRADES = [
  { key: 'rockets', label: 'Rockets', at: 60 },
  { key: 'missiles', label: 'Homing missiles', at: 150 },
  { key: 'shields', label: 'Stronger shields', at: 260 },
]
const SHIELD_BOOST = 1.6

export const MODES = {
  easy: {
    label: 'Easy',
    gravity: 0.55,
    landSpeed: 110,
    shield: 120,
    hull: 140,
    foeDamage: 0.55,
    starKills: false,
    brake: true,
    rate: 1.5,
    ai: { engage: 360, aimError: 0.22, fireEvery: 0.45, think: 0.9, claimDelay: 8, raidAfter: 420 },
  },
  normal: {
    label: 'Normal',
    gravity: 1,
    landSpeed: 70,
    shield: 60,
    hull: 100,
    foeDamage: 1,
    starKills: true,
    brake: false,
    rate: 1.5,
    ai: { engage: 520, aimError: 0.06, fireEvery: 0.2, think: 0.4, claimDelay: 0, raidAfter: 120 },
  },
}

export const EMPIRES = [
  { name: 'Blue', color: '#4fb0ff' },
  { name: 'Red', color: '#ff5b4f' },
  { name: 'Purple', color: '#c47bff' },
  { name: 'Yellow', color: '#ffd84a' },
]

export const INSTALL = {
  base: { label: 'Base', hp: 200, turret: 1.5 },
  colony: { label: 'Colony', hp: 140, turret: 0 },
  port: { label: 'High Port', hp: 180, turret: 1.0 },
}
export const BUILD_ORDER = ['base', 'colony', 'port']

const PLANET_NAMES = [
  'Pebble', 'Mossy', 'Bramble', 'Tumble', 'Puddle', 'Biscuit', 'Crumble', 'Pickle',
  'Nutmeg', 'Juniper', 'Sprout', 'Marble', 'Wombat', 'Thimble', 'Clover', 'Pudding',
]

// ---------- helpers ----------

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

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export function angleDiff(to, from) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export const hasInstall = (p) => !!(p.base || p.colony || p.port)
export const installNeed = (p) => BUILD_ORDER.find((k) => !p[k]) ?? null
export const planetById = (game, id) => game.planets[id]
export const fighterOf = (game, owner) => game.ships.find((s) => s.kind === 'fighter' && s.owner === owner) ?? null

// Where a planet's buildings and port are.
export const siteAngle = (p, which) => p.site + (which === 'colony' ? 0.95 : 0)
export function sitePos(p, which) {
  const a = siteAngle(p, which)
  return { x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r }
}
export function portPos(p) {
  return { x: p.x + Math.cos(p.portAngle) * PORT_ORBIT, y: p.y + Math.sin(p.portAngle) * PORT_ORBIT }
}

export function gravityAt(game, x, y) {
  let gx = 0
  let gy = 0
  const k = game.cfg.gravity
  for (const s of game.stars) {
    const dx = s.x - x
    const dy = s.y - y
    const d2 = dx * dx + dy * dy
    const d = Math.sqrt(d2) || 1
    const a = (STAR_GM * k) / (d2 + SOFTEN)
    gx += (dx / d) * a
    gy += (dy / d) * a
  }
  for (const p of game.planets) {
    const dx = p.x - x
    const dy = p.y - y
    const d2 = dx * dx + dy * dy
    if (d2 > 250000) continue
    const d = Math.sqrt(d2) || 1
    const a = (PLANET_GM * k) / (d2 + 400)
    gx += (dx / d) * a
    gy += (dy / d) * a
  }
  return { x: gx, y: gy }
}

// The acceleration that takes a ship to (tx, ty), arriving at `arrive`
// speed `standoff` short of it, steering round stars and other planets.
// Fighters have to make it with their one engine (see fly() in ai.js);
// freighters are simply given it.
export function seekAccel(game, s, tx, ty, opts = {}) {
  const { standoff = 0, arrive = 0, vmax = 260, amax = 60, gravity = true, tvx = 0, tvy = 0, avoidPlanet = -1 } = opts
  const dx = tx - s.x
  const dy = ty - s.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  let speed
  if (d >= standoff) speed = Math.min(vmax, Math.sqrt(2 * amax * (d - standoff)) + arrive)
  else speed = -Math.min(vmax * 0.4, (standoff - d) * 1.5)
  let ax = (ux * speed + tvx - s.vx) * 1.6
  let ay = (uy * speed + tvy - s.vy) * 1.6

  // Keep clear of (cx, cy): push away when inside `safe`, and also when the
  // way we're drifting would take us inside it within a second and a half.
  const avoid = (cx, cy, safe, push) => {
    const ex = s.x - cx
    const ey = s.y - cy
    const e = Math.hypot(ex, ey) || 1
    if (e > safe + 450) return
    // Closest approach on our current drift.
    const vv = s.vx * s.vx + s.vy * s.vy
    const tc = vv > 1 ? Math.max(0, Math.min(1.5, -(ex * s.vx + ey * s.vy) / vv)) : 0
    const cxp = ex + s.vx * tc
    const cyp = ey + s.vy * tc
    const c = Math.hypot(cxp, cyp) || 1
    const near = Math.min(e, c)
    if (near >= safe) return
    const k = ((safe - near) / safe) * push
    // Away from it, measured from wherever we'd be closest.
    const ox = (c < e ? cxp / c : ex / e)
    const oy = (c < e ? cyp / c : ey / e)
    ax += ox * k
    ay += oy * k
    // Slide round it on whichever side is nearer the way we're going.
    const side = -ey * ux + ex * uy >= 0 ? 1 : -1
    ax += (-ey / e) * side * k * 0.5
    ay += (ex / e) * side * k * 0.5
    // And stop falling in.
    const vin = -(s.vx * ex + s.vy * ey) / e
    if (vin > 0) {
      ax += (ex / e) * vin * 1.5
      ay += (ey / e) * vin * 1.5
    }
  }
  for (const st of game.stars) avoid(st.x, st.y, st.r + 150, amax * 4)
  for (const p of game.planets) if (p.id !== avoidPlanet) avoid(p.x, p.y, p.r + 34, amax * 2)

  if (gravity) {
    const g = gravityAt(game, s.x, s.y)
    ax -= g.x
    ay -= g.y
  }
  return { x: ax, y: ay }
}

// ---------- the sector ----------

function makeSector(rand, empireCount) {
  const stars = []
  const spots = [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ]
  for (const [cx, cy] of spots) {
    stars.push({ x: cx * SECTOR + (rand() - 0.5) * 320, y: cy * SECTOR + (rand() - 0.5) * 320, r: STAR_R })
  }
  // Two planets a star (three with a crowded sector), with one star
  // sometimes getting one more.
  const each = empireCount > 2 ? 3 : 2
  const counts = stars.map(() => each)
  if (rand() < 0.6) counts[Math.floor(rand() * counts.length)] = each + 1
  if (each === 3) counts[Math.floor(rand() * counts.length)] -= 1
  const names = [...PLANET_NAMES]
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  const planets = []
  stars.forEach((star, si) => {
    for (let k = 0; k < counts[si]; k++) {
      for (let tries = 0; tries < 60; tries++) {
        const a = rand() * Math.PI * 2
        const d = 200 + rand() * 90
        const x = star.x + Math.cos(a) * d
        const y = star.y + Math.sin(a) * d
        if (x < 160 || y < 160 || x > SECTOR - 160 || y > SECTOR - 160) continue
        if (planets.some((p) => Math.hypot(p.x - x, p.y - y) < 180)) continue
        if (stars.some((s, j) => j !== si && Math.hypot(s.x - x, s.y - y) < 320)) continue
        planets.push({
          id: planets.length,
          name: names[planets.length],
          x,
          y,
          r: PLANET_R,
          star: si,
          owner: null,
          base: null,
          colony: null,
          port: null,
          // Buildings on the side facing away from the star.
          site: a,
          portAngle: rand() * Math.PI * 2,
          portSpin: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.15),
          hitAt: -99,
        })
        break
      }
    }
  })
  // Homes in the corners: Blue bottom left, Red top right, Purple top left
  // and Yellow bottom right.
  const corners = [
    [0, SECTOR],
    [SECTOR, 0],
    [0, 0],
    [SECTOR, SECTOR],
  ]
  const homes = []
  for (let e = 0; e < empireCount; e++) {
    const [cx, cy] = corners[e]
    let best = null
    for (const p of planets) {
      if (homes.includes(p.id)) continue
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (!best || d < best.d) best = { id: p.id, d }
    }
    homes.push(best.id)
  }
  return { stars, planets, homes }
}

function install(kind) {
  return { hp: INSTALL[kind].hp, max: INSTALL[kind].hp, cool: Math.random() * INSTALL[kind].turret }
}

export function createGame(mode = 'normal', { seed = Math.floor(Math.random() * 2 ** 31), empires = 2 } = {}) {
  const cfg = MODES[mode] ?? MODES.normal
  const rand = mulberry32(seed)
  const { stars, planets, homes } = makeSector(rand, empires)
  const game = {
    mode,
    cfg,
    seed,
    time: 0,
    status: 'playing', // 'playing' | 'won' | 'lost'
    stars,
    planets,
    empires: [],
    ships: [],
    bullets: [],
    particles: [],
    events: [],
    nextId: 1,
  }
  for (let e = 0; e < empires; e++) {
    const home = planets[homes[e]]
    home.owner = e
    home.base = install('base')
    home.colony = install('colony')
    home.port = install('port')
    game.empires.push({
      id: e,
      ...EMPIRES[e],
      human: e === 0,
      out: false,
      home: home.id,
      launch: home.id,
      stock: 60,
      buildAt: 2 + e,
      respawnAt: 0,
      claimAt: 0,
      research: 0,
      ready: 0, // upgrades invented so far
    })
    spawnFighter(game, game.empires[e], home)
  }
  return game
}

function spawnFighter(game, empire, planet) {
  const human = empire.human
  const shield = human ? game.cfg.shield : 60
  const hull = human ? game.cfg.hull : 100
  // On the far side from the buildings, but not facing the star.
  const ang = planet.site - 1.4
  const ship = {
    id: game.nextId++,
    kind: 'fighter',
    tech: 0,
    ammo: 0,
    rocketCool: 0,
    launch: false,
    baseShield: shield,
    owner: empire.id,
    x: planet.x + Math.cos(ang) * (planet.r + 8),
    y: planet.y + Math.sin(ang) * (planet.r + 8),
    vx: 0,
    vy: 0,
    a: ang,
    r: 10,
    shield,
    shieldMax: shield,
    hull,
    hullMax: hull,
    landed: { planet: planet.id, ang },
    cool: 0,
    fireEvery: human ? 0.16 : game.cfg.ai.fireEvery,
    turn: 0,
    thrust: false,
    fire: false,
    duty: 0,
    lastHit: -99,
    brain: {},
  }
  fitUpgrades(game, ship, empire)
  ship.shield = ship.shieldMax
  ship.ammo = ship.tech >= 1 ? AMMO_MAX : 0
  game.ships.push(ship)
  return ship
}

// Bring a fighter up to everything its labs have invented.
function fitUpgrades(game, ship, empire) {
  if (ship.tech >= empire.ready) return false
  ship.tech = empire.ready
  ship.shieldMax = ship.baseShield * (ship.tech >= 3 ? SHIELD_BOOST : 1)
  if (ship.tech >= 1) ship.ammo = AMMO_MAX
  return true
}

export const AMMO = AMMO_MAX
export const weaponOf = (ship) => (ship.tech >= 2 ? 'missile' : ship.tech >= 1 ? 'rocket' : null)

function spawnFreighter(game, empire, from, target) {
  const a = Math.atan2(target.y - from.y, target.x - from.x)
  game.ships.push({
    id: game.nextId++,
    kind: 'freighter',
    owner: empire.id,
    x: from.x + Math.cos(a) * (from.r + 12),
    y: from.y + Math.sin(a) * (from.r + 12),
    vx: Math.cos(a) * 40,
    vy: Math.sin(a) * 40,
    a,
    r: 9,
    shield: 0,
    shieldMax: 0,
    hull: 40,
    hullMax: 40,
    target: target.id,
    home: from.id,
    returning: false,
    lastHit: -99,
  })
}

// ---------- events and effects ----------

function emit(game, ev) {
  game.events.push(ev)
}

export function takeEvents(game) {
  const out = game.events
  game.events = []
  return out
}

function explode(game, x, y, color, n = 18, speed = 140) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.3 + Math.random())
    game.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.7, max: 1.2, color })
  }
}

function sparks(game, x, y, color) {
  explode(game, x, y, color, 4, 70)
}

// ---------- damage ----------

function hurtShip(game, ship, amount, from) {
  if (ship.dead) return
  if (game.empires[ship.owner].human && from != null && !game.empires[from].human) amount *= game.cfg.foeDamage
  ship.lastHit = game.time
  const soak = Math.min(ship.shield, amount)
  ship.shield -= soak
  ship.hull -= amount - soak
  if (ship.hull <= 0) killShip(game, ship, from)
}

function killShip(game, ship, by) {
  if (ship.dead) return
  ship.dead = true
  const color = game.empires[ship.owner].color
  explode(game, ship.x, ship.y, color, ship.kind === 'fighter' ? 28 : 16)
  explode(game, ship.x, ship.y, '#ffe9a8', 10, 90)
  if (ship.kind === 'fighter') game.empires[ship.owner].respawnAt = game.time + RESPAWN_S
  emit(game, { type: 'destroyed', kind: ship.kind, owner: ship.owner, by })
}

function hurtInstall(game, p, kind, amount, by) {
  const inst = p[kind]
  if (!inst) return
  inst.hp -= amount
  p.hitAt = game.time
  if (inst.hp > 0) return
  p[kind] = null
  const at = kind === 'port' ? portPos(p) : sitePos(p, kind)
  explode(game, at.x, at.y, game.empires[p.owner].color, 30, 160)
  explode(game, at.x, at.y, '#ffd27a', 16, 110)
  emit(game, { type: 'lost', kind, planet: p.id, owner: p.owner, by })
}

// ---------- the economy ----------

// The planet this empire most wants a freighter sent to, if any: a base
// before a colony before a port, and nearest first.
function pickNeed(game, empire, from, skip = null) {
  const claimed = new Set(game.ships.filter((s) => s.kind === 'freighter' && s.owner === empire.id && s !== skip && !s.returning).map((s) => s.target))
  let best = null
  for (const p of game.planets) {
    if (p.owner !== empire.id || claimed.has(p.id)) continue
    const need = installNeed(p)
    if (!need) continue
    const score = BUILD_ORDER.indexOf(need) * 4000 + Math.hypot(p.x - from.x, p.y - from.y)
    if (!best || score < best.score) best = { p, score }
  }
  return best?.p ?? null
}

const isYard = (p, owner) => p.owner === owner && p.base && p.colony

function runEconomy(game, dt) {
  for (const e of game.empires) {
    if (e.out) continue
    const colonies = game.planets.filter((p) => p.owner === e.id && p.colony).length
    e.stock = Math.min(STOCK_MAX, e.stock + colonies * game.cfg.rate * dt)

    const labs = Math.min(3, game.planets.filter((p) => p.owner === e.id && p.base).length)
    if (labs && e.ready < UPGRADES.length) {
      e.research += dt * (0.5 + labs * 0.25)
      if (e.research >= UPGRADES[e.ready].at) {
        e.ready += 1
        emit(game, { type: 'invented', owner: e.id, level: e.ready })
      }
    }

    if (game.time >= e.buildAt && e.stock >= FREIGHTER_COST) {
      e.buildAt = game.time + 1
      const fleet = game.ships.filter((s) => s.kind === 'freighter' && s.owner === e.id).length
      const yards = game.planets.filter((p) => isYard(p, e.id))
      if (fleet < MAX_FREIGHTERS && yards.length) {
        const target = pickNeed(game, e, game.planets[e.home])
        if (target) {
          let from = yards[0]
          for (const y of yards) if (dist(y, target) < dist(from, target)) from = y
          spawnFreighter(game, e, from, target)
          e.stock -= FREIGHTER_COST
          e.buildAt = game.time + 4
          emit(game, { type: 'freighter', owner: e.id, planet: target.id })
        }
      }
    }

    if (!fighterOf(game, e.id) && game.time >= e.respawnAt) {
      const p = launchPlanet(game, e)
      if (p) {
        spawnFighter(game, e, p)
        emit(game, { type: 'launch', owner: e.id, planet: p.id })
      }
    }
  }
}

// Where a new fighter takes off from: the last of your planets you landed
// on, if it still has a base or port, otherwise the nearest one that does.
export function launchPlanet(game, e) {
  const ok = (p) => p.owner === e.id && (p.base || p.port)
  const last = game.planets[e.launch]
  if (last && ok(last)) return last
  let best = null
  for (const p of game.planets) {
    if (!ok(p)) continue
    if (!best || dist(p, last) < dist(best, last)) best = p
  }
  return best
}

// ---------- ships ----------

function landOn(game, ship, p, nx, ny) {
  ship.landed = { planet: p.id, ang: Math.atan2(ny, nx) }
  ship.vx = 0
  ship.vy = 0
  const e = game.empires[ship.owner]
  if (p.owner !== ship.owner) {
    const from = p.owner
    p.owner = ship.owner
    e.claimAt = game.time
    explode(game, p.x + nx * p.r, p.y + ny * p.r, e.color, 10, 60)
    emit(game, { type: 'claim', owner: ship.owner, planet: p.id, from })
  } else {
    emit(game, { type: 'landed', owner: ship.owner, planet: p.id })
  }
  if (p.base || p.port) e.launch = p.id
}

function placeLanded(game, s) {
  const p = game.planets[s.landed.planet]
  const a = s.landed.ang
  s.a = a
  s.x = p.x + Math.cos(a) * (p.r + s.r * 0.8)
  s.y = p.y + Math.sin(a) * (p.r + s.r * 0.8)
  return p
}

function stepFighter(game, s, dt) {
  const cfg = game.cfg
  if (s.landed) {
    const p = placeLanded(game, s)
    const a = s.landed.ang
    if (p.owner === s.owner && (p.base || p.port)) {
      s.hull = Math.min(s.hullMax, s.hull + 15 * dt)
      s.shield = Math.min(s.shieldMax, s.shield + 30 * dt)
      if (s.tech >= 1 && s.ammo < AMMO_MAX) {
        s.reload = (s.reload ?? 0) + dt
        if (s.reload >= 0.5) {
          s.reload = 0
          s.ammo += 1
        }
      }
      // The labs are at the base.
      if (p.base && fitUpgrades(game, s, game.empires[s.owner])) {
        emit(game, { type: 'fitted', owner: s.owner, level: s.tech })
      }
    }
    if (p.owner !== s.owner && hasInstall(p)) {
      // Someone built here while we sat on it: off you go.
      s.landed = null
    } else if (!s.thrust) return
    s.landed = null
    s.vx = Math.cos(a) * 70
    s.vy = Math.sin(a) * 70
  }

  s.a += s.turn * ROT_SPEED * dt
  const g = gravityAt(game, s.x, s.y)
  let ax = g.x
  let ay = g.y
  if (s.thrust) {
    ax += Math.cos(s.a) * THRUST
    ay += Math.sin(s.a) * THRUST
  }
  s.vx += ax * dt
  s.vy += ay * dt
  const v = Math.hypot(s.vx, s.vy)
  if (v > MAX_SPEED) {
    s.vx *= MAX_SPEED / v
    s.vy *= MAX_SPEED / v
  }
  s.x += s.vx * dt
  s.y += s.vy * dt

  // Sector edges bounce you back in.
  if (s.x < 0 || s.x > SECTOR) {
    s.x = Math.max(0, Math.min(SECTOR, s.x))
    s.vx = -s.vx * 0.5
  }
  if (s.y < 0 || s.y > SECTOR) {
    s.y = Math.max(0, Math.min(SECTOR, s.y))
    s.vy = -s.vy * 0.5
  }

  if (s.shield < s.shieldMax && game.time - s.lastHit > 2.5) s.shield = Math.min(s.shieldMax, s.shield + 8 * dt)

  for (const st of game.stars) {
    const d = Math.hypot(s.x - st.x, s.y - st.y)
    if (d >= st.r + s.r * 0.6) continue
    if (cfg.starKills) {
      emit(game, { type: 'star', owner: s.owner })
      killShip(game, s, null)
      return
    }
    // Easy mode: singed and flung back out.
    const nx = (s.x - st.x) / d
    const ny = (s.y - st.y) / d
    s.x = st.x + nx * (st.r + s.r)
    s.y = st.y + ny * (st.r + s.r)
    s.vx = nx * 160
    s.vy = ny * 160
    emit(game, { type: 'star', owner: s.owner })
    hurtShip(game, s, 35, null)
    if (s.dead) return
  }

  for (const p of game.planets) {
    const dx = s.x - p.x
    const dy = s.y - p.y
    const d = Math.hypot(dx, dy)
    const touch = p.r + s.r * 0.8
    if (d >= touch) continue
    const nx = dx / d
    const ny = dy / d
    const speed = Math.hypot(s.vx, s.vy)
    const hostile = p.owner != null && p.owner !== s.owner && hasInstall(p)
    if (!hostile && speed <= cfg.landSpeed) {
      landOn(game, s, p, nx, ny)
      placeLanded(game, s)
      return
    }
    // Too fast, or their guns are still standing: bounce off.
    s.x = p.x + nx * touch
    s.y = p.y + ny * touch
    const vn = s.vx * nx + s.vy * ny
    if (vn < 0) {
      s.vx -= 1.5 * vn * nx
      s.vy -= 1.5 * vn * ny
    }
    if (game.time - (s.bumpAt ?? -9) > 0.4) {
      s.bumpAt = game.time
      emit(game, { type: 'bump', owner: s.owner, planet: p.id, hostile })
      hurtShip(game, s, Math.max(6, (speed - cfg.landSpeed) * 0.3), null)
      if (s.dead) return
    }
  }
}

function stepFreighter(game, f, dt) {
  const e = game.empires[f.owner]
  let t = game.planets[f.target]
  if (!f.returning && (t.owner !== f.owner || !installNeed(t))) {
    const next = pickNeed(game, e, f, f)
    if (next) t = next
    else {
      // Nowhere to build: head back to a yard and unload.
      const yards = game.planets.filter((p) => isYard(p, f.owner))
      f.returning = true
      t = yards.sort((a, b) => dist(a, f) - dist(b, f))[0] ?? t
    }
    f.target = t.id
  }
  const acc = seekAccel(game, f, t.x, t.y, {
    standoff: t.r + 6,
    arrive: 30,
    vmax: FREIGHTER_SPEED,
    amax: FREIGHTER_ACCEL * 0.6,
    gravity: false,
    avoidPlanet: t.id,
  })
  const am = Math.hypot(acc.x, acc.y)
  const k = am > FREIGHTER_ACCEL ? FREIGHTER_ACCEL / am : 1
  f.vx += acc.x * k * dt
  f.vy += acc.y * k * dt
  const v = Math.hypot(f.vx, f.vy)
  if (v > FREIGHTER_SPEED) {
    f.vx *= FREIGHTER_SPEED / v
    f.vy *= FREIGHTER_SPEED / v
  }
  f.x += f.vx * dt
  f.y += f.vy * dt
  if (v > 5) f.a = Math.atan2(f.vy, f.vx)

  if (dist(f, t) > t.r + 14) return
  f.dead = true
  if (f.returning || t.owner !== f.owner) {
    e.stock = Math.min(STOCK_MAX, e.stock + FREIGHTER_COST * 0.8)
    return
  }
  const kind = installNeed(t)
  if (!kind) return
  t[kind] = install(kind)
  const at = kind === 'port' ? portPos(t) : sitePos(t, kind)
  explode(game, at.x, at.y, e.color, 14, 70)
  emit(game, { type: 'built', kind, owner: f.owner, planet: t.id })
}

// ---------- shooting ----------

function fire(game, owner, x, y, vx, vy, dmg, life, extra = null) {
  game.bullets.push({ x, y, vx, vy, owner, dmg, life, ...extra })
}

// A missile picks the nearest enemy ship roughly ahead of it.
function missileTarget(game, b) {
  let best = null
  let bestD = 700
  const heading = Math.atan2(b.vy, b.vx)
  for (const s of game.ships) {
    if (s.owner === b.owner || s.dead) continue
    const d = Math.hypot(s.x - b.x, s.y - b.y)
    if (d >= bestD) continue
    if (Math.abs(angleDiff(Math.atan2(s.y - b.y, s.x - b.x), heading)) > 1.2) continue
    best = s
    bestD = d
  }
  return best?.id ?? null
}

function hitBoom(game, b) {
  if (b.kind) {
    explode(game, b.x, b.y, '#ffb35c', 14, 120)
    emit(game, { type: 'boom', owner: b.owner })
  }
}

// Direction to shoot from (x, y) at speed `speed` to hit a target moving
// at (tvx, tvy).
export function leadAngle(x, y, t, speed) {
  const dx = t.x - x
  const dy = t.y - y
  const a = t.vx * t.vx + t.vy * t.vy - speed * speed
  const b = 2 * (dx * t.vx + dy * t.vy)
  const c = dx * dx + dy * dy
  let time = Math.sqrt(c) / speed
  const disc = b * b - 4 * a * c
  if (Math.abs(a) > 1e-6 && disc >= 0) {
    const r1 = (-b - Math.sqrt(disc)) / (2 * a)
    const r2 = (-b + Math.sqrt(disc)) / (2 * a)
    const r = Math.min(r1, r2) > 0 ? Math.min(r1, r2) : Math.max(r1, r2)
    if (r > 0) time = r
  }
  return Math.atan2(dy + t.vy * time, dx + t.vx * time)
}

function stepTurrets(game, dt) {
  for (const p of game.planets) {
    if (p.owner == null) continue
    for (const kind of ['base', 'port']) {
      const inst = p[kind]
      if (!inst) continue
      inst.cool -= dt
      if (inst.cool > 0) continue
      const at = kind === 'port' ? portPos(p) : sitePos(p, kind)
      let target = null
      let best = TURRET_RANGE
      for (const s of game.ships) {
        if (s.owner === p.owner || s.dead) continue
        const d = Math.hypot(s.x - at.x, s.y - at.y)
        if (d < best) {
          best = d
          target = s
        }
      }
      if (!target) {
        inst.cool = 0.2
        continue
      }
      inst.cool = INSTALL[kind].turret
      const a = leadAngle(at.x, at.y, target, TURRET_SPEED) + (Math.random() - 0.5) * 0.12
      fire(game, p.owner, at.x + Math.cos(a) * 6, at.y + Math.sin(a) * 6, Math.cos(a) * TURRET_SPEED, Math.sin(a) * TURRET_SPEED, 6, TURRET_RANGE / TURRET_SPEED + 0.2)
    }
  }
}

function stepBullets(game, dt) {
  const keep = []
  outer: for (const b of game.bullets) {
    b.life -= dt
    if (b.life <= 0) continue
    if (b.kind === 'missile') {
      // Steer towards the target, picking a new one if it's gone.
      let t = b.target != null ? game.ships.find((s) => s.id === b.target && !s.dead) : null
      if (!t) {
        b.target = missileTarget(game, b)
        t = b.target != null ? game.ships.find((s) => s.id === b.target) : null
      }
      const sp = Math.hypot(b.vx, b.vy)
      let a = Math.atan2(b.vy, b.vx)
      if (t) {
        const want = leadAngle(b.x, b.y, t, sp)
        const d = angleDiff(want, a)
        a += Math.max(-MISSILE_TURN * dt, Math.min(MISSILE_TURN * dt, d))
      }
      const nsp = Math.min(ROCKET_SPEED + 120, sp + 90 * dt)
      b.vx = Math.cos(a) * nsp
      b.vy = Math.sin(a) * nsp
    }
    if (b.kind && Math.random() < 0.5) {
      game.particles.push({ x: b.x, y: b.y, vx: -b.vx * 0.1 + (Math.random() - 0.5) * 20, vy: -b.vy * 0.1 + (Math.random() - 0.5) * 20, life: 0.35, max: 0.35, color: '#ffb35c' })
    }
    b.x += b.vx * dt
    b.y += b.vy * dt
    for (const st of game.stars) {
      if (Math.hypot(b.x - st.x, b.y - st.y) < st.r) {
        hitBoom(game, b)
        continue outer
      }
    }
    for (const p of game.planets) {
      if (p.owner === b.owner) continue // your own shots fly over your own planets
      if (p.port && Math.hypot(b.x - portPos(p).x, b.y - portPos(p).y) < PORT_R + 2) {
        sparks(game, b.x, b.y, '#ffd27a')
        hitBoom(game, b)
        hurtInstall(game, p, 'port', b.dmg, b.owner)
        continue outer
      }
      const d = Math.hypot(b.x - p.x, b.y - p.y)
      if (d >= p.r) continue
      sparks(game, b.x, b.y, p.owner != null ? '#ffd27a' : '#7be08a')
      hitBoom(game, b)
      if (p.owner != null) {
        // The building nearest where it landed takes the hit.
        const hit = Math.atan2(b.y - p.y, b.x - p.x)
        const opts = ['base', 'colony'].filter((k) => p[k])
        if (opts.length) {
          opts.sort((x, y) => Math.abs(angleDiff(hit, siteAngle(p, x))) - Math.abs(angleDiff(hit, siteAngle(p, y))))
          hurtInstall(game, p, opts[0], b.dmg, b.owner)
        }
      }
      continue outer
    }
    for (const s of game.ships) {
      if (s.owner === b.owner || s.dead) continue
      if (Math.hypot(b.x - s.x, b.y - s.y) < s.r + (b.kind ? 5 : 3)) {
        sparks(game, b.x, b.y, s.shield > 0 ? '#9fe4ff' : '#ffb35c')
        hitBoom(game, b)
        hurtShip(game, s, b.dmg, b.owner)
        continue outer
      }
    }
    keep.push(b)
  }
  game.bullets = keep
}

// ---------- the whole step ----------

// Each fighter's turn, thrust, fire and launch (rocket) are set before each
// step: the person's by the page, the computer's by ai.js.
export function step(game, dt = STEP) {
  if (game.status !== 'playing') {
    stepParticles(game, dt)
    return
  }
  game.time += dt
  runEconomy(game, dt)

  for (const s of game.ships) {
    if (s.dead) continue
    if (s.kind === 'fighter') {
      stepFighter(game, s, dt)
      s.cool -= dt
      if (!s.dead && s.fire && s.cool <= 0) {
        s.cool = s.fireEvery
        const nx = Math.cos(s.a)
        const ny = Math.sin(s.a)
        fire(game, s.owner, s.x + nx * (s.r + 3), s.y + ny * (s.r + 3), s.vx + nx * BULLET_SPEED, s.vy + ny * BULLET_SPEED, 10, 1.1)
        emit(game, { type: 'shot', owner: s.owner })
      }
      s.rocketCool -= dt
      const kind = weaponOf(s)
      if (!s.dead && s.launch && kind && s.ammo > 0 && s.rocketCool <= 0) {
        s.rocketCool = ROCKET_EVERY
        s.ammo -= 1
        const nx = Math.cos(s.a)
        const ny = Math.sin(s.a)
        const b = { kind }
        fire(game, s.owner, s.x + nx * (s.r + 4), s.y + ny * (s.r + 4), s.vx + nx * ROCKET_SPEED, s.vy + ny * ROCKET_SPEED, ROCKET_DAMAGE, 2.6, b)
        if (kind === 'missile') game.bullets[game.bullets.length - 1].target = missileTarget(game, game.bullets[game.bullets.length - 1])
        emit(game, { type: 'rocket', owner: s.owner, kind })
      }
    } else stepFreighter(game, s, dt)
  }
  for (const p of game.planets) p.portAngle += p.portSpin * dt
  stepTurrets(game, dt)
  stepBullets(game, dt)
  for (const p of game.planets) {
    if (!p.base || game.time - p.hitAt < 6) continue
    for (const k of BUILD_ORDER) if (p[k]) p[k].hp = Math.min(p[k].max, p[k].hp + 3 * dt)
  }
  game.ships = game.ships.filter((s) => !s.dead)
  stepParticles(game, dt)
  checkOut(game)
}

function stepParticles(game, dt) {
  for (const q of game.particles) {
    q.x += q.vx * dt
    q.y += q.vy * dt
    q.vx *= 0.98
    q.vy *= 0.98
    q.life -= dt
  }
  game.particles = game.particles.filter((q) => q.life > 0)
}

function checkOut(game) {
  for (const e of game.empires) {
    if (e.out) continue
    const standing = game.planets.some((p) => p.owner === e.id && hasInstall(p))
    const fleet = game.ships.some((s) => s.kind === 'freighter' && s.owner === e.id)
    if (standing || fleet) continue
    e.out = true
    const f = fighterOf(game, e.id)
    if (f) killShip(game, f, null)
    game.ships = game.ships.filter((s) => !s.dead)
    emit(game, { type: 'out', owner: e.id })
  }
  if (game.empires[0].out) game.status = 'lost'
  else if (game.empires.every((e) => e.human || e.out)) game.status = 'won'
  if (game.status !== 'playing') emit(game, { type: 'over', status: game.status })
}

export function counts(game) {
  return game.empires.map((e) => game.planets.filter((p) => p.owner === e.id).length)
}

export const speedOf = (s) => Math.hypot(s.vx, s.vy)

// ---------- saving ----------

// The game as a string to keep on the phone (sparks and messages aren't kept).
export function saveGame(game) {
  const { cfg, particles, events, ...rest } = game
  return JSON.stringify({ v: SAVE_VERSION, ...rest })
}

export function loadGame(text) {
  try {
    const data = JSON.parse(text)
    if (data?.v !== SAVE_VERSION || !MODES[data.mode] || data.status !== 'playing') return null
    const { v, ...rest } = data
    return { ...rest, cfg: MODES[data.mode], particles: [], events: [] }
  } catch {
    return null
  }
}
export { MAX_SPEED, THRUST, ROT_SPEED, BULLET_SPEED, PORT_ORBIT, PORT_R, TURRET_RANGE }
