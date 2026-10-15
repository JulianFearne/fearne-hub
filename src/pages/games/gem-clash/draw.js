// src/pages/games/gem-clash/draw.js
// Draws Gem Clash on a 2D canvas: a starry backdrop, your well on the left,
// and a side panel with the next two pairs and, against the computer, a
// small live view of its well.
//
// Gems are cut jewels (a bright table in the middle, four shaded facets
// round it), breakers glowing orbs with a turning sparkle, and power gems
// one big jewel with a shine that sweeps across. Everything that falls
// glides into place rather than jumping, and smashed gems burst into
// sparks. The art has its own palette, so it looks the same in light and
// dark theme.
//
// The page keeps one `fx` object per well (createFx) across frames; it
// remembers where each gem was last drawn and the sparks in flight.

import { COLS, ROWS, ghost, pieceCells, stackHeight } from './engine'

const PALETTE = [
  { light: '#ffc2c8', mid: '#ff5a6e', base: '#e01e3c', dark: '#7a0019', glow: '255,70,95' }, // ruby
  { light: '#c4f8d6', mid: '#46dd84', base: '#119c4f', dark: '#08502a', glow: '60,230,130' }, // emerald
  { light: '#c6e6ff', mid: '#55aaff', base: '#1764e0', dark: '#0a2d74', glow: '80,160,255' }, // sapphire
  { light: '#fff7c2', mid: '#ffe04a', base: '#f2b200', dark: '#875a00', glow: '255,215,60' }, // topaz
]
const CLEAR_MS = 420

export function createFx() {
  return { pos: new Map(), particles: [], last: 0 }
}

