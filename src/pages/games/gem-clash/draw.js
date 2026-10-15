// src/pages/games/gem-clash/draw.js
// Draws Gem Clash on a 2D canvas: your well on the left, and a side panel
// with the next two pairs and, against the computer, a small live view of
// its well. Gems are bevelled squares, breakers glowing orbs, and power
// gems one big jewel across all their squares. The art has its own
// palette so it looks the same in light and dark theme.

import { COLS, ROWS, ghost, pieceCells } from './engine'

const PALETTE = [
  { base: '#e53935', light: '#ff8a80', dark: '#8e0000' }, // red
  { base: '#43a047', light: '#a5d6a7', dark: '#1b5e20' }, // green
  { base: '#1e88e5', light: '#90caf9', dark: '#0d3c75' }, // blue
  { base: '#fdd835', light: '#fff59d', dark: '#a68b00' }, // yellow
]
const WELL_BG = '#141a33'
const WELL_GRID = 'rgba(255,255,255,0.05)'

export function layout(w, h, versus) {
  const gap = 8
  const sideMin = versus ? 96 : 70
  const cell = Math.max(8, Math.floor(Math.min((w - sideMin - gap - 8) / COLS, (h - 18) / ROWS)))
  const wellW = cell * COLS
  const wellH = cell * ROWS
  const x0 = Math.max(4, Math.floor((w - (wellW + gap + sideMin)) / 2))
  const y0 = Math.floor((h - wellH) / 2) + 6
  return { cell, x0, y0, wellW, wellH, sideX: x0 + wellW + gap, sideW: w - (x0 + wellW + gap) - x0 }
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

function block(ctx, x, y, w, h, colour, { junk = false, alpha = 1 } = {}) {
  const p = PALETTE[colour]
  const pad = Math.max(1, Math.min(w, h) * 0.04)
  const r = Math.min(w, h) * 0.18
  ctx.save()
  ctx.globalAlpha = alpha
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, p.light)
  g.addColorStop(0.45, p.base)
  g.addColorStop(1, p.dark)
  ctx.fillStyle = g
  roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, r)
  ctx.fill()
  // Bevel
  const inset = Math.min(w, h) * 0.16
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.05)
  roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, r * 0.6)
  ctx.stroke()
  if (junk) {
    // Junk is a plain gem with a little stud, so you can tell where it came from.
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function breaker(ctx, x, y, s, colour, now, alpha = 1) {
  const p = PALETTE[colour]
  const cx = x + s / 2
  const cy = y + s / 2
  const r = s * 0.42
  ctx.save()
  ctx.globalAlpha = alpha
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.25, p.light)
  g.addColorStop(1, p.dark)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  // A slowly turning sparkle, so breakers stand out.
  const a = now / 600
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = Math.max(1, s * 0.06)
  ctx.beginPath()
  for (let i = 0; i < 2; i++) {
    const ang = a + (i * Math.PI) / 2
    ctx.moveTo(cx + Math.cos(ang) * r * 0.55, cy + Math.sin(ang) * r * 0.55)
    ctx.lineTo(cx - Math.cos(ang) * r * 0.55, cy - Math.sin(ang) * r * 0.55)
  }
  ctx.stroke()
  ctx.restore()
}

function powerGem(ctx, x, y, w, h, colour) {
  block(ctx, x, y, w, h, colour)
  // Facets
  const p = PALETTE[colour]
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.025)
  const i = Math.min(w, h) * 0.16
  ctx.beginPath()
  ctx.moveTo(x + i, y + i)
  ctx.lineTo(x + w / 2, y + h * 0.42)
  ctx.lineTo(x + w - i, y + i)
  ctx.moveTo(x + w / 2, y + h * 0.42)
  ctx.lineTo(x + w / 2, y + h - i)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.moveTo(x + i, y + i)
  ctx.lineTo(x + w / 2, y + h * 0.42)
  ctx.lineTo(x + w - i, y + i)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = p.dark
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.03)
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, Math.min(w, h) * 0.12)
  ctx.stroke()
  ctx.restore()
}

function drawGem(ctx, gem, x, y, s, now, alpha) {
  if (gem.breaker) breaker(ctx, x, y, s, gem.colour, now, alpha)
  else block(ctx, x, y, s, s, gem.colour, { junk: gem.junk, alpha })
}

