// src/pages/games/car-dodge/draw.js
// Paints a Car Dodge game onto a canvas. The world is a fixed size, scaled to
// fit and centred; the grass, road and trees run on past the world's edges so
// the letterbox never shows as bars. The art uses its own fixed palette (a
// sunny road reads the same in light and dark theme).
//
// Everything that scrolls (lane dashes, mowing stripes, trees) is worked out
// from game.scroll, so the engine doesn't need to track scenery at all.

import { LANE_W, LANES, PLAYER_H, PLAYER_W, PLAYER_Y, ROAD_W, ROAD_X, WORLD_H, WORLD_W } from './engine'

const GRASS = '#6cbf5a'
const GRASS_DARK = '#61b04f'
const VERGE = '#8fd07a'
const ROAD = '#4b4f58'
const ROAD_EDGE = '#3f424a'
const LINE = '#f4f4f0'
const PLAYER = '#e2336b'
const SHADOW = 'rgba(0, 0, 0, 0.22)'

function shade(hex, amount) {
  // amount < 0 darkens, > 0 lightens.
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `rgb(${r}, ${g}, ${b})`
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// Small stable hash so each tree keeps its spot as it scrolls past.
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

// First y at or above `top` of a pattern that repeats every `period` and has
// been pushed down by `scroll`.
function firstAt(top, scroll, period) {
  const offset = scroll % period
  return offset + Math.floor((top - offset) / period) * period
}

function drawScenery(ctx, game, left, right, top, bottom) {
  const scroll = game.scroll

  // Mowing stripes across the whole canvas.
  ctx.fillStyle = GRASS
  ctx.fillRect(left, top, right - left, bottom - top)
  const stripe = 60
  ctx.fillStyle = GRASS_DARK
  for (let y = firstAt(top, scroll, stripe * 2); y < bottom; y += stripe * 2) {
    ctx.fillRect(left, y, right - left, stripe)
  }

  // Pale verge strip and kerb on each side of the road.
  ctx.fillStyle = VERGE
  ctx.fillRect(ROAD_X - 12, top, 12, bottom - top)
  ctx.fillRect(ROAD_X + ROAD_W, top, 12, bottom - top)

  // Road.
  ctx.fillStyle = ROAD_EDGE
  ctx.fillRect(ROAD_X, top, ROAD_W, bottom - top)
  ctx.fillStyle = ROAD
  ctx.fillRect(ROAD_X + 4, top, ROAD_W - 8, bottom - top)

  // Solid edge lines, dashed lane lines.
  ctx.fillStyle = LINE
  ctx.fillRect(ROAD_X + 7, top, 3, bottom - top)
  ctx.fillRect(ROAD_X + ROAD_W - 10, top, 3, bottom - top)
  const dash = 34
  const gap = 30
  const period = dash + gap
  for (let l = 1; l < LANES; l++) {
    const x = ROAD_X + LANE_W * l - 2
    for (let y = firstAt(top, scroll, period); y < bottom; y += period) {
      roundRect(ctx, x, y, 4, dash, 2)
      ctx.fill()
    }
  }

  // Trees on both verges, on a grid of rows that scroll with the road.
  const spacing = 64
  const firstRow = Math.floor((top - scroll) / spacing) - 2
  const lastRow = Math.ceil((bottom - scroll) / spacing) + 1
  for (let row = firstRow; row <= lastRow; row++) {
    const baseY = row * spacing + scroll
    for (const side of [-1, 1]) {
      const h = hash(row * 2 + (side > 0 ? 1 : 0))
      if (h < 0.3) continue
      const reach = side < 0 ? ROAD_X - 14 - left : right - (ROAD_X + ROAD_W + 14)
      const r = 12 + hash(row * 7 + side * 3) * 8
      const usable = Math.max(0, reach - r * 2)
      const dx = r + hash(row * 13 + side) * Math.min(usable, 60)
      const x = side < 0 ? ROAD_X - 14 - dx : ROAD_X + ROAD_W + 14 + dx
      const y = baseY + hash(row * 5 + side) * spacing * 0.6
      drawTree(ctx, x, y, r, h)
    }
  }
}

function drawTree(ctx, x, y, r, h) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.beginPath()
  ctx.arc(x + 4, y + 5, r, 0, Math.PI * 2)
  ctx.fill()
  const leaf = h > 0.8 ? '#2f8a46' : h > 0.55 ? '#3c9d4f' : '#4aa957'
  ctx.fillStyle = leaf
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = shade(leaf, 0.22)
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2)
  ctx.fill()
  if (h > 0.9) {
    // The odd tree has apples, because why not.
    ctx.fillStyle = '#e8505b'
    for (let i = 0; i < 3; i++) {
      const a = h * 40 + i * 2.1
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function wheels(ctx, x, y, w, h, positions) {
  ctx.fillStyle = '#1d1f24'
  for (const p of positions) {
    roundRect(ctx, x - 3, y + h * p - 7, 6, 14, 3)
    ctx.fill()
    roundRect(ctx, x + w - 3, y + h * p - 7, 6, 14, 3)
    ctx.fill()
  }
}

function lights(ctx, x, y, w, h) {
  // Headlights at the front (top), tail lights at the back.
  ctx.fillStyle = '#fff6c9'
  roundRect(ctx, x + 4, y + 1, 9, 4, 2)
  ctx.fill()
  roundRect(ctx, x + w - 13, y + 1, 9, 4, 2)
  ctx.fill()
  ctx.fillStyle = '#ff3b3b'
  roundRect(ctx, x + 4, y + h - 4, 8, 3, 1.5)
  ctx.fill()
  roundRect(ctx, x + w - 12, y + h - 4, 8, 3, 1.5)
  ctx.fill()
}

function drawCarBody(ctx, x, y, w, h, colour, stripes = false) {
  ctx.fillStyle = SHADOW
  roundRect(ctx, x + 3, y + 5, w, h, 12)
  ctx.fill()
  wheels(ctx, x, y, w, h, [0.22, 0.76])
  ctx.fillStyle = colour
  ctx.strokeStyle = shade(colour, -0.35)
  ctx.lineWidth = 1.5
  roundRect(ctx, x, y, w, h, 12)
  ctx.fill()
  ctx.stroke()
  if (stripes) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillRect(x + w / 2 - 6, y + 2, 4, h - 4)
    ctx.fillRect(x + w / 2 + 2, y + 2, 4, h - 4)
  }
  // Bonnet sheen.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
  roundRect(ctx, x + 5, y + 4, w - 10, h * 0.2, 6)
  ctx.fill()
  // Windscreen, roof, rear window.
  ctx.fillStyle = '#1f3446'
  roundRect(ctx, x + 5, y + h * 0.27, w - 10, h * 0.17, [7, 7, 3, 3])
  ctx.fill()
  ctx.fillStyle = 'rgba(160, 210, 255, 0.35)'
  roundRect(ctx, x + 8, y + h * 0.29, w * 0.3, h * 0.05, 2)
  ctx.fill()
  ctx.fillStyle = shade(colour, -0.12)
  roundRect(ctx, x + 6, y + h * 0.45, w - 12, h * 0.28, 5)
  ctx.fill()
  if (stripes) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillRect(x + w / 2 - 6, y + h * 0.45, 4, h * 0.28)
    ctx.fillRect(x + w / 2 + 2, y + h * 0.45, 4, h * 0.28)
  }
  ctx.fillStyle = '#1f3446'
  roundRect(ctx, x + 7, y + h * 0.74, w - 14, h * 0.12, [3, 3, 6, 6])
  ctx.fill()
  lights(ctx, x, y, w, h)
}