export function layout(w, h, versus) {
  const gap = 10
  const sideMin = versus ? 96 : 72
  const cell = Math.max(8, Math.floor(Math.min((w - sideMin - gap - 16) / COLS, (h - 26) / ROWS)))
  const wellW = cell * COLS
  const wellH = cell * ROWS
  const x0 = Math.max(8, Math.floor((w - (wellW + gap + sideMin)) / 2))
  const y0 = Math.floor((h - wellH) / 2) + 6
  return { cell, x0, y0, wellW, wellH, sideX: x0 + wellW + gap, sideW: w - (x0 + wellW + gap) - 8 }
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

function poly(ctx, pts, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

// ---------- the pieces ----------

// A cut jewel filling x, y, w, h.
function jewel(ctx, x, y, w, h, colour, { junk = false, alpha = 1, glow = 0 } = {}) {
  const p = PALETTE[colour]
  const m = Math.min(w, h)
  const pad = Math.max(1, m * 0.05)
  const ox = x + pad
  const oy = y + pad
  const ow = w - pad * 2
  const oh = h - pad * 2
  const t = m * 0.24 // facet depth
  const ix = ox + t
  const iy = oy + t
  const iw = ow - t * 2
  const ih = oh - t * 2
  ctx.save()
  ctx.globalAlpha = alpha
  if (glow > 0) {
    ctx.shadowColor = `rgba(${p.glow},${0.9 * glow})`
    ctx.shadowBlur = m * 0.6 * glow
  }
  ctx.fillStyle = p.dark
  roundRect(ctx, ox, oy, ow, oh, m * 0.14)
  ctx.fill()
  ctx.shadowBlur = 0
  poly(ctx, [[ox + 1, oy + 1], [ox + ow - 1, oy + 1], [ix + iw, iy], [ix, iy]], p.light) // top
  poly(ctx, [[ox + 1, oy + 1], [ix, iy], [ix, iy + ih], [ox + 1, oy + oh - 1]], p.mid) // left
  poly(ctx, [[ox + ow - 1, oy + 1], [ox + ow - 1, oy + oh - 1], [ix + iw, iy + ih], [ix + iw, iy]], p.base) // right
  poly(ctx, [[ox + 1, oy + oh - 1], [ix, iy + ih], [ix + iw, iy + ih], [ox + ow - 1, oy + oh - 1]], p.dark) // bottom
  const table = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih)
  table.addColorStop(0, p.light)
  table.addColorStop(0.5, p.mid)
  table.addColorStop(1, p.base)
  ctx.fillStyle = table
  ctx.fillRect(ix, iy, iw, ih)
  // A glint on the table
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.ellipse(ix + iw * 0.3, iy + ih * 0.28, iw * 0.18, ih * 0.09, -0.6, 0, Math.PI * 2)
  ctx.fill()
  if (junk) {
    // Junk is clouded over and bolted at the corners.
    ctx.fillStyle = 'rgba(20,20,40,0.45)'
    roundRect(ctx, ox, oy, ow, oh, m * 0.14)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    for (const [bx, by] of [
      [ox + t * 0.5, oy + t * 0.5],
      [ox + ow - t * 0.5, oy + t * 0.5],
      [ox + t * 0.5, oy + oh - t * 0.5],
      [ox + ow - t * 0.5, oy + oh - t * 0.5],
    ]) {
      ctx.beginPath()
      ctx.arc(bx, by, Math.max(1, m * 0.045), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function sparkle(ctx, cx, cy, r, angle) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = angle + (i * Math.PI) / 4
    const rr = i % 2 ? r * 0.28 : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

function breaker(ctx, x, y, s, colour, now, alpha = 1, glow = 0) {
  const p = PALETTE[colour]
  const cx = x + s / 2
  const cy = y + s / 2
  const r = s * 0.4
  ctx.save()
  ctx.globalAlpha = alpha
  // Pulsing halo
  const pulse = 0.55 + 0.45 * Math.sin(now / 260 + colour)
  const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.45)
  halo.addColorStop(0, `rgba(${p.glow},${Math.min(1, 0.45 * pulse + glow * 0.5)})`)
  halo.addColorStop(1, `rgba(${p.glow},0)`)
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2)
  ctx.fill()
  // Orb
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.22, p.light)
  g.addColorStop(0.6, p.mid)
  g.addColorStop(1, p.dark)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = Math.max(1, s * 0.04)
  ctx.stroke()
  // Turning sparkle
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  sparkle(ctx, cx, cy, r * 0.62, now / 700)
  ctx.restore()
}

function powerGem(ctx, x, y, w, h, colour, now, glow) {
  jewel(ctx, x, y, w, h, colour, { glow })
  // A shine sweeps across every few seconds.
  const t = ((now / 2600 + colour * 0.17) % 1) * 2 - 0.5
  ctx.save()
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, Math.min(w, h) * 0.12)
  ctx.clip()
  const bx = x + t * (w + h)
  const g = ctx.createLinearGradient(bx - h * 0.3, y, bx + h * 0.3, y + h)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  ctx.restore()
  // Gold edge so power gems read as special.
  ctx.save()
  ctx.strokeStyle = 'rgba(255,225,140,0.85)'
  ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.035)
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.min(w, h) * 0.13)
  ctx.stroke()
  ctx.restore()
}

function drawGem(ctx, gem, x, y, s, now, opts = {}) {
  if (gem.breaker) breaker(ctx, x, y, s, gem.colour, now, opts.alpha ?? 1, opts.glow ?? 0)
  else jewel(ctx, x, y, s, s, gem.colour, { junk: gem.junk, ...opts })
}

// ---------- smooth falling ----------

// Where to draw a gem this frame (in rows): glides down towards its square.
function animRow(fx, gem, target, dt) {
  let y = fx.pos.get(gem.id)
  if (y == null) y = gem.junk ? -1.5 - Math.random() * 1.5 : target
  if (y < target) y = Math.min(target, y + dt * (0.012 + (target - y) * 0.004))
  else y = target
  fx.pos.set(gem.id, y)
  return y
}

// ---------- the backdrop ----------

let STARS = null
function stars() {
  if (STARS) return STARS
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  STARS = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.1, p: rnd() * 6 }))
  return STARS
}

