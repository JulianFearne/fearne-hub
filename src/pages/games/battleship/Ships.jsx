// src/pages/games/battleship/Ships.jsx
// The drawn bits of Battleship: a top-down ship silhouette per ship type,
// plus the hit (explosion) and miss (splash) markers. All plain SVG, coloured
// from battleship.css so they follow the hub's light/dark theme.
//
// Ships are drawn bow-right in a `length * 100` x 100 box. A vertical ship
// reuses the same drawing rotated a quarter turn (bow pointing down).

const U = 100

function Turret({ x, facing = 1 }) {
  // facing 1 = barrels towards the bow (right), -1 = towards the stern.
  const barrelX = facing === 1 ? x + 6 : x - 30
  return (
    <g className="bsh-turret">
      <rect x={barrelX} y={45} width={24} height={4} rx={2} />
      <rect x={barrelX} y={51} width={24} height={4} rx={2} />
      <circle cx={x} cy={50} r={11} />
    </g>
  )
}

function standardHull(w) {
  return `M 8 32 Q 8 22 20 22 L ${w - 70} 22 Q ${w - 22} 24 ${w - 6} 50 Q ${w - 22} 76 ${w - 70} 78 L 20 78 Q 8 78 8 68 Z`
}

function standardDeck(w) {
  return `M 20 33 L ${w - 74} 33 Q ${w - 40} 35 ${w - 24} 50 Q ${w - 40} 65 ${w - 74} 67 L 20 67 Z`
}

function Details({ name, w }) {
  switch (name) {
    case 'Carrier':
      return (
        <>
          <path className="bsh-hull" d={`M 6 24 L ${w - 60} 24 Q ${w - 14} 26 ${w - 6} 50 Q ${w - 14} 74 ${w - 60} 76 L 6 76 Z`} />
          <path className="bsh-deck" d={`M 14 31 L ${w - 64} 31 Q ${w - 26} 33 ${w - 18} 50 Q ${w - 26} 67 ${w - 64} 69 L 14 69 Z`} />
          <line className="bsh-runway" x1={28} y1={50} x2={w - 60} y2={50} />
          <line className="bsh-runway" x1={60} y1={62} x2={w - 150} y2={38} />
          <rect className="bsh-detail" x={w - 210} y={24} width={56} height={14} rx={3} />
          <rect className="bsh-detail" x={w - 196} y={18} width={16} height={10} rx={2} />
        </>
      )
    case 'Submarine':
      return (
        <>
          <path className="bsh-hull bsh-hull--sub" d={`M 10 50 Q 10 34 44 34 L ${w - 56} 34 Q ${w - 8} 36 ${w - 8} 50 Q ${w - 8} 64 ${w - 56} 66 L 44 66 Q 10 66 10 50 Z`} />
          <path className="bsh-detail" d="M 8 50 L 22 38 L 26 50 L 22 62 Z" />
          <rect className="bsh-detail" x={w / 2 - 34} y={43} width={60} height={14} rx={7} />
          <line className="bsh-runway" x1={w / 2 + 40} y1={50} x2={w - 40} y2={50} />
        </>
      )
    case 'Battleship':
      return (
        <>
          <path className="bsh-hull" d={standardHull(w)} />
          <path className="bsh-deck" d={standardDeck(w)} />
          <Turret x={70} facing={-1} />
          <rect className="bsh-detail" x={130} y={38} width={90} height={24} rx={5} />
          <circle className="bsh-funnel" cx={160} cy={50} r={7} />
          <Turret x={250} />
          <Turret x={300} />
        </>
      )
    case 'Cruiser':
      return (
        <>
          <path className="bsh-hull" d={standardHull(w)} />
          <path className="bsh-deck" d={standardDeck(w)} />
          <Turret x={58} facing={-1} />
          <rect className="bsh-detail" x={100} y={39} width={70} height={22} rx={5} />
          <circle className="bsh-funnel" cx={125} cy={50} r={6} />
          <Turret x={200} />
        </>
      )
    default:
      // Destroyer, and any future ship without its own drawing.
      return (
        <>
          <path className="bsh-hull" d={standardHull(w)} />
          <path className="bsh-deck" d={standardDeck(w)} />
          <rect className="bsh-detail" x={40} y={40} width={50} height={20} rx={5} />
          <circle className="bsh-funnel" cx={58} cy={50} r={5} />
          {w >= 200 && <Turret x={112} />}
        </>
      )
  }
}

// A ship drawing. `vertical` turns it so it fills a 1 x length box.
export function ShipSvg({ name, length, vertical = false, className = '' }) {
  const w = length * U
  const viewBox = vertical ? `0 0 ${U} ${w}` : `0 0 ${w} ${U}`
  return (
    <svg className={`bsh-ship-svg ${className}`} viewBox={viewBox} aria-hidden="true" focusable="false">
      <g transform={vertical ? `translate(${U} 0) rotate(90)` : undefined}>
        <Details name={name} w={w} />
      </g>
    </svg>
  )
}

export function HitMarker() {
  return (
    <svg className="bsh-marker bsh-marker--hit" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        className="bsh-blast-outer"
        d="M50 8 L60 32 L84 20 L72 44 L94 54 L70 62 L80 86 L56 72 L48 94 L40 70 L16 82 L28 58 L6 48 L30 40 L20 16 L42 30 Z"
      />
      <path className="bsh-blast-inner" d="M50 28 L56 42 L70 36 L63 50 L74 58 L59 60 L62 74 L50 64 L40 74 L41 60 L27 56 L39 48 L32 36 L45 41 Z" />
    </svg>
  )
}

export function MissMarker() {
  return (
    <svg className="bsh-marker bsh-marker--miss" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="bsh-splash-ring" cx="50" cy="50" r="28" />
      <circle className="bsh-splash-dot" cx="50" cy="50" r="12" />
    </svg>
  )
}
