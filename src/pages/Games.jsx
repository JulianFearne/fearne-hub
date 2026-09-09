import { Link } from 'react-router-dom'

export default function Games() {
  return (
    <div className="placeholder">
      <h2>Games</h2>
      <p>
        <Link to="/games/animal-place-thing">Animal Place Thing</Link>
        {' — '}fast-thinking alphabet game · 2+ players
      </p>
    </div>
  )
}