function backdrop(ctx, w, h, now) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#22185a')
  g.addColorStop(0.55, '#121038')
  g.addColorStop(1, '#070a1e')
  ctx.fillStyle = g
  roundRect(ctx, 0, 0, w, h, 14)
  ctx.fill()
  for (const s of stars()) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now / 900 + s.p)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ---------- a well ----------

function drawWell(ctx, game, fx, x0, y0, cell, now, dt, { showGhost = true, mini = false } = {}) {
  const w = cell * COLS
  const h = cell * ROWS
  const danger = game.phase !== 'over' && stackHeight(game.grid) > ROWS - 4
  ctx.save()

  // Frame with a soft glow (red and pulsing when the stack is near the top).
  const pulse = 0.5 + 0.5 * Math.sin(now / 180)
  ctx.shadowColor = danger ? `rgba(255,60,60,${0.5 + 0.4 * pulse})` : 'rgba(130,120,255,0.55)'
  ctx.shadowBlur = mini ? 6 : 18
  ctx.fillStyle = '#0a0f2a'
  roundRect(ctx, x0 - 4, y0 - 4, w + 8, h + 8, Math.max(5, cell * 0.28))
  ctx.fill()
  ctx.shadowBlur = 0
  const inner = ctx.createLinearGradient(0, y0, 0, y0 + h)
  inner.addColorStop(0, '#141b46')
  inner.addColorStop(1, '#0b1030')
  ctx.fillStyle = inner
  roundRect(ctx, x0, y0, w, h, Math.max(3, cell * 0.2))
  ctx.fill()
  for (let c = 0; c < COLS; c += 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    ctx.fillRect(x0 + c * cell, y0, cell, h)
  }
  ctx.strokeStyle = danger ? `rgba(255,90,90,${0.6 + 0.4 * pulse})` : 'rgba(160,150,255,0.45)'
  ctx.lineWidth = mini ? 1 : 2
  roundRect(ctx, x0 - 2, y0 - 2, w + 4, h + 4, Math.max(4, cell * 0.25))
  ctx.stroke()

  // Where new pairs come in.
  if (!mini) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    const cx = x0 + 2.5 * cell
    ctx.beginPath()
    ctx.moveTo(cx - cell * 0.18, y0 + cell * 0.12)
    ctx.lineTo(cx + cell * 0.18, y0 + cell * 0.12)
    ctx.lineTo(cx, y0 + cell * 0.32)
    ctx.closePath()
    ctx.fill()
  }

  ctx.save()
  roundRect(ctx, x0, y0, w, h, Math.max(3, cell * 0.2))
  ctx.clip()

  const seen = new Set()
  const clearT = game.phase === 'clear' ? Math.min(1, game.timer / CLEAR_MS) : 0

  // Power gems, each drawn once across its squares.
  for (let n = 0; n < game.gems.length; n++) {
    const g = game.gems[n]
    const topIdx = g.r * COLS + g.c
    const top = game.grid[topIdx]
    let off = 0
    if (top) {
      off = animRow(fx, top, g.r, dt) - g.r
      seen.add(top.id)
    }
    for (let r = g.r; r < g.r + g.h; r++) {
      for (let c = g.c; c < g.c + g.w; c++) {
        const gem = game.grid[r * COLS + c]
        if (gem) {
          fx.pos.set(gem.id, r + off)
          seen.add(gem.id)
        }
      }
    }
    const clearing = game.clearing.has(topIdx)
    ctx.save()
    if (clearing) {
      const s = 1 + clearT * 0.12
      const cx = x0 + (g.c + g.w / 2) * cell
      const cy = y0 + (g.r + off + g.h / 2) * cell
      ctx.translate(cx, cy)
      ctx.scale(s, s)
      ctx.translate(-cx, -cy)
      ctx.globalAlpha = 1 - clearT * 0.6
    }
    powerGem(ctx, x0 + g.c * cell, y0 + (g.r + off) * cell, g.w * cell, g.h * cell, g.colour, now, clearing ? 1 : 0)
    ctx.restore()
  }

  for (let i = 0; i < game.grid.length; i++) {
    const gem = game.grid[i]
    if (!gem || game.gemOf[i] >= 0) continue
    const r = Math.floor(i / COLS)
    const c = i % COLS
    const y = animRow(fx, gem, r, dt)
    seen.add(gem.id)
    if (game.clearing.has(i)) {
      // Swell and glow before they burst.
      const s = cell * (1 + clearT * 0.15)
      const d = (s - cell) / 2
      drawGem(ctx, gem, x0 + c * cell - d, y0 + y * cell - d, s, now, { glow: 1, alpha: 1 - clearT * 0.6 })
    } else {
      drawGem(ctx, gem, x0 + c * cell, y0 + y * cell, cell, now)
    }
  }

  if (game.piece) {
    // Glide between rows rather than stepping.
    const every = game.softDrop ? Math.min(45, game.fallMs) : game.fallMs
    const gh = ghost(game)
    const slide = gh && gh.r > game.piece.r ? Math.min(1, game.timer / every) : 0
    if (showGhost && gh) {
      for (const { r, c, gem } of pieceCells(gh)) {
        if (r < 0) continue
        ctx.save()
        ctx.setLineDash([cell * 0.14, cell * 0.1])
        ctx.strokeStyle = `rgba(${PALETTE[gem.colour].glow},0.55)`
        ctx.lineWidth = Math.max(1, cell * 0.06)
        roundRect(ctx, x0 + c * cell + cell * 0.12, y0 + r * cell + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.16)
        ctx.stroke()
        ctx.restore()
      }
    }
    for (const { r, c, gem } of pieceCells(game.piece)) {
      const y = r + slide
      fx.pos.set(gem.id, y)
      seen.add(gem.id)
      drawGem(ctx, gem, x0 + c * cell, y0 + y * cell, cell, now)
    }
  }
  ctx.restore()

  // Forget gems that are gone.
  if (fx.pos.size > seen.size + 20) for (const id of fx.pos.keys()) if (!seen.has(id)) fx.pos.delete(id)

  // Junk on its way in: little bolted bricks above the well.
  if (game.pendingIn > 0) {
    const n = Math.min(game.pendingIn, 24)
    const s = Math.max(4, Math.min(cell * 0.32, (w - 4) / 12 - 2))
    for (let k = 0; k < n; k++) {
      const col = k % 12
      const row = Math.floor(k / 12)
      const bx = x0 + 2 + col * (s + 2)
      const by = y0 - s - 8 - row * (s + 2)
      ctx.fillStyle = '#ff7a45'
      roundRect(ctx, bx, by, s, s, s * 0.25)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(bx + s * 0.2, by + s * 0.2, s * 0.25, s * 0.25)
    }
  }

  if (game.phase === 'over') {
    ctx.fillStyle = 'rgba(5,5,20,0.55)'
    roundRect(ctx, x0, y0, w, h, Math.max(3, cell * 0.2))
    ctx.fill()
  }
  ctx.restore()
}

