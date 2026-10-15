// src/pages/games/gravity-well/draw.js
// Glowing wireframe ships over black space, like the 1995 original. The view
// follows your fighter; on top sit the shield, damage and speed bars, a
// radar of the whole sector (tap it to pick a planet to be pointed at) and
// arrows at the screen edge for things out of sight.

import { EMPIRES, PORT_ORBIT, PORT_R, SECTOR, MAX_SPEED, fighterOf, portPos, siteAngle, speedOf } from './engine'

// A few hundred background stars in three layers that scroll at different
// speeds, so flying feels like moving.
const TILE = 1200
const BACK = [0.12, 0.25, 0.45].map((depth, layer) => {
  let seed = 7 + layer * 101
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  return {
    depth,
    dots: Array.from({ length: 70 }, () => ({ x: rnd() * TILE, y: rnd() * TILE, r: 0.4 + rnd() * (0.5 + layer * 0.35), a: 0.25 + rnd() * 0.5 })),
  }
})

export function viewScale(w, h) {
  return Math.max(0.5, Math.min(1.4, Math.min(w, h) / 440))
}

function glowLine(ctx, color, width, draw) {
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.25
  ctx.lineWidth = width * 3.2
  ctx.beginPath()
  draw()
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineWidth = width
  ctx.beginPath()
  draw()
  ctx.stroke()
}

// ---------- world ----------

function drawStar(ctx, s, now) {
  const pulse = 1 + Math.sin(now / 400 + s.x) * 0.04
  const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4.5 * pulse)
  g.addColorStop(0, 'rgba(255,250,220,1)')
  g.addColorStop(0.18, 'rgba(255,230,120,0.95)')
  g.addColorStop(0.3, 'rgba(255,190,60,0.45)')
  g.addColorStop(1, 'rgba(255,150,40,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(s.x, s.y, s.r * 4.5 * pulse, 0, Math.PI * 2)
  ctx.fill()
  // A faint ring where the pull starts to get dangerous.
  ctx.strokeStyle = 'rgba(255,200,90,0.12)'
  ctx.setLineDash([6, 10])
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(s.x, s.y, s.r + 110, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}

// A little building standing on the surface at angle `a`, drawn upright
// in its own frame (y up is "outwards").
function onSurface(ctx, p, a, draw) {
  ctx.save()
  ctx.translate(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r)
  ctx.rotate(a + Math.PI / 2)
  draw()
  ctx.restore()
}

function drawPlanet(ctx, game, p, now, scale, waypoint) {
  const owner = p.owner != null ? game.empires[p.owner] : null
  const g = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r)
  g.addColorStop(0, '#2f8a48')
  g.addColorStop(1, '#0d3a1c')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
  ctx.fill()
  const flash = game.time - p.hitAt < 0.15
  glowLine(ctx, flash ? '#ffd27a' : '#5be37a', 1.6, () => ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2))

  if (owner) {
    const c = owner.color
    // Flag, a little round from the base.
    onSurface(ctx, p, p.site - 0.75, () => {
      ctx.strokeStyle = '#d8e2ff'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -16)
      ctx.stroke()
      ctx.fillStyle = c
      const wave = Math.sin(now / 200 + p.id) * 1.5
      ctx.beginPath()
      ctx.moveTo(0, -16)
      ctx.lineTo(10, -13 + wave)
      ctx.lineTo(0, -10)
      ctx.fill()
    })
    if (p.base) {
      onSurface(ctx, p, siteAngle(p, 'base'), () => {
        glowLine(ctx, c, 1.4, () => {
          ctx.rect(-6, -7, 12, 7)
          ctx.moveTo(-3, -7)
          ctx.arc(0, -7, 3, Math.PI, 0)
          ctx.moveTo(0, -10)
          ctx.lineTo(0, -14)
        })
      })
    }
    if (p.colony) {
      onSurface(ctx, p, siteAngle(p, 'colony'), () => {
        glowLine(ctx, c, 1.3, () => {
          for (const [x, r] of [
            [-6, 3.5],
            [1, 4.5],
            [8, 3],
          ]) {
            ctx.moveTo(x + r, 0)
            ctx.arc(x, 0, r, 0, Math.PI, true)
          }
        })
      })
    }
    if (p.port) {
      const at = portPos(p)
      ctx.strokeStyle = 'rgba(200,210,255,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, PORT_ORBIT, 0, Math.PI * 2)
      ctx.stroke()
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.rotate(now / 900)
      glowLine(ctx, c, 1.4, () => {
        ctx.moveTo(0, -PORT_R)
        ctx.lineTo(PORT_R, 0)
        ctx.lineTo(0, PORT_R)
        ctx.lineTo(-PORT_R, 0)
        ctx.closePath()
        ctx.moveTo(4, 0)
        ctx.arc(0, 0, 4, 0, Math.PI * 2)
      })
      ctx.restore()
    }
  }

  if (waypoint === p.id) {
    const r = p.r + 14 + Math.sin(now / 250) * 3
    ctx.strokeStyle = 'rgba(160,255,190,0.7)'
    ctx.lineWidth = 1.5 / scale
    ctx.setLineDash([5 / scale, 6 / scale])
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Name underneath, the same size on screen whatever the zoom.
  ctx.save()
  ctx.translate(p.x, p.y + p.r + (p.port ? 44 : 16))
  ctx.scale(1 / scale, 1 / scale)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = owner ? owner.color : 'rgba(170,230,185,0.75)'
  ctx.fillText(p.name, 0, 0)
  ctx.restore()
}

