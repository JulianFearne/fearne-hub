// src/pages/games/snake/draw.js
// Draws a Snake game on a 2D canvas: a chequered lawn, stone walls, fruit,
// and the snake as one smooth, rounded body that glides between cells
// (each segment is drawn part way from where it was to where it is now).
// The canvas art has its own palette so it looks the same in light and
// dark theme.

import { progress } from './engine'

export const SKINS = {
  green: { label: 'Green', body: '#43a047', dark: '#1b5e20', light: '#a5d6a7' },
  blue: { label: 'Blue', body: '#1e88e5', dark: '#0d47a1', light: '#90caf9' },
  pink: { label: 'Pink', body: '#ec407a', dark: '#880e4f', light: '#f8bbd0' },
  orange: { label: 'Orange', body: '#fb8c00', dark: '#bf360c', light: '#ffcc80' },
  purple: { label: 'Purple', body: '#8e24aa', dark: '#4a148c', light: '#e1bee7' },
}

// Where the board sits inside a canvas of w x h CSS pixels.
export function layout(game, w, h) {
  const cell = Math.floor(Math.min(w / game.cols, h / game.rows))
  const bw = cell * game.cols
  const bh = cell * game.rows
  return { cell, x0: Math.floor((w - bw) / 2), y0: Math.floor((h - bh) / 2), bw, bh }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawLawn(ctx, game, L) {
  ctx.save()
  roundRect(ctx, L.x0, L.y0, L.bw, L.bh, Math.max(6, L.cell * 0.4))
  ctx.clip()
  ctx.fillStyle = '#8bc34a'
  ctx.fillRect(L.x0, L.y0, L.bw, L.bh)
  ctx.fillStyle = '#7cb342'
  for (let x = 0; x < game.cols; x++) {
    for (let y = 0; y < game.rows; y++) {
      if ((x + y) % 2) ctx.fillRect(L.x0 + x * L.cell, L.y0 + y * L.cell, L.cell, L.cell)
    }
  }
  ctx.restore()
  // Solid walls get a fence-like border; wrapping boards a soft dashed edge
  // to show you can go through.
  ctx.save()
  roundRect(ctx, L.x0 + 1, L.y0 + 1, L.bw - 2, L.bh - 2, Math.max(6, L.cell * 0.4))
  if (game.wraps) {
    ctx.setLineDash([L.cell * 0.4, L.cell * 0.3])
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
  } else {
    ctx.strokeStyle = '#5d4037'
    ctx.lineWidth = 3
  }
  ctx.stroke()
  ctx.restore()
}

function drawWalls(ctx, game, L) {
  for (const k of game.walls) {
    const [x, y] = k.split(',').map(Number)
    const px = L.x0 + x * L.cell
    const py = L.y0 + y * L.cell
    const pad = Math.max(1, L.cell * 0.06)
    ctx.fillStyle = '#6d6259'
    roundRect(ctx, px + pad, py + pad, L.cell - pad * 2, L.cell - pad * 2, L.cell * 0.18)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(px + pad * 2, py + pad * 2, L.cell - pad * 4, L.cell * 0.18)
  }
}

function star(ctx, cx, cy, outer, inner) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.closePath()
}

