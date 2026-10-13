// src/pages/games/frogger/draw.js
// Paints a Frogger game onto a canvas. Everything is drawn in cell units (the
// world is 11 x 13 cells) and scaled to fit, letterboxed in the middle. The
// art keeps one fixed palette in light and dark theme: it is a little picture
// of a riverside, so it reads the same either way.
//
// The still parts (grass, road, hedge, water base) are painted once into an
// offscreen canvas per size, so each frame only draws what moves.

import {
  BAY_X,
  COLS,
  DEATH_MS,
  HOME_ROW,
  ROWS,
  START_ROW,
  VERGE_ROW,
  hopProgress,
} from './engine'

const C = {
  grass: '#5fae49',
  grassDark: '#4f9a3d',
  grassLight: '#79c45f',
  verge: '#68b44f',
  road: '#3b3e45',
  roadSpeck: '#4a4e57',
  roadDark: '#32353b',
  kerb: '#c9ccd2',
  laneLine: '#e9e6da',
  water: '#2f74b5',
  waterDeep: '#255f99',
  ripple: 'rgba(255, 255, 255, 0.16)',
  hedge: '#2e6a35',
  hedgeLight: '#3d8344',
  hedgeDark: '#21522a',
  pad: '#4fa64a',
  padDark: '#3a8a3a',
  log: '#8b5a2b',
  logLight: '#a56d37',
  logDark: '#673f1c',
  logEnd: '#d3a165',
  logRing: '#a9773f',
  shell: '#3f8d47',
  shellDark: '#2a6531',
  shellLine: '#6db86a',
  turtleSkin: '#9bd06f',
  frog: '#57c43f',
  frogDark: '#3b9a2c',
  frogBelly: '#a7e57f',
  eye: '#ffffff',
  pupil: '#1c1c1c',
  cheek: '#f29aa6',
  car: ['#f2c94c', '#ffffff', '#e8463b', '#f08a24', '#5aa9e6'],
  glass: '#2a3644',
  wheel: '#141414',
  light: '#fff2a8',
}

// Small seeded random so the textures look the same every time they're built.
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

// ---------- the still background ----------

function paintGrass(ctx, row, base, rnd) {
  ctx.fillStyle = base
  ctx.fillRect(0, row, COLS, 1)
  for (let i = 0; i < 70; i++) {
    const x = rnd() * COLS
    const y = row + 0.08 + rnd() * 0.84
    ctx.fillStyle = rnd() < 0.5 ? C.grassDark : C.grassLight
    ctx.fillRect(x, y, 0.035, 0.1)
  }
}