function drawVan(ctx, x, y, w, h, colour) {
  ctx.fillStyle = SHADOW
  roundRect(ctx, x + 3, y + 5, w, h, 9)
  ctx.fill()
  wheels(ctx, x, y, w, h, [0.18, 0.8])
  ctx.fillStyle = colour
  ctx.strokeStyle = shade(colour, -0.35)
  ctx.lineWidth = 1.5
  roundRect(ctx, x, y, w, h, [14, 14, 6, 6])
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#1f3446'
  roundRect(ctx, x + 5, y + h * 0.13, w - 10, h * 0.13, [7, 7, 3, 3])
  ctx.fill()
  // Long flat roof with a couple of ribs.
  ctx.fillStyle = shade(colour, -0.08)
  roundRect(ctx, x + 5, y + h * 0.3, w - 10, h * 0.64, 4)
  ctx.fill()
  ctx.strokeStyle = shade(colour, -0.2)
  ctx.lineWidth = 1
  for (const f of [0.48, 0.66, 0.84]) {
    ctx.beginPath()
    ctx.moveTo(x + 8, y + h * f)
    ctx.lineTo(x + w - 8, y + h * f)
    ctx.stroke()
  }
  lights(ctx, x, y, w, h)
}

function drawLorry(ctx, x, y, w, h, colour) {
  const cabH = 34
  ctx.fillStyle = SHADOW
  roundRect(ctx, x + 4, y + 6, w, h, 6)
  ctx.fill()
  wheels(ctx, x, y, w, h, [0.14, 0.62, 0.74, 0.87])
  // Cab at the front.
  ctx.fillStyle = colour
  ctx.strokeStyle = shade(colour, -0.35)
  ctx.lineWidth = 1.5
  roundRect(ctx, x + 2, y, w - 4, cabH, [12, 12, 4, 4])
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#1f3446'
  roundRect(ctx, x + 6, y + 6, w - 12, 10, [6, 6, 2, 2])
  ctx.fill()
  ctx.fillStyle = shade(colour, 0.2)
  roundRect(ctx, x + 8, y + 19, w - 16, 10, 3)
  ctx.fill()
  // Trailer: light box with a coloured stripe and roof ribs.
  const ty = y + cabH + 3
  const th = h - cabH - 3
  ctx.fillStyle = '#e9e6df'
  ctx.strokeStyle = '#a9a49a'
  roundRect(ctx, x, ty, w, th, 4)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = colour
  ctx.fillRect(x + 3, ty + 3, 6, th - 6)
  ctx.fillRect(x + w - 9, ty + 3, 6, th - 6)
  ctx.strokeStyle = '#cfcac0'
  ctx.lineWidth = 1
  for (let yy = ty + 14; yy < ty + th - 6; yy += 14) {
    ctx.beginPath()
    ctx.moveTo(x + 11, yy)
    ctx.lineTo(x + w - 11, yy)
    ctx.stroke()
  }
  ctx.fillStyle = '#fff6c9'
  roundRect(ctx, x + 5, y + 1, 8, 4, 2)
  ctx.fill()
  roundRect(ctx, x + w - 13, y + 1, 8, 4, 2)
  ctx.fill()
  ctx.fillStyle = '#ff3b3b'
  ctx.fillRect(x + 3, y + h - 4, 8, 3)
  ctx.fillRect(x + w - 11, y + h - 4, 8, 3)
}