function drawFighter(ctx, game, s, color) {
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.a)
  if (s.thrust && !s.landed) {
    const len = 9 + Math.random() * 7
    ctx.strokeStyle = '#ffb347'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-6, -3)
    ctx.lineTo(-6 - len, 0)
    ctx.lineTo(-6, 3)
    ctx.stroke()
  }
  glowLine(ctx, color, 1.6, () => {
    ctx.moveTo(14, 0)
    ctx.lineTo(-9, -8)
    ctx.lineTo(-5, 0)
    ctx.lineTo(-9, 8)
    ctx.closePath()
    ctx.moveTo(4, 0)
    ctx.lineTo(-3, -3)
    ctx.lineTo(-3, 3)
    ctx.closePath()
  })
  ctx.restore()
  // A shimmer of shield when hit.
  const since = game.time - s.lastHit
  if (since >= 0 && since < 0.25) {
    ctx.strokeStyle = s.shield > 0 ? `rgba(150,220,255,${0.6 - since * 2})` : `rgba(255,150,80,${0.6 - since * 2})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r + 6, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawFreighter(ctx, s, color) {
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.a)
  glowLine(ctx, color, 1.3, () => {
    ctx.rect(-9, -5, 13, 10)
    ctx.moveTo(4, -3)
    ctx.lineTo(10, -3)
    ctx.lineTo(10, 3)
    ctx.lineTo(4, 3)
    ctx.moveTo(-9, 0)
    ctx.lineTo(4, 0)
  })
  ctx.restore()
}

// ---------- screen overlays ----------

function bar(ctx, x, y, w, h, frac, fill, back, label) {
  ctx.fillStyle = back
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.font = '600 9px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(label, x + 4, y + h / 2 + 0.5)
}

export function radarRect(w) {
  const size = Math.round(Math.max(84, Math.min(130, w * 0.27)))
  return { x: w - size - 8, y: 8, size }
}

function drawRadar(ctx, game, w, view, scale, h) {
  const { x, y, size } = radarRect(w)
  const k = size / SECTOR
  ctx.fillStyle = 'rgba(8,14,30,0.78)'
  ctx.fillRect(x, y, size, size)
  ctx.strokeStyle = 'rgba(120,160,255,0.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
  for (const s of game.stars) {
    ctx.fillStyle = '#ffd75a'
    ctx.beginPath()
    ctx.arc(x + s.x * k, y + s.y * k, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const p of game.planets) {
    const px = x + p.x * k
    const py = y + p.y * k
    if (p.owner != null) {
      ctx.strokeStyle = game.empires[p.owner].color
      ctx.lineWidth = 1.2
      ctx.strokeRect(px - 4, py - 4, 8, 8)
    }
    ctx.fillStyle = '#5be37a'
    ctx.beginPath()
    ctx.arc(px, py, 2, 0, Math.PI * 2)
    ctx.fill()
    if (view.waypoint === p.id) {
      ctx.strokeStyle = '#b8ffd0'
      ctx.beginPath()
      ctx.arc(px, py, 6.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  for (const s of game.ships) {
    ctx.fillStyle = s.kind === 'freighter' ? '#c9d2e8' : game.empires[s.owner].color
    const r = s.kind === 'fighter' ? 2 : 1.3
    ctx.fillRect(x + s.x * k - r, y + s.y * k - r, r * 2, r * 2)
  }
  // What's on screen now.
  const vw = (w / scale) * k
  const vh = (h / scale) * k
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeRect(x + view.cam.x * k - vw / 2, y + view.cam.y * k - vh / 2, vw, vh)
}

// An arrow on the edge of the screen pointing at (tx, ty) when it's off it.
function edgeArrow(ctx, w, h, top, cam, scale, tx, ty, color, label) {
  const dx = (tx - cam.x) * scale
  const dy = (ty - cam.y) * scale
  if (Math.abs(dx) < w / 2 - 10 && Math.abs(dy) < h / 2 - 10) return
  // The arrow sits on the edge of a box that keeps clear of the bars and
  // radar at the top and the hint at the bottom.
  const left = 18
  const right = w - 18
  const bottom = h - 48
  const cx = w / 2
  const cy = (top + bottom) / 2
  const t = Math.min((right - cx) / Math.abs(dx || 1e-6), (bottom - cy) / Math.abs(dy || 1e-6))
  const ax = Math.max(left, Math.min(right, cx + dx * t))
  const ay = Math.max(top, Math.min(bottom, cy + dy * t))
  const a = Math.atan2(dy, dx)
  ctx.save()
  ctx.translate(ax, ay)
  ctx.rotate(a)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.moveTo(11, 0)
  ctx.lineTo(-6, -7)
  ctx.lineTo(-3, 0)
  ctx.lineTo(-6, 7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  if (label) {
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    const lx = Math.max(30, Math.min(w - 30, ax - Math.cos(a) * 26))
    ctx.fillText(label, lx, ay - Math.sin(a) * 18)
  }
}

// ---------- the whole frame ----------

// view: { cam: {x, y}, waypoint, toasts: [{ text, at, color }], hint }
export function drawGame(ctx, w, h, game, view, now) {
  const scale = viewScale(w, h)
  const cam = view.cam

  ctx.fillStyle = '#04060d'
  ctx.fillRect(0, 0, w, h)
  for (const layer of BACK) {
    const ox = (((-cam.x * layer.depth) % TILE) + TILE) % TILE
    const oy = (((-cam.y * layer.depth) % TILE) + TILE) % TILE
    for (const d of layer.dots) {
      let x = (d.x + ox) % TILE
      let y = (d.y + oy) % TILE
      for (let tx = x; tx < w; tx += TILE) {
        for (let ty = y; ty < h; ty += TILE) {
          ctx.fillStyle = `rgba(220,230,255,${d.a})`
          ctx.fillRect(tx, ty, d.r * 2, d.r * 2)
        }
      }
    }
  }

  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(scale, scale)
  ctx.translate(-cam.x, -cam.y)

  // The edge of the sector.
  ctx.strokeStyle = 'rgba(120,160,255,0.25)'
  ctx.lineWidth = 2 / scale
  ctx.setLineDash([14 / scale, 12 / scale])
  ctx.strokeRect(0, 0, SECTOR, SECTOR)
  ctx.setLineDash([])

  const t = now
  for (const s of game.stars) drawStar(ctx, s, t)
  for (const p of game.planets) drawPlanet(ctx, game, p, t, scale, view.waypoint)

  for (const b of game.bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1
    ctx.strokeStyle = b.owner != null ? game.empires[b.owner].color : '#fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - (b.vx / sp) * 7, b.y - (b.vy / sp) * 7)
    ctx.stroke()
  }

  for (const s of game.ships) {
    const color = game.empires[s.owner].color
    if (s.kind === 'fighter') drawFighter(ctx, game, s, color)
    else drawFreighter(ctx, s, color)
  }

  for (const q of game.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, q.life / 0.6))
    ctx.fillStyle = q.color
    ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // ---------- overlays ----------
  const me = fighterOf(game, 0)
  const radar = radarRect(w)
  const top = radar.y + radar.size + 16
  if (view.waypoint != null) {
    const p = game.planets[view.waypoint]
    edgeArrow(ctx, w, h, top, cam, scale, p.x, p.y, '#9dffbb', p.name)
  }
  // The nearest enemy fighter, if it's off screen.
  if (me) {
    let foe = null
    for (const s of game.ships) {
      if (s.owner === 0 || s.kind !== 'fighter') continue
      if (!foe || Math.hypot(s.x - me.x, s.y - me.y) < Math.hypot(foe.x - me.x, foe.y - me.y)) foe = s
    }
    if (foe && Math.hypot(foe.x - me.x, foe.y - me.y) < 1100) edgeArrow(ctx, w, h, top, cam, scale, foe.x, foe.y, EMPIRES[foe.owner].color)
  }

  // Bars, top left.
  const bw = Math.min(130, w * 0.32)
  if (me) {
    bar(ctx, 8, 8, bw, 12, me.shield / me.shieldMax, '#59c8ff', 'rgba(20,50,110,0.85)', 'Shield')
    bar(ctx, 8, 24, bw, 12, me.hull / me.hullMax, '#46d36b', 'rgba(150,30,30,0.85)', 'Hull')
    const sp = speedOf(me)
    const slow = sp <= game.cfg.landSpeed
    bar(ctx, 8, 40, bw, 12, sp / MAX_SPEED, '#5ff3ff', slow ? 'rgba(30,80,200,0.9)' : 'rgba(40,40,55,0.85)', slow ? 'Speed: slow enough to land' : 'Speed')
  }

  drawRadar(ctx, game, w, view, scale, h)

  // Messages, newest at the bottom, fading out.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 13px system-ui, sans-serif'
  const live = view.toasts.filter((m) => now - m.at < 3200).slice(-3)
  live.forEach((m, i) => {
    const age = now - m.at
    ctx.globalAlpha = age > 2600 ? Math.max(0, 1 - (age - 2600) / 600) : 1
    const y = top + 4 + i * 24
    ctx.font = `600 ${ctx.measureText(m.text).width > w - 40 ? 11 : 13}px system-ui, sans-serif`
    const tw = ctx.measureText(m.text).width + 18
    ctx.fillStyle = 'rgba(5,10,25,0.7)'
    ctx.fillRect(w / 2 - tw / 2, y - 10, tw, 20)
    ctx.fillStyle = m.color ?? '#e8eeff'
    ctx.fillText(m.text, w / 2, y)
  })
  ctx.globalAlpha = 1

  if (view.hint) {
    ctx.font = '600 13px system-ui, sans-serif'
    const tw = ctx.measureText(view.hint).width + 20
    ctx.fillStyle = 'rgba(5,10,25,0.75)'
    ctx.fillRect(w / 2 - tw / 2, h - 34, tw, 24)
    ctx.fillStyle = '#e8eeff'
    ctx.fillText(view.hint, w / 2, h - 22)
  }
}
