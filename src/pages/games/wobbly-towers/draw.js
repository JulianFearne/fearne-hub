// src/pages/games/wobbly-towers/draw.js
// Paints the game world onto a canvas. Colours for the sky, ink and lines come
// from the design tokens on the canvas element, so it follows light/dark mode;
// the pieces keep their own colours in both.

import { BLOCK, GROUND_Y, MEDALS, PIECE_COLOURS, WORLD_WIDTH, shapeCells } from './engine'

function readColours(el) {
  const css = getComputedStyle(el)
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback
  return {
    sky: v('--surface-sunken', '#f6f1eb'),
    ink: v('--ink-1', '#241e22'),
    muted: v('--ink-3', '#6e6570'),
    goal: v('--secondary', '#f0a32b'),
    platform: v('--ink-2', '#574f57'),
    danger: v('--red-600', '#b02a21'),
  }
}

function drawPart(ctx, part, colour) {
  const v = part.vertices
  ctx.beginPath()
  ctx.moveTo(v[0].x, v[0].y)
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y)
  ctx.closePath()
  ctx.fillStyle = colour
  ctx.fill()
  ctx.stroke()
}

function drawBody(ctx, body, colour, alpha = 1) {
  ctx.globalAlpha = alpha
  // A compound body's first part is the hull; the squares are parts[1..].
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts
  for (const part of parts) drawPart(ctx, part, colour)
  ctx.globalAlpha = 1
}

// personalBest (blocks) draws a "best" line so there's something to beat.
export function drawGame(canvas, game, personalBest = 0) {
  const ctx = canvas.getContext('2d')
  const colours = readColours(canvas)
  const scale = canvas.width / WORLD_WIDTH
  const cam = game.cameraY
  const viewBottom = cam + canvas.height / scale

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = colours.sky
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (game.flash > 0) {
    ctx.globalAlpha = Math.min(0.25, game.flash * 0.4)
    ctx.fillStyle = colours.danger
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1
  }

  ctx.setTransform(scale, 0, 0, scale, 0, -cam * scale)

  // Height marks every 5 blocks up the left edge.
  ctx.font = `${BLOCK * 0.4}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1 / scale
  for (let n = 5; GROUND_Y - n * BLOCK > cam - BLOCK; n += 5) {
    const y = GROUND_Y - n * BLOCK
    if (y > viewBottom + BLOCK) continue
    ctx.strokeStyle = colours.muted
    ctx.globalAlpha = 0.25
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(WORLD_WIDTH, y)
    ctx.stroke()
    ctx.globalAlpha = 0.7
    ctx.fillStyle = colours.muted
    ctx.fillText(String(n), BLOCK * 0.2, y - BLOCK * 0.3)
    ctx.globalAlpha = 1
  }

  // Medal heights, and the player's best so far.
  const marks = MEDALS.map((m) => ({ y: GROUND_Y - m.blocks * BLOCK, text: `${m.emoji} ${m.blocks}`, gold: true }))
  if (personalBest > 0) marks.push({ y: GROUND_Y - personalBest * BLOCK, text: `Best ${personalBest}`, gold: false })
  ctx.font = `bold ${BLOCK * 0.45}px system-ui, sans-serif`
  ctx.textAlign = 'right'
  for (const mark of marks) {
    if (mark.y < cam - BLOCK || mark.y > viewBottom) continue
    const reached = game.best * BLOCK >= GROUND_Y - mark.y
    ctx.save()
    ctx.strokeStyle = mark.gold ? colours.goal : colours.ink
    ctx.globalAlpha = reached ? 0.35 : 0.9
    ctx.lineWidth = 3 / scale
    ctx.setLineDash([BLOCK * 0.5, BLOCK * 0.3])
    ctx.beginPath()
    ctx.moveTo(0, mark.y)
    ctx.lineTo(WORLD_WIDTH, mark.y)
    ctx.stroke()
    ctx.fillStyle = ctx.strokeStyle
    ctx.fillText(mark.text, WORLD_WIDTH - BLOCK * 0.25, mark.y - BLOCK * 0.4)
    ctx.restore()
  }
  ctx.textAlign = 'left'

  // Where the active piece will land: a faint guide straight down.
  if (game.active) {
    const b = game.active.bounds
    ctx.fillStyle = colours.ink
    ctx.globalAlpha = 0.06
    ctx.fillRect(b.min.x, b.max.y, b.max.x - b.min.x, GROUND_Y - b.max.y + BLOCK * 6)
    ctx.globalAlpha = 1
  }

  // Platform.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1.5 / scale
  drawBody(ctx, game.platform, colours.platform)

  // Pieces. A thin dark outline keeps adjacent squares readable.
  for (const p of game.pieces) drawBody(ctx, p, PIECE_COLOURS[p.plugin.kind])
  if (game.active) drawBody(ctx, game.active, PIECE_COLOURS[game.active.plugin.kind])
}

// Small preview of the next piece, centred in its own canvas.
export function drawPreview(canvas, kind) {
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!kind) return
  const cells = shapeCells(kind)
  const cols = Math.max(...cells.map(([c]) => c)) + 1
  const rows = Math.max(...cells.map(([, r]) => r)) + 1
  const size = Math.floor(Math.min(canvas.width / 4.5, canvas.height / 4.5))
  const ox = (canvas.width - cols * size) / 2
  const oy = (canvas.height - rows * size) / 2
  ctx.fillStyle = PIECE_COLOURS[kind]
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  for (const [c, r] of cells) {
    ctx.fillRect(ox + c * size, oy + r * size, size, size)
    ctx.strokeRect(ox + c * size + 0.5, oy + r * size + 0.5, size - 1, size - 1)
  }
}
