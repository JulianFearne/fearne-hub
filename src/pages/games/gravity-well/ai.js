// src/pages/games/gravity-well/ai.js
// Flying a fighter with one engine, for the computer empires and for the
// person's Brake button. A fighter can only turn and push forwards, so to
// get any acceleration it wants it turns to face that way and fires the
// engine in short bursts that average out to the right amount (fly()).
//
// Each computer fighter picks a job every so often (think in MODES.ai):
//   repair  badly hurt: land on one of its own bases or ports to mend (or
//           at a base to pick up new upgrades and more rockets)
//   fight   an enemy ship is close: chase it and shoot
//   claim   fly to the nearest planet nobody holds (or an enemy's empty one)
//           and land on it
//   raid    no planets left to claim: sit off an enemy planet and shoot it
//   home    nothing to do: land at home

import { BULLET_SPEED, THRUST, TURRET_RANGE, angleDiff, dist, fighterOf, gravityAt, hasInstall, leadAngle, portPos, seekAccel, sitePos } from './engine'

// Turn towards acceleration (ax, ay) and push in bursts that add up to it.
export function fly(s, ax, ay, deadband = 12) {
  const mag = Math.hypot(ax, ay)
  if (mag < deadband) {
    s.turn = 0
    s.thrust = false
    return
  }
  face(s, Math.atan2(ay, ax))
  const err = Math.abs(angleDiff(Math.atan2(ay, ax), s.a))
  s.thrust = false
  if (err < 0.5) {
    s.duty = (s.duty ?? 0) + Math.min(1, mag / THRUST)
    if (s.duty >= 1) {
      s.duty -= 1
      s.thrust = true
    }
  }
}

function face(s, want) {
  const diff = angleDiff(want, s.a)
  s.turn = Math.abs(diff) > 0.05 ? Math.sign(diff) : 0
}

// Easy mode's Brake button: come to a stop and hold still against gravity.
export function brake(game, s) {
  const g = gravityAt(game, s.x, s.y)
  fly(s, -s.vx * 1.8 - g.x, -s.vy * 1.8 - g.y, 8)
}

const claimable = (p, owner) => p.owner !== owner && !hasInstall(p)

function choose(game, empire, s) {
  const ai = game.cfg.ai
  const b = s.brain
  const mine = (p) => p.owner === empire.id && (p.base || p.port)
  const nearest = (list, from = s) => list.reduce((best, x) => (!best || dist(x, from) < dist(best, from) ? x : best), null)

  const hurt = s.hull / s.hullMax
  const repairAt = nearest(game.planets.filter(mine))
  if (repairAt && (hurt < 0.4 || (b.job === 'repair' && hurt < 0.95))) return { job: 'repair', planet: repairAt.id }

  // Chase enemy ships, but not into the guns of their own planets.
  const covered = (o) =>
    game.planets.some((p) => p.owner === o.owner && (p.base || p.port) && dist(p, o) < TURRET_RANGE + 30)
  const foes = game.ships.filter((o) => o.owner !== empire.id && !o.dead && dist(o, s) < ai.engage && !covered(o))
  const foe = nearest(foes.filter((o) => o.kind === 'fighter')) ?? nearest(foes)
  if (foe) return { job: 'fight', ship: foe.id }

  // New upgrades from the labs, or out of rockets: call in at a base.
  const lab = nearest(game.planets.filter((p) => p.owner === empire.id && p.base))
  if (lab && (empire.ready > s.tech || (s.tech >= 1 && s.ammo === 0))) return { job: 'repair', planet: lab.id }

  if (game.time - empire.claimAt >= ai.claimDelay) {
    const target = nearest(game.planets.filter((p) => claimable(p, empire.id)))
    if (target) return { job: 'claim', planet: target.id }
  }

  if (game.time >= ai.raidAfter) {
    const target = nearest(game.planets.filter((p) => p.owner != null && p.owner !== empire.id && hasInstall(p)))
    if (target) return { job: 'raid', planet: target.id }
  }

  const home = game.planets[empire.home]
  return { job: 'home', planet: (home.owner === empire.id ? home : repairAt ?? home).id }
}