function drawFruit(ctx, fruit, L, now) {
  const cx = L.x0 + (fruit.x + 0.5) * L.cell
  const cy = L.y0 + (fruit.y + 0.5) * L.cell
  // Pops in, then bobs gently.
  if (fruit.born == null) fruit.born = now
  const age = now - fruit.born
  const pop = Math.min(1, age / 180)
  const r = L.cell * 0.36 * (0.6 + 0.4 * pop) * (1 + 0.04 * Math.sin(now / 220))
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + r * 0.9, r * 0.8, r * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()

  if (fruit.kind === 'star') {
    ctx.fillStyle = '#ffca28'
    ctx.strokeStyle = '#ff8f00'
    ctx.lineWidth = Math.max(1, L.cell * 0.06)
    star(ctx, cx, cy, r * 1.15, r * 0.5)
    ctx.fill()
    ctx.stroke()
  } else if (fruit.kind === 'cherry') {
    ctx.strokeStyle = '#33691e'
    ctx.lineWidth = Math.max(1, L.cell * 0.06)
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.45, cy + r * 0.2)
    ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.8, cx + r * 0.2, cy - r * 0.95)
    ctx.moveTo(cx + r * 0.45, cy + r * 0.25)
    ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.5, cx + r * 0.2, cy - r * 0.95)
    ctx.stroke()
    ctx.fillStyle = '#c62828'
    for (const dx of [-0.45, 0.45]) {
      ctx.beginPath()
      ctx.arc(cx + dx * r, cy + r * 0.4, r * 0.48, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.arc(cx - r * 0.6, cy + r * 0.25, r * 0.12, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const orange = fruit.kind === 'orange'
    ctx.fillStyle = orange ? '#fb8c00' : '#e53935'
    ctx.beginPath()
    ctx.arc(cx, cy + r * 0.08, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.beginPath()
    ctx.arc(cx - r * 0.35, cy - r * 0.25, r * 0.22, 0, Math.PI * 2)
    ctx.fill()
    // Stalk and leaf
    ctx.strokeStyle = '#5d4037'
    ctx.lineWidth = Math.max(1, L.cell * 0.06)
    ctx.beginPath()
    ctx.moveTo(cx, cy - r * 0.75)
    ctx.lineTo(cx + r * 0.1, cy - r * 1.15)
    ctx.stroke()
    ctx.fillStyle = '#43a047'
    ctx.beginPath()
    ctx.ellipse(cx + r * 0.38, cy - r * 1.0, r * 0.32, r * 0.15, -0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// Segment positions in cell units, part way between the last move and this one.
function bodyPoints(game) {
  const t = progress(game)
  const pts = []
  for (let i = 0; i < game.snake.length; i++) {
    const now = game.snake[i]
    const was = game.prev[i] ?? game.prev[game.prev.length - 1] ?? now
    const jump = Math.abs(now.x - was.x) + Math.abs(now.y - was.y) > 1 // wrapped round an edge
    pts.push(jump ? { x: now.x, y: now.y } : { x: was.x + (now.x - was.x) * t, y: was.y + (now.y - was.y) * t })
  }
  return pts
}

// Splits the body where it wraps across an edge, so no line is drawn
// across the board.
function runs(pts) {
  const out = [[pts[0]]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (Math.abs(a.x - b.x) > 1.01 || Math.abs(a.y - b.y) > 1.01) out.push([])
    out[out.length - 1].push(b)
  }
  return out
}

function strokeRuns(ctx, list, L, width, colour) {
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  for (const run of list) {
    ctx.beginPath()
    run.forEach((p, i) => {
      const x = L.x0 + (p.x + 0.5) * L.cell
      const y = L.y0 + (p.y + 0.5) * L.cell
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    // A lone point still needs a dot.
    if (run.length === 1) ctx.lineTo(L.x0 + (run[0].x + 0.5) * L.cell + 0.01, L.y0 + (run[0].y + 0.5) * L.cell)
    ctx.stroke()
  }
}

const EYE_DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

function drawSnake(ctx, game, L, skin, now) {
  const pts = bodyPoints(game)
  const list = runs(pts)
  ctx.save()
  if (game.flash > 0 && Math.floor(now / 90) % 2) ctx.globalAlpha = 0.45
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  strokeRuns(ctx, list, L, L.cell * 0.82, skin.dark)
  strokeRuns(ctx, list, L, L.cell * 0.66, skin.body)
  ctx.globalAlpha *= 0.35
  strokeRuns(ctx, list, L, L.cell * 0.2, skin.light)
  ctx.globalAlpha = game.flash > 0 && Math.floor(now / 90) % 2 ? 0.45 : 1

  // Spots down the back
  ctx.fillStyle = skin.dark
  for (let i = 2; i < pts.length; i += 2) {
    const p = pts[i]
    ctx.beginPath()
    ctx.arc(L.x0 + (p.x + 0.5) * L.cell, L.y0 + (p.y + 0.5) * L.cell, L.cell * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }

  // Head
  const h = pts[0]
  const hx = L.x0 + (h.x + 0.5) * L.cell
  const hy = L.y0 + (h.y + 0.5) * L.cell
  const facing = game.queue[0] ?? game.dir
  const [dx, dy] = EYE_DIR[facing]
  ctx.fillStyle = skin.dark
  ctx.beginPath()
  ctx.arc(hx, hy, L.cell * 0.47, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = skin.body
  ctx.beginPath()
  ctx.arc(hx, hy, L.cell * 0.4, 0, Math.PI * 2)
  ctx.fill()

  // Tongue flicks out now and then.
  if (game.moving && game.status === 'playing' && Math.floor(now / 160) % 9 === 0) {
    ctx.strokeStyle = '#d32f2f'
    ctx.lineWidth = Math.max(1, L.cell * 0.07)
    const tx = hx + dx * L.cell * 0.45
    const ty = hy + dy * L.cell * 0.45
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx + dx * L.cell * 0.25, ty + dy * L.cell * 0.25)
    ctx.lineTo(tx + dx * L.cell * 0.35 - dy * L.cell * 0.08, ty + dy * L.cell * 0.35 + dx * L.cell * 0.08)
    ctx.moveTo(tx + dx * L.cell * 0.25, ty + dy * L.cell * 0.25)
    ctx.lineTo(tx + dx * L.cell * 0.35 + dy * L.cell * 0.08, ty + dy * L.cell * 0.35 - dx * L.cell * 0.08)
    ctx.stroke()
  }

  const dead = game.status === 'over' && game.overReason !== 'time'
  for (const side of [-1, 1]) {
    const ex = hx + dx * L.cell * 0.12 + -dy * side * L.cell * 0.19
    const ey = hy + dy * L.cell * 0.12 + dx * side * L.cell * 0.19
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex, ey, L.cell * 0.13, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#212121'
    ctx.fillStyle = '#212121'
    if (dead) {
      // Crossed-out eyes
      const s = L.cell * 0.08
      ctx.lineWidth = Math.max(1, L.cell * 0.05)
      ctx.beginPath()
      ctx.moveTo(ex - s, ey - s)
      ctx.lineTo(ex + s, ey + s)
      ctx.moveTo(ex + s, ey - s)
      ctx.lineTo(ex - s, ey + s)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(ex + dx * L.cell * 0.04, ey + dy * L.cell * 0.04, L.cell * 0.07, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawPops(ctx, pops, L, now) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(L.cell * 0.7)}px system-ui, sans-serif`
  for (const p of pops) {
    const t = (now - p.at) / 700
    if (t >= 1) continue
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = p.colour
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 3
    const x = L.x0 + (p.x + 0.5) * L.cell
    const y = L.y0 + (p.y + 0.5) * L.cell - t * L.cell * 1.2
    ctx.strokeText(p.text, x, y)
    ctx.fillText(p.text, x, y)
  }
  ctx.restore()
}

function drawHint(ctx, L, text) {
  ctx.save()
  ctx.font = `600 ${Math.max(14, Math.round(L.cell * 0.6))}px system-ui, sans-serif`
  const w = ctx.measureText(text).width + 28
  const h = Math.max(30, L.cell * 1.2)
  const x = L.x0 + (L.bw - w) / 2
  const y = L.y0 + L.bh * 0.32
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2 + 1)
  ctx.restore()
}

export function drawGame(ctx, game, w, h, { skin, pops, now, hint }) {
  ctx.clearRect(0, 0, w, h)
  const L = layout(game, w, h)
  drawLawn(ctx, game, L)
  drawWalls(ctx, game, L)
  for (const f of game.fruits) drawFruit(ctx, f, L, now)
  drawSnake(ctx, game, L, SKINS[skin] ?? SKINS.green, now)
  drawPops(ctx, pops, L, now)
  if (hint) drawHint(ctx, L, hint)
}