// ---------- effects ----------

// Sparks from every gem that's being smashed. Call when a smash starts.
export function burst(fx, game, w, h, versus, now) {
  const L = layout(w, h, versus)
  for (const i of game.clearing) {
    const gem = game.grid[i]
    if (!gem) continue
    const cx = L.x0 + ((i % COLS) + 0.5) * L.cell
    const cy = L.y0 + (Math.floor(i / COLS) + 0.5) * L.cell
    for (let k = 0; k < 7; k++) {
      const a = Math.random() * Math.PI * 2
      const v = (0.08 + Math.random() * 0.22) * L.cell
      fx.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - L.cell * 0.12,
        size: L.cell * (0.08 + Math.random() * 0.12),
        colour: PALETTE[gem.colour],
        born: now + CLEAR_MS * 0.8,
        life: 600 + Math.random() * 400,
      })
    }
  }
}

function drawParticles(ctx, fx, now, dt, cell) {
  fx.particles = fx.particles.filter((p) => now - p.born < p.life)
  for (const p of fx.particles) {
    if (now < p.born) continue
    const k = dt / 16
    p.x += p.vx * k
    p.y += p.vy * k
    p.vy += cell * 0.012 * k
    const t = (now - p.born) / p.life
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = t < 0.3 ? '#fff' : p.colour.mid
    sparkle(ctx, p.x, p.y, p.size * (1.2 - t * 0.5), t * 4)
  }
  ctx.globalAlpha = 1
}