// Fill in the computer's controls for this step.
export function thinkAI(game, empire, dt) {
  const s = fighterOf(game, empire.id)
  if (!s) return
  const ai = game.cfg.ai
  const b = s.brain
  b.wait = (b.wait ?? 0) - dt
  if (b.wait <= 0) {
    b.wait = ai.think * (0.8 + Math.random() * 0.4)
    Object.assign(b, { job: null, planet: null, ship: null }, choose(game, empire, s))
    b.jitter = (Math.random() - 0.5) * 2 * ai.aimError
  }
  s.fire = false
  s.launch = false

  const landAt = (p) => {
    if (s.landed?.planet === p.id) {
      s.turn = 0
      s.thrust = false
      return
    }
    if (s.landed) {
      s.turn = 0
      s.thrust = true
      return
    }
    const acc = seekAccel(game, s, p.x, p.y, {
      standoff: p.r + s.r * 0.8,
      arrive: game.cfg.landSpeed * 0.3,
      amax: THRUST * 0.3,
      avoidPlanet: p.id,
    })
    fly(s, acc.x, acc.y)
  }

  // Hang about `range` away from (target) and shoot at it when lined up.
  const attack = (target, range, aimAt = target) => {
    if (s.landed) {
      s.turn = 0
      s.thrust = true
      return
    }
    const acc = seekAccel(game, s, target.x, target.y, { standoff: range, vmax: 230, amax: 70, tvx: target.vx ?? 0, tvy: target.vy ?? 0 })
    const want = leadAngle(s.x, s.y, { ...aimAt, vx: (aimAt.vx ?? 0) - s.vx, vy: (aimAt.vy ?? 0) - s.vy }, BULLET_SPEED) + b.jitter
    const d = dist(s, aimAt)
    // Swap between getting into position and lining up a shot, holding each
    // for a moment so it doesn't dither between the two.
    const need = Math.hypot(acc.x, acc.y)
    if (b.aiming && (need > 150 || d > range + 300)) b.aiming = false
    else if (!b.aiming && need < 70 && d < range + 260) b.aiming = true
    if (!b.aiming) {
      fly(s, acc.x, acc.y)
    } else {
      face(s, want)
      s.thrust = false
    }
    const lined = Math.abs(angleDiff(want, s.a))
    if (lined < 0.14 && d < 440) s.fire = true
    // Now and then a rocket too, when close and lined up.
    if (s.ammo > 0 && lined < 0.1 && d < 400 && Math.random() < 0.03) s.launch = true
  }

  if (b.job === 'repair' || b.job === 'claim' || b.job === 'home') {
    const p = game.planets[b.planet]
    if (b.job === 'claim' && !claimable(p, empire.id)) b.wait = 0
    landAt(p)
  } else if (b.job === 'fight') {
    const foe = game.ships.find((o) => o.id === b.ship)
    if (!foe) {
      b.wait = 0
      return
    }
    attack(foe, foe.kind === 'fighter' ? 170 : 110)
  } else if (b.job === 'raid') {
    const p = game.planets[b.planet]
    if (!hasInstall(p) || p.owner === empire.id) {
      b.wait = 0
      return
    }
    // Aim at whichever building is nearest.
    const spots = ['base', 'colony', 'port'].filter((k) => p[k]).map((k) => (k === 'port' ? portPos(p) : sitePos(p, k)))
    const aim = spots.reduce((best, x) => (!best || dist(x, s) < dist(best, s) ? x : best), null)
    attack({ x: p.x, y: p.y, vx: 0, vy: 0 }, p.r + 340, { ...aim, vx: 0, vy: 0 })
  }
}