function paintBackground(s) {
  const bg = document.createElement('canvas')
  bg.width = Math.ceil(COLS * s)
  bg.height = Math.ceil(ROWS * s)
  const ctx = bg.getContext('2d')
  ctx.scale(s, s)
  const rnd = seeded(7)

  // Start strip and the middle verge, with a few flowers on the verge.
  paintGrass(ctx, START_ROW, C.grass, rnd)
  paintGrass(ctx, VERGE_ROW, C.verge, rnd)
  for (let i = 0; i < 9; i++) {
    const x = 0.4 + rnd() * (COLS - 0.8)
    const y = VERGE_ROW + 0.2 + rnd() * 0.6
    ellipse(ctx, x, y, 0.05, 0.05, rnd() < 0.5 ? '#ffffff' : '#ffd84d')
  }

  // Road: speckled tarmac, dashed lines between lanes, kerbs at both edges.
  ctx.fillStyle = C.road
  ctx.fillRect(0, VERGE_ROW + 1, COLS, START_ROW - VERGE_ROW - 1)
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rnd() < 0.6 ? C.roadSpeck : C.roadDark
    const r = 0.012 + rnd() * 0.02
    ctx.fillRect(rnd() * COLS, VERGE_ROW + 1 + rnd() * 5, r, r)
  }
  ctx.fillStyle = C.laneLine
  for (let row = VERGE_ROW + 2; row < START_ROW; row++) {
    for (let x = 0.15; x < COLS; x += 0.9) ctx.fillRect(x, row - 0.025, 0.45, 0.05)
  }
  ctx.fillStyle = C.kerb
  ctx.fillRect(0, VERGE_ROW + 1, COLS, 0.07)
  ctx.fillRect(0, START_ROW - 0.07, COLS, 0.07)

  // River base, darker towards the far bank.
  const grad = ctx.createLinearGradient(0, 1, 0, VERGE_ROW)
  grad.addColorStop(0, C.waterDeep)
  grad.addColorStop(1, C.water)
  ctx.fillStyle = grad
  ctx.fillRect(0, 1, COLS, VERGE_ROW - 1)

  // The far bank: a hedge with five water bays cut into it.
  ctx.fillStyle = C.hedge
  ctx.fillRect(0, HOME_ROW, COLS, 1)
  for (let i = 0; i < 60; i++) {
    const x = rnd() * COLS
    const y = 0.15 + rnd() * 0.7
    ellipse(ctx, x, y, 0.12 + rnd() * 0.1, 0.1 + rnd() * 0.08, rnd() < 0.5 ? C.hedgeLight : C.hedgeDark)
  }
  for (const bx of BAY_X) {
    ctx.fillStyle = C.waterDeep
    roundRect(ctx, bx - 0.55, 0.12, 1.1, 0.95, 0.25)
    ctx.fill()
    // Lily pad with its little notch.
    ctx.beginPath()
    ctx.moveTo(bx, 0.6)
    ctx.arc(bx, 0.6, 0.36, -Math.PI / 2 + 0.35, Math.PI * 1.5 - 0.05)
    ctx.closePath()
    ctx.fillStyle = C.pad
    ctx.fill()
    ctx.strokeStyle = C.padDark
    ctx.lineWidth = 0.03
    ctx.stroke()
  }
  return bg
}

// ---------- moving things ----------

function drawRipples(ctx, time) {
  ctx.strokeStyle = C.ripple
  ctx.lineWidth = 0.035
  ctx.lineCap = 'round'
  for (let row = 1; row < VERGE_ROW; row++) {
    const drift = ((time / 1000) * (row % 2 ? 0.25 : -0.2)) % COLS
    for (let i = 0; i < 6; i++) {
      const base = (i * 1.93 + row * 0.71) % COLS
      const x = (((base + drift) % COLS) + COLS) % COLS
      const y = row + 0.2 + ((i * 0.37 + row * 0.13) % 0.6)
      const wob = Math.sin(time / 600 + i + row) * 0.04
      ctx.beginPath()
      ctx.moveTo(x - 0.22, y + wob)
      ctx.quadraticCurveTo(x, y - 0.06 + wob, x + 0.22, y + wob)
      ctx.stroke()
    }
  }
}

