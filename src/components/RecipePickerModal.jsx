import { useEffect, useState } from 'react'
import { fetchRecipes } from './recipesData'

export default function RecipePickerModal({ onClose, onPick }) {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchRecipes()
      .then(setRecipes)
      .finally(() => setLoading(false))
  }, [])

  const visible = recipes.filter((r) => r.title.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="rb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal" style={{ maxWidth: 480 }}>
        <div className="rb-modal-close">
          <button className="rb-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="rb-modal-body">
          <div className="rb-modal-title" style={{ fontSize: '1.3rem' }}>
            Pick a recipe
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search recipes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {loading && <p>Loading…</p>}

          {!loading && visible.length === 0 && <p>No recipes match that search.</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {visible.map((r) => (
              <button
                key={r.id}
                onClick={() => onPick(r)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: '1px solid var(--rb-border)',
                  borderRadius: 10,
                  background: '#fff',
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>{r.emoji}</span>
                <span>{r.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