function drawPops(ctx, pops, L, now) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of pops) {
    const t = (now - p.at) / 1100
    if (t >= 1) continue
    const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15) * 0.3)
    ctx.globalAlpha = 1 - t * t
    const size = Math.round(L.cell * (p.big ? 0.95 : 0.7) * scale)
    ctx.font = `900 ${size}px system-ui, sans-serif`
    const x = L.x0 + L.wellW / 2
    const y = L.y0 + L.wellH * 0.38 - t * L.cell * 1.4
    ctx.shadowColor = p.big ? 'rgba(255,200,40,0.9)' : 'rgba(150,140,255,0.9)'
    ctx.shadowBlur = 14
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(20,10,50,0.85)'
    ctx.strokeText(p.text, x, y)
    ctx.shadowBlur = 0
    ctx.fillStyle = p.colour
    ctx.fillText(p.text, x, y)
  }
  ctx.restore()
}

function panelLabel(ctx, text, x, y, size) {
  ctx.save()
  ctx.fillStyle = '#b7b2ff'
  ctx.font = `800 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(text.toUpperCase(), x, y)
  ctx.restore()
}

export function drawGame(ctx, w, h, { game, rival, rivalName, fx, rivalFx, pops, now, shake = 0 }) {
  const dt = fx.last ? Math.min(100, now - fx.last) : 16
  fx.last = now
  ctx.clearRect(0, 0, w, h)
  backdrop(ctx, w, h, now)
  const L = layout(w, h, !!rival)

  ctx.save()
  if (shake > 0) ctx.translate(Math.sin(now / 22) * shake, 0)
  drawWell(ctx, game, fx, L.x0, L.y0, L.cell, now, dt)
  ctx.restore()

  // Side panel: the next two pairs in a little glass box.
  const s = Math.min(L.cell * 0.72, (L.sideW - 12) / 1.3)
  const cx = L.sideX + L.sideW / 2
  const boxH = s * 4.6 + 30
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.strokeStyle = 'rgba(180,170,255,0.3)'
  roundRect(ctx, cx - s * 0.75 - 4, L.y0 - 4, s * 1.5 + 8, boxH, 10)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  panelLabel(ctx, 'Next', cx, L.y0 + 2, Math.max(9, s * 0.36))
  game.next.forEach((pair, i) => {
    const sz = i === 0 ? s : s * 0.8
    const y = L.y0 + 20 + i * (s * 2.4)
    const x = cx - sz / 2
    drawGem(ctx, pair[1], x, y, sz, now, { alpha: i ? 0.7 : 1 })
    drawGem(ctx, pair[0], x, y + sz, sz, now, { alpha: i ? 0.7 : 1 })
  })

  if (rival && rivalFx) {
    const mini = Math.max(5, Math.floor(Math.min((L.sideW - 10) / COLS, (L.wellH - boxH - 44) / ROWS)))
    const mx = L.sideX + (L.sideW - mini * COLS) / 2
    const my = L.y0 + L.wellH - mini * ROWS
    const ly = my - Math.max(16, mini * 1.5) - (rival.pendingIn > 0 ? mini * 1.4 : 0)
    panelLabel(ctx, rivalName, cx, ly, Math.max(9, mini * 0.95))
    drawWell(ctx, rival, rivalFx, mx, my, mini, now, dt, { showGhost: false, mini: true })
  }

  drawParticles(ctx, fx, now, dt, L.cell)
  drawPops(ctx, pops, L, now)
}
