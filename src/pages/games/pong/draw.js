// src/pages/games/pong/draw.js
// Paints a Pong game onto a canvas. The court keeps its own dark, glowing
// palette in both themes (it is meant to look like an arcade screen), so the
// only theme-aware part is the letterbox around it, which uses the hub's
// sunken surface colour.

import { BALL_R, PADDLE_H, WORLD_W, serveCount } from './engine'

const COURT = '#0b1022'
const COURT_EDGE = '#1d2a52'
const LINE = 'rgba(160, 180, 255, 0.28)'
const DIGITS = 'rgba(160, 180, 255, 0.09)'
const BALL = '#fff6d6'
const BALL_GLOW = '#ffd34d'
const BOTTOM = '#3fe0ff'
const TOP = '#ff5ca8'
const WALL = '#a98bff'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawPaddle(ctx, p, colour) {
  ctx.save()
  ctx.shadowColor = colour
  ctx.shadowBlur = 14
  ctx.fillStyle = colour
  roundRect(ctx, p.x - p.w / 2, p.y - PADDLE_H / 2, p.w, PADDLE_H, PADDLE_H / 2)
  ctx.fill()
  ctx.restore()
}

// Big faint digits behind the play. `flip` turns them round for the top
// player so they read upright from their end of the phone.
function bigNumber(ctx, text, cx, cy, size, flip) {
  ctx.save()
  ctx.translate(cx, cy)
  if (flip) ctx.rotate(Math.PI)
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

// Returns the world-to-screen transform so the page can map fingers back.
export function fitWorld(cssW, cssH, worldH) {
  const scale = Math.min(cssW / WORLD_W, cssH / worldH)
  return {
    scale,
    ox: (cssW - WORLD_W * scale) / 2,
    oy: (cssH - worldH * scale) / 2,
  }
}

export function drawGame(canvas, game) {
  const ctx = canvas.getContext('2d')
  const dpr = canvas.width / (canvas.clientWidth || 1)
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (!cssW || !cssH) return
  const H = game.h
  const { scale, ox, oy } = fitWorld(cssW, cssH, H)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--surface-sunken').trim() || '#10131f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy)

  // Court
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#0e1430')
  grad.addColorStop(0.5, COURT)
  grad.addColorStop(1, '#0e1430')
  ctx.fillStyle = grad
  roundRect(ctx, 0, 0, WORLD_W, H, 10)
  ctx.fill()
  ctx.save()
  roundRect(ctx, 0, 0, WORLD_W, H, 10)
  ctx.clip()

  const wall = game.mode === 'wall'
  ctx.fillStyle = DIGITS
  if (wall) {
    bigNumber(ctx, String(game.hits), WORLD_W / 2, H * 0.45, 150, false)
  } else {
    bigNumber(ctx, String(game.score.top), WORLD_W / 2, H * 0.25, 130, game.mode === 'duo')
    bigNumber(ctx, String(game.score.bottom), WORLD_W / 2, H * 0.75, 130, false)
  }

  // Centre dashed line (the half-way mark), or a glowing top wall.
  if (!wall) {
    ctx.strokeStyle = LINE
    ctx.lineWidth = 3
    ctx.setLineDash([12, 10])
    ctx.beginPath()
    ctx.moveTo(6, H / 2)
    ctx.lineTo(WORLD_W - 6, H / 2)
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    ctx.save()
    ctx.shadowColor = WALL
    ctx.shadowBlur = 16
    ctx.fillStyle = WALL
    ctx.fillRect(0, 0, WORLD_W, 4)
    ctx.restore()
  }

  // Ball trail, then the ball.
  const b = game.ball
  const trail = game.trail
  for (let i = 0; i < trail.length; i++) {
    const t = (i + 1) / (trail.length + 1)
    ctx.fillStyle = `rgba(255, 211, 77, ${0.35 * t})`
    ctx.beginPath()
    ctx.arc(trail[i].x, trail[i].y, BALL_R * (0.4 + 0.5 * t), 0, Math.PI * 2)
    ctx.fill()
  }
  if (game.status !== 'over') {
    // Blink while waiting to serve so it's clear the ball isn't live yet.
    const waiting = game.status === 'serve'
    ctx.save()
    ctx.globalAlpha = waiting ? 0.55 + 0.45 * Math.sin(game.time / 120) : 1
    ctx.shadowColor = BALL_GLOW
    ctx.shadowBlur = 18
    ctx.fillStyle = BALL
    ctx.beginPath()
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (game.top) drawPaddle(ctx, game.top, TOP)
  drawPaddle(ctx, game.bottom, BOTTOM)

  // Serve countdown, drawn for both ends in two-player mode.
  const n = serveCount(game)
  if (n) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    if (game.mode === 'duo') {
      bigNumber(ctx, String(n), WORLD_W / 2, H / 2 + 52, 44, false)
      bigNumber(ctx, String(n), WORLD_W / 2, H / 2 - 52, 44, true)
    } else {
      bigNumber(ctx, String(n), WORLD_W / 2, wall ? H * 0.35 + 52 : H / 2 + 52, 44, false)
    }
  }

  ctx.restore()
  ctx.strokeStyle = COURT_EDGE
  ctx.lineWidth = 2
  roundRect(ctx, 1, 1, WORLD_W - 2, H - 2, 10)
  ctx.stroke()
}