function drawLog(ctx, o, row) {
  const y = row + 0.14
  const h = 0.72
  ctx.fillStyle = C.log
  roundRect(ctx, o.x, y, o.len, h, 0.3)
  ctx.fill()
  ctx.fillStyle = C.logLight
  ctx.fillRect(o.x + 0.2, y + 0.08, o.len - 0.4, 0.12)
  // Bark streaks at fixed spots along the log.
  ctx.strokeStyle = C.logDark
  ctx.lineWidth = 0.035
  for (let i = 0.6; i < o.len - 0.4; i += 0.7) {
    const yy = y + 0.3 + ((i * 7) % 3) * 0.1
    ctx.beginPath()
    ctx.moveTo(o.x + i, yy)
    ctx.lineTo(o.x + i + 0.35, yy)
    ctx.stroke()
  }
  // Cut ends with growth rings.
  for (const ex of [o.x + 0.15, o.x + o.len - 0.15]) {
    ellipse(ctx, ex, y + h / 2, 0.15, h / 2 - 0.02, C.logEnd)
    ctx.strokeStyle = C.logRing
    ctx.lineWidth = 0.025
    ctx.beginPath()
    ctx.ellipse(ex, y + h / 2, 0.08, 0.18, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawTurtles(ctx, o, row, dir, time) {
  const depth = o.depth
  const n = Math.round(o.len)
  for (let k = 0; k < n; k++) {
    const cx = o.x + k + 0.5
    const cy = row + 0.5
    if (depth >= 0.95) {
      // Fully under: just a ring of bubbles where it went down.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.arc(cx, cy, 0.25 + 0.05 * Math.sin(time / 200 + k), 0, Math.PI * 2)
      ctx.stroke()
      continue
    }
    ctx.globalAlpha = 1 - depth * 0.75
    const paddle = Math.sin(time / 180 + k) * 0.04
    // Flippers and head, pointing the way the group swims.
    for (const [fx, fy] of [
      [-0.24, -0.27],
      [0.24, -0.27],
      [-0.24, 0.27],
      [0.24, 0.27],
    ]) {
      ellipse(ctx, cx + fx + paddle * Math.sign(fy), cy + fy, 0.11, 0.07, C.turtleSkin)
    }
    ellipse(ctx, cx + dir * 0.38, cy, 0.12, 0.1, C.turtleSkin)
    ellipse(ctx, cx + dir * 0.43, cy - 0.04, 0.025, 0.025, C.pupil)
    // Shell with a simple plate pattern.
    ellipse(ctx, cx, cy, 0.33, 0.3, C.shellDark)
    ellipse(ctx, cx, cy, 0.29, 0.26, C.shell)
    ctx.strokeStyle = C.shellLine
    ctx.lineWidth = 0.03
    ctx.beginPath()
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2
      const px = cx + Math.cos(ang) * 0.12
      const py = cy + Math.sin(ang) * 0.11
      if (a === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
      ctx.moveTo(px, py)
      ctx.lineTo(cx + Math.cos(ang) * 0.27, cy + Math.sin(ang) * 0.24)
      ctx.moveTo(px, py)
    }
    ctx.stroke()
    // Sinking: wash water over the shell so the warning is easy to see.
    if (depth > 0) {
      ctx.globalAlpha = depth * 0.6
      ellipse(ctx, cx, cy, 0.34, 0.31, C.water)
    }
    ctx.globalAlpha = 1
  }
}

// Vehicles are drawn as if driving right, then mirrored for the other way.
function drawVehicle(ctx, lane, o) {
  const row = lane.row
  ctx.save()
  const cx = o.x + o.len / 2
  ctx.translate(cx, row + 0.5)
  if (lane.dir < 0) ctx.scale(-1, 1)
  const L = o.len
  const half = L / 2
  const body = C.car[lane.colour % C.car.length]

  const wheels = (xs, hh) => {
    ctx.fillStyle = C.wheel
    for (const wx of xs) {
      ctx.fillRect(wx - 0.11, -hh - 0.05, 0.22, 0.1)
      ctx.fillRect(wx - 0.11, hh - 0.05, 0.22, 0.1)
    }
  }

  if (lane.kind === 'lorry') {
    const hh = 0.36
    wheels([-half + 0.35, -half + 0.75, half - 1.1, half - 0.35], hh)
    // Trailer with ridges, then the cab at the front.
    ctx.fillStyle = '#d9dde3'
    roundRect(ctx, -half + 0.05, -hh, L - 0.85, hh * 2, 0.06)
    ctx.fill()
    ctx.strokeStyle = '#aab0b8'
    ctx.lineWidth = 0.03
    for (let x = -half + 0.3; x < half - 0.9; x += 0.3) {
      ctx.beginPath()
      ctx.moveTo(x, -hh + 0.05)
      ctx.lineTo(x, hh - 0.05)
      ctx.stroke()
    }
    ctx.fillStyle = body
    roundRect(ctx, half - 0.75, -hh + 0.02, 0.72, hh * 2 - 0.04, 0.12)
    ctx.fill()
    ctx.fillStyle = C.glass
    ctx.fillRect(half - 0.28, -hh + 0.08, 0.13, hh * 2 - 0.16)
    ctx.fillStyle = C.light
    ctx.fillRect(half - 0.06, -hh + 0.05, 0.05, 0.12)
    ctx.fillRect(half - 0.06, hh - 0.17, 0.05, 0.12)
  } else if (lane.kind === 'van') {
    const hh = 0.33
    wheels([-half + 0.35, half - 0.35], hh)
    ctx.fillStyle = body
    roundRect(ctx, -half + 0.03, -hh, L - 0.06, hh * 2, 0.12)
    ctx.fill()
    ctx.fillStyle = '#5aa9e6'
    ctx.fillRect(-half + 0.15, -0.05, L - 0.7, 0.1)
    ctx.fillStyle = C.glass
    roundRect(ctx, half - 0.45, -hh + 0.06, 0.2, hh * 2 - 0.12, 0.05)
    ctx.fill()
    ctx.fillStyle = C.light
    ctx.fillRect(half - 0.07, -hh + 0.04, 0.05, 0.1)
    ctx.fillRect(half - 0.07, hh - 0.14, 0.05, 0.1)
  } else {
    const sports = lane.kind === 'sports'
    const hh = sports ? 0.28 : 0.31
    wheels([-half + 0.25, half - 0.25], hh)
    ctx.fillStyle = body
    roundRect(ctx, -half + 0.03, -hh, L - 0.06, hh * 2, sports ? 0.2 : 0.14)
    ctx.fill()
    if (sports) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-half + 0.05, -0.06, L - 0.1, 0.04)
      ctx.fillRect(-half + 0.05, 0.02, L - 0.1, 0.04)
      ctx.fillStyle = '#8c1d16'
      ctx.fillRect(-half + 0.02, -hh, 0.08, hh * 2)
    }
    ctx.fillStyle = C.glass
    roundRect(ctx, -0.08, -hh + 0.06, 0.24, hh * 2 - 0.12, 0.05)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    roundRect(ctx, -half + 0.12, -hh + 0.07, 0.2, hh * 2 - 0.14, 0.05)
    ctx.fill()
    ctx.fillStyle = C.light
    ctx.fillRect(half - 0.07, -hh + 0.04, 0.05, 0.09)
    ctx.fillRect(half - 0.07, hh - 0.13, 0.05, 0.09)
  }
  ctx.restore()
}

const FACE_ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }

// The frog, drawn facing up in its own space. stretch (0..1) is how far
// through the leap it is: legs kick out and the body lengthens.
function drawFrogShape(ctx, stretch = 0, opts = {}) {
  const body = opts.body ?? C.frog
  const dark = opts.dark ?? C.frogDark
  const leg = 0.1 + stretch * 0.08
  // Back legs.
  ctx.fillStyle = dark
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(sx * 0.24, 0.2 + leg * 0.6, 0.09, 0.15 + leg * 0.3, sx * (0.5 - stretch * 0.4), 0, Math.PI * 2)
    ctx.fill()
    ellipse(ctx, sx * (0.28 - stretch * 0.08), 0.3 + leg, 0.08, 0.05, dark)
  }
  // Front legs.
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(sx * 0.24, -0.14, 0.06, 0.12, sx * -0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  // Body, belly and spots.
  ellipse(ctx, 0, 0.02, 0.27, 0.32, body)
  ellipse(ctx, 0, 0.08, 0.15, 0.17, C.frogBelly)
  ellipse(ctx, -0.12, 0.14, 0.035, 0.035, dark)
  ellipse(ctx, 0.1, 0.2, 0.03, 0.03, dark)
  // Eyes up front.
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * 0.13, -0.22, 0.11, 0.11, body)
    ellipse(ctx, sx * 0.13, -0.23, 0.08, 0.08, C.eye)
    if (opts.xEyes) {
      ctx.strokeStyle = C.pupil
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.moveTo(sx * 0.13 - 0.04, -0.27)
      ctx.lineTo(sx * 0.13 + 0.04, -0.19)
      ctx.moveTo(sx * 0.13 + 0.04, -0.27)
      ctx.lineTo(sx * 0.13 - 0.04, -0.19)
      ctx.stroke()
    } else {
      ellipse(ctx, sx * 0.13, -0.26, 0.04, 0.04, C.pupil)
      ellipse(ctx, sx * 0.13 + 0.015, -0.275, 0.013, 0.013, C.eye)
    }
  }
  ellipse(ctx, -0.15, -0.06, 0.04, 0.025, C.cheek)
  ellipse(ctx, 0.15, -0.06, 0.04, 0.025, C.cheek)
}

