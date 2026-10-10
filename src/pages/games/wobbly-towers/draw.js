// src/pages/games/wobbly-towers/draw.js
// Paints the game world onto a canvas. Colours for the sky, ink and lines come
// from the design tokens on the canvas element, so it follows light/dark mode;
// the pieces keep their own colours in both.

import {
  BLOCK,
  GROUND_Y,
  PIECE_COLOURS,
  VIEW_HEIGHT,
  WORLD_WIDTH,
  holdRemaining,
  shapeCells,
} from './engine'

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

export function drawGame(canvas, game) {
  const ctx = canvas.getContext('2d')
  const colours = readColours(canvas)
  const scale = canvas.width / WORLD_WIDTH
  const cam = game.cameraY

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
    if (y > cam + VIEW_HEIGHT + BLOCK) continue
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

  // Finish line.
  ctx.save()
  ctx.strokeStyle = colours.goal
  ctx.lineWidth = 4 / scale
  ctx.setLineDash([BLOCK * 0.5, BLOCK * 0.3])
  ctx.beginPath()
  ctx.moveTo(0, game.goalY)
  ctx.lineTo(WORLD_WIDTH, game.goalY)
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = colours.goal
  ctx.font = `bold ${BLOCK * 0.45}px system-ui, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText('FINISH', WORLD_WIDTH - BLOCK * 0.25, game.goalY - BLOCK * 0.4)
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

  // Tower top marker while counting down to a win.
  if (game.holdTime > 0 && game.status === 'playing') {
    ctx.fillStyle = colours.ink
    ctx.font = `bold ${BLOCK * 1.4}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(String(Math.ceil(holdRemaining(game))), WORLD_WIDTH / 2, cam + BLOCK * 1.6)
    ctx.textAlign = 'left'
  }
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