function drawVehicle(ctx, v) {
  const sway = Math.sin(v.wobble) * 1.2
  const x = v.x - v.w / 2 + sway
  if (v.kind === 'lorry') drawLorry(ctx, x, v.y, v.w, v.h, v.colour)
  else if (v.kind === 'van') drawVan(ctx, x, v.y, v.w, v.h, v.colour)
  else drawCarBody(ctx, x, v.y, v.w, v.h, v.colour)
}

function drawCoin(ctx, c) {
  const squash = Math.abs(Math.cos(c.spin))
  const r = 11
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
  ctx.beginPath()
  ctx.ellipse(c.x + 3, c.y + 4, r * Math.max(0.25, squash), r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e9a90f'
  ctx.beginPath()
  ctx.ellipse(c.x, c.y, r * Math.max(0.2, squash), r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd84a'
  ctx.beginPath()
  ctx.ellipse(c.x, c.y, (r - 3) * Math.max(0.15, squash), r - 3, 0, 0, Math.PI * 2)
  ctx.fill()
  if (squash > 0.45) {
    ctx.fillStyle = '#d18f00'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.translate(c.x, c.y + 0.5)
    ctx.scale(squash, 1)
    ctx.fillText('£', 0, 0)
    ctx.restore()
  }
}

function drawSparkle(ctx, s) {
  const k = s.t / 0.5
  ctx.globalAlpha = 1 - k
  ctx.strokeStyle = '#ffd84a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(s.x, s.y, 10 + k * 22, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.lineWidth = 3
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeText('+10', s.x, s.y - 18 - k * 26)
  ctx.fillText('+10', s.x, s.y - 18 - k * 26)
  ctx.globalAlpha = 1
}

function drawPlayer(ctx, game) {
  const crashing = game.status === 'crashing' || (game.status === 'over' && game.crashT > 0)
  // Blink while invincible after a crash.
  if (game.flash > 0 && Math.floor(game.flash * 9) % 2 === 0) return
  ctx.save()
  ctx.translate(game.x, PLAYER_Y + PLAYER_H / 2)
  if (crashing) ctx.rotate(Math.min(1, game.crashT / 0.6) * 0.9)
  else ctx.rotate(game.tilt * 0.12)
  drawCarBody(ctx, -PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H, PLAYER, true)
  ctx.restore()

  if (crashing) {
    // A cartoon bump: a star burst and some puffs of smoke.
    const t = game.crashT
    const cx = game.x
    const cy = PLAYER_Y + 6
    ctx.fillStyle = '#ffd84a'
    ctx.strokeStyle = '#e8505b'
    ctx.lineWidth = 2
    ctx.beginPath()
    const spikes = 8
    const outer = 16 + Math.min(1, t * 4) * 10
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? outer * 0.5 : outer
      const a = (i / (spikes * 2)) * Math.PI * 2 + t
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    for (let i = 0; i < 4; i++) {
      const k = Math.min(1, t * 1.5)
      ctx.fillStyle = `rgba(230, 230, 230, ${0.7 * (1 - k * 0.6)})`
      ctx.beginPath()
      ctx.arc(cx - 15 + i * 10, cy - 8 - k * (20 + i * 6), 6 + k * 8, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function drawGame(canvas, game) {
  const ctx = canvas.getContext('2d')
  const cw = canvas.width
  const ch = canvas.height
  if (!cw || !ch) return
  const scale = Math.min(cw / WORLD_W, ch / WORLD_H)
  const ox = (cw - WORLD_W * scale) / 2
  const oy = (ch - WORLD_H * scale) / 2

  ctx.setTransform(scale, 0, 0, scale, ox, oy)
  // The visible area in world units, wider or taller than the world itself.
  const left = -ox / scale
  const right = WORLD_W + ox / scale
  const top = -oy / scale
  const bottom = WORLD_H + oy / scale

  drawScenery(ctx, game, left, right, top, bottom)
  for (const c of game.pickups) if (c.y > top - 20 && c.y < bottom + 20) drawCoin(ctx, c)
  for (const v of game.traffic) if (v.y + v.h > top - 10 && v.y < bottom + 10) drawVehicle(ctx, v)
  drawPlayer(ctx, game)
  for (const s of game.sparkles) drawSparkle(ctx, s)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