// One well at (x0, y0) with square size `cell`.
function drawWell(ctx, game, x0, y0, cell, now, { showGhost = true } = {}) {
  const w = cell * COLS
  const h = cell * ROWS
  ctx.save()
  ctx.fillStyle = WELL_BG
  roundRect(ctx, x0 - 3, y0 - 3, w + 6, h + 6, Math.max(4, cell * 0.25))
  ctx.fill()
  ctx.strokeStyle = WELL_GRID
  ctx.lineWidth = 1
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath()
    ctx.moveTo(x0 + c * cell, y0)
    ctx.lineTo(x0 + c * cell, y0 + h)
    ctx.stroke()
  }
  // The spawn column's top square, so you can see where danger starts.
  ctx.fillStyle = 'rgba(255,82,82,0.12)'
  ctx.fillRect(x0 + 2 * cell, y0, cell, cell)

  const flash = Math.floor(now / 70) % 2 === 0
  // Power gems first, drawn once across their squares.
  for (let n = 0; n < game.gems.length; n++) {
    const g = game.gems[n]
    const cells = []
    for (let r = g.r; r < g.r + g.h; r++) for (let c = g.c; c < g.c + g.w; c++) cells.push(r * COLS + c)
    const clearing = cells.some((i) => game.clearing.has(i))
    if (clearing && flash) continue
    powerGem(ctx, x0 + g.c * cell, y0 + g.r * cell, g.w * cell, g.h * cell, g.colour)
  }
  for (let i = 0; i < game.grid.length; i++) {
    const gem = game.grid[i]
    if (!gem || game.gemOf[i] >= 0) continue
    const r = Math.floor(i / COLS)
    const c = i % COLS
    if (game.clearing.has(i)) {
      if (flash) continue
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      roundRect(ctx, x0 + c * cell + 2, y0 + r * cell + 2, cell - 4, cell - 4, cell * 0.2)
      ctx.fill()
      ctx.restore()
      continue
    }
    drawGem(ctx, gem, x0 + c * cell, y0 + r * cell, cell, now, 1)
  }

  if (game.piece) {
    if (showGhost) {
      const gh = ghost(game)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = Math.max(1, cell * 0.06)
      for (const { r, c } of pieceCells(gh)) {
        if (r < 0) continue
        roundRect(ctx, x0 + c * cell + 3, y0 + r * cell + 3, cell - 6, cell - 6, cell * 0.2)
        ctx.stroke()
      }
    }
    for (const { r, c, gem } of pieceCells(game.piece)) {
      if (r < 0) continue
      drawGem(ctx, gem, x0 + c * cell, y0 + r * cell, cell, now, 1)
    }
  }

  // Junk on its way in: little grey bricks along the top.
  if (game.pendingIn > 0) {
    const n = Math.min(game.pendingIn, 24)
    const s = Math.max(4, cell * 0.3)
    for (let k = 0; k < n; k++) {
      const col = k % 12
      const row = Math.floor(k / 12)
      ctx.fillStyle = '#ff7043'
      ctx.fillRect(x0 + 2 + col * (s + 2), y0 - s - 4 - row * (s + 2), s, s)
    }
  }

  if (game.phase === 'over') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(x0, y0, w, h)
  }
  ctx.restore()
}

function label(ctx, text, x, y, size) {
  ctx.save()
  ctx.fillStyle = '#8f96b8'
  ctx.font = `700 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(text.toUpperCase(), x, y)
  ctx.restore()
}

function drawPops(ctx, pops, L, now) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of pops) {
    const t = (now - p.at) / 1000
    if (t >= 1) continue
    ctx.globalAlpha = 1 - t * t
    ctx.font = `800 ${Math.round(L.cell * (p.big ? 0.9 : 0.65))}px system-ui, sans-serif`
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.fillStyle = p.colour
    const x = L.x0 + L.wellW / 2
    const y = L.y0 + L.wellH * 0.4 - t * L.cell * 1.5
    ctx.strokeText(p.text, x, y)
    ctx.fillText(p.text, x, y)
  }
  ctx.restore()
}

export function drawGame(ctx, w, h, { game, rival, rivalName, pops, now, shake = 0 }) {
  ctx.clearRect(0, 0, w, h)
  const L = layout(w, h, !!rival)
  ctx.save()
  if (shake > 0) ctx.translate(Math.sin(now / 25) * shake, 0)
  drawWell(ctx, game, L.x0, L.y0, L.cell, now)
  ctx.restore()

  // Side panel: the next two pairs, stacked.
  const s = Math.min(L.cell * 0.7, (L.sideW - 8) / 2.4)
  const cx = L.sideX + L.sideW / 2
  label(ctx, 'Next', cx, L.y0, Math.max(9, s * 0.4))
  game.next.forEach((pair, i) => {
    const y = L.y0 + s * 0.8 + i * (s * 2.5)
    ctx.save()
    if (i > 0) ctx.globalAlpha = 0.6
    drawGem(ctx, pair[1], cx - s / 2, y, s, now, i > 0 ? 0.6 : 1)
    drawGem(ctx, pair[0], cx - s / 2, y + s, s, now, i > 0 ? 0.6 : 1)
    ctx.restore()
  })

  if (rival) {
    const mini = Math.max(5, Math.floor(Math.min((L.sideW - 6) / COLS, (L.wellH * 0.5) / ROWS)))
    const mx = L.sideX + (L.sideW - mini * COLS) / 2
    const my = L.y0 + L.wellH - mini * ROWS
    label(ctx, rivalName, cx, my - Math.max(10, mini * 1.1) - (rival.pendingIn > 0 ? mini * 0.6 : 0), Math.max(9, mini * 0.9))
    drawWell(ctx, rival, mx, my, mini, now, { showGhost: false })
  }

  drawPops(ctx, pops, L, now)
}

