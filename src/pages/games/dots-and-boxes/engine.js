// src/pages/games/dots-and-boxes/engine.js
// Pure Dots and Boxes logic. No React.
//
// A board of `rows` x `cols` boxes has (rows+1) rows of horizontal edges
// (each row has `cols` edges) and `rows` rows of vertical edges (each row
// has `cols+1` edges). hEdges[r][c] is the edge between dot (r,c) and dot
// (r,c+1); vEdges[r][c] is the edge between dot (r,c) and dot (r+1,c).
// Box (r,c) is bounded by hEdges[r][c] (top), hEdges[r+1][c] (bottom),
// vEdges[r][c] (left) and vEdges[r][c+1] (right).

export const PLAYER_1 = 1
export const PLAYER_2 = 2

export function createGame(rows, cols) {
  return {
    rows,
    cols,
    hEdges: Array.from({ length: rows + 1 }, () => Array(cols).fill(false)),
    vEdges: Array.from({ length: rows }, () => Array(cols + 1).fill(false)),
    boxes: Array.from({ length: rows }, () => Array(cols).fill(0)),
    turn: PLAYER_1,
    scores: { [PLAYER_1]: 0, [PLAYER_2]: 0 },
  }
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice())
}

function boxComplete(state, r, c) {
  return (
    state.hEdges[r][c] &&
    state.hEdges[r + 1][c] &&
    state.vEdges[r][c] &&
    state.vEdges[r][c + 1]
  )
}

export function otherPlayer(p) {
  return p === PLAYER_1 ? PLAYER_2 : PLAYER_1
}

export function isEdgeDrawn(state, type, r, c) {
  return type === 'h' ? state.hEdges[r][c] : state.vEdges[r][c]
}

// Returns a NEW state, never mutates the input. Drawing an edge that's
// already drawn, or after the board is full, is a no-op.
export function drawEdge(state, type, r, c) {
  if (isEdgeDrawn(state, type, r, c) || isBoardFull(state)) return state

  const hEdges = cloneGrid(state.hEdges)
  const vEdges = cloneGrid(state.vEdges)
  if (type === 'h') hEdges[r][c] = true
  else vEdges[r][c] = true

  const boxes = cloneGrid(state.boxes)
  const scores = { ...state.scores }
  const next = { ...state, hEdges, vEdges, boxes, scores }

  // An edge borders at most two boxes; check whichever are adjacent to it.
  const candidates =
    type === 'h'
      ? [
          [r - 1, c], // box above this edge
          [r, c],     // box below this edge
        ]
      : [
          [r, c - 1], // box to the left of this edge
          [r, c],     // box to the right of this edge
        ]

  let claimed = 0
  for (const [br, bc] of candidates) {
    if (br < 0 || br >= state.rows || bc < 0 || bc >= state.cols) continue
    if (boxes[br][bc]) continue // already claimed
    if (boxComplete(next, br, bc)) {
      boxes[br][bc] = state.turn
      scores[state.turn] += 1
      claimed += 1
    }
  }

  next.turn = claimed > 0 ? state.turn : otherPlayer(state.turn)
  return next
}

export function isBoardFull(state) {
  return state.scores[PLAYER_1] + state.scores[PLAYER_2] === state.rows * state.cols
}

// { winner: 1 | 2 | null }, null means a tie.
export function getWinner(state) {
  if (!isBoardFull(state)) return null
  const { [PLAYER_1]: s1, [PLAYER_2]: s2 } = state.scores
  if (s1 === s2) return { winner: null }
  return { winner: s1 > s2 ? PLAYER_1 : PLAYER_2 }
}