function drawFrog(ctx, game) {
  const f = game.frog
  const p = hopProgress(f)
  const y = f.hopping ? f.fromRow + (f.toRow - f.fromRow) * p : f.row
  const k = Math.sin(Math.PI * p)
  // Shadow stays on the ground while the frog lifts.
  ellipse(ctx, f.x, y + 0.6, 0.26, 0.08, 'rgba(0,0,0,0.22)')
  ctx.save()
  ctx.translate(f.x, y + 0.5 - k * 0.12)
  ctx.rotate(FACE_ANGLE[f.face] ?? 0)
  // Squash on take-off and landing, stretch mid-air.
  const along = f.hopping ? 1 + 0.28 * k - 0.12 * (1 - k) : 1
  const across = f.hopping ? 1 - 0.14 * k + 0.08 * (1 - k) : 1
  ctx.scale(across, along)
  drawFrogShape(ctx, k)
  ctx.restore()
}

function drawSittingFrog(ctx, x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(0.72, 0.72)
  ctx.rotate(Math.PI)
  drawFrogShape(ctx, 0)
  ctx.restore()
}

function drawFly(ctx, x, y, time) {
  const flap = Math.abs(Math.sin(time / 40)) * 0.08
  ctx.fillStyle = 'rgba(230, 245, 255, 0.85)'
  ctx.beginPath()
  ctx.ellipse(x - 0.08, y - 0.06, 0.1, 0.05 + flap, -0.5, 0, Math.PI * 2)
  ctx.ellipse(x + 0.08, y - 0.06, 0.1, 0.05 + flap, 0.5, 0, Math.PI * 2)
  ctx.fill()
  ellipse(ctx, x, y, 0.06, 0.1, '#1d1d24')
  ellipse(ctx, x, y - 0.1, 0.045, 0.04, '#b0352b')
}

function drawDeath(ctx, d) {
  const p = 1 - d.t / DEATH_MS
  const cx = d.x
  const cy = d.row + 0.5
  if (d.kind === 'splash') {
    ctx.strokeStyle = `rgba(255,255,255,${1 - p})`
    ctx.lineWidth = 0.05
    for (const r of [0.2 + p * 0.7, 0.08 + p * 0.45]) {
      ctx.beginPath()
      ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    // Droplets thrown up and out.
    ctx.fillStyle = `rgba(210,235,255,${1 - p})`
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const dist = 0.15 + p * 0.5
      const lift = Math.sin(p * Math.PI) * 0.25
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.6 - lift, 0.05 * (1 - p) + 0.015, 0, Math.PI * 2)
      ctx.fill()
    }
    // The frog's eyes sink last.
    if (p < 0.45) {
      ctx.globalAlpha = 1 - p / 0.45
      ellipse(ctx, cx - 0.12, cy - 0.05, 0.07, 0.07, C.eye)
      ellipse(ctx, cx + 0.12, cy - 0.05, 0.07, 0.07, C.eye)
      ellipse(ctx, cx - 0.12, cy - 0.05, 0.03, 0.03, C.pupil)
      ellipse(ctx, cx + 0.12, cy - 0.05, 0.03, 0.03, C.pupil)
      ctx.globalAlpha = 1
    }
    return
  }
  // Squash: a flat dizzy frog with stars, fading out at the end.
  ctx.save()
  ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1
  ctx.translate(cx, cy)
  ctx.scale(1.35, 0.45)
  drawFrogShape(ctx, 0.6, { body: '#7fae5e', dark: '#5d8a44', xEyes: true })
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1
  ctx.fillStyle = '#ffd84d'
  for (let i = 0; i < 3; i++) {
    const a = p * 6 + (i / 3) * Math.PI * 2
    const sx = cx + Math.cos(a) * 0.35
    const sy = cy - 0.3 + Math.sin(a) * 0.1
    ctx.beginPath()
    for (let j = 0; j < 5; j++) {
      const ang = (j / 5) * Math.PI * 2 - Math.PI / 2
      ctx.lineTo(sx + Math.cos(ang) * 0.07, sy + Math.sin(ang) * 0.07)
      const ang2 = ang + Math.PI / 5
      ctx.lineTo(sx + Math.cos(ang2) * 0.03, sy + Math.sin(ang2) * 0.03)
    }
    ctx.fill()
  }
  ctx.restore()
}

function drawText(ctx, text, x, y, size, fill) {
  ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = size * 0.18
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

// The world keeps its 11 x 13 shape, so a tall phone leaves room above and
// below. Rather than plain bars, the hedge carries on above and the grass
// below, painted with the still background into one cached canvas.
function paintScene(W, H, s, ox, oy) {
  const scene = document.createElement('canvas')
  scene.width = W
  scene.height = H
  const ctx = scene.getContext('2d')
  const rnd = seeded(11)
  ctx.fillStyle = C.hedgeDark
  ctx.fillRect(0, 0, W, H)
  const top = oy + s * 0.5
  for (let i = 0; i < (W * top) / (s * s) * 4; i++) {
    const r = s * (0.15 + rnd() * 0.2)
    ellipse(ctx, rnd() * W, rnd() * top, r, r * 0.85, rnd() < 0.5 ? C.hedge : C.hedgeLight)
  }
  const bottom = oy + (ROWS - 0.5) * s
  ctx.fillStyle = C.grass
  ctx.fillRect(0, bottom, W, H - bottom)
  for (let i = 0; i < ((H - bottom) * W) / (s * s) * 25; i++) {
    ctx.fillStyle = rnd() < 0.5 ? C.grassDark : C.grassLight
    ctx.fillRect(rnd() * W, bottom + rnd() * (H - bottom), s * 0.035, s * 0.1)
  }
  ctx.drawImage(paintBackground(s), Math.round(ox), Math.round(oy))
  return scene
}

let cache = { key: '', scene: null }

export function drawGame(canvas, game) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  if (!W || !H) return
  const s = Math.min(W / COLS, H / ROWS)
  const ox = (W - COLS * s) / 2
  const oy = (H - ROWS * s) / 2

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const key = `${W}x${H}`
  if (cache.key !== key) cache = { key, scene: paintScene(W, H, s, ox, oy) }
  ctx.drawImage(cache.scene, 0, 0)

  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, COLS * s, ROWS * s)
  ctx.clip()
  ctx.setTransform(s, 0, 0, s, ox, oy)

  drawRipples(ctx, game.time)

  for (const lane of game.lanes) {
    for (const o of lane.objects) {
      if (o.x > COLS || o.x + o.len < 0) continue
      if (lane.kind === 'log') drawLog(ctx, o, lane.row)
      else if (lane.kind === 'turtle') drawTurtles(ctx, o, lane.row, lane.dir, game.time)
      else drawVehicle(ctx, lane, o)
    }
  }

  // Home bays: sitting frogs, the bonus fly, and a points pop.
  game.bays.forEach((filled, i) => {
    if (filled) drawSittingFrog(ctx, BAY_X[i], 0.62)
  })
  if (game.fly) drawFly(ctx, BAY_X[game.fly.bay], 0.55 + Math.sin(game.time / 300) * 0.04, game.time)
  if (game.homeFlash) {
    const p = 1 - game.homeFlash.t / 600
    ctx.globalAlpha = 1 - p * 0.6
    drawText(ctx, `+${game.homeFlash.points}`, BAY_X[game.homeFlash.bay], 1.2 - p * 0.5, 0.5, '#fff6b0')
    ctx.globalAlpha = 1
  }

  if (game.dying) drawDeath(ctx, game.dying)
  else if (game.status !== 'over') drawFrog(ctx, game)

  if (game.banner) {
    const p = game.banner.t
    ctx.globalAlpha = Math.min(1, p / 300)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    roundRect(ctx, COLS / 2 - 2.6, VERGE_ROW - 0.05, 5.2, 1.1, 0.5)
    ctx.fill()
    drawText(ctx, game.banner.text, COLS / 2, VERGE_ROW + 0.5, 0.7, '#ffffff')
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
