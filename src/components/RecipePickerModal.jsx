import { useEffect, useState } from 'react'
import { fetchRecipes } from '../pages/recipesData'
import Sheet from './ds/Sheet.jsx'
import SearchField from './ds/SearchField.jsx'
import Icon from './ds/Icon.jsx'

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
    <Sheet title="Pick a recipe" onClose={onClose}>
      <SearchField value={search} onChange={setSearch} placeholder="Search recipes…" />

      {loading && <p className="fh-loading" style={{ marginTop: 'var(--sp-6)' }}>Loading…</p>}
      {!loading && visible.length === 0 && (
        <p className="fh-loading" style={{ marginTop: 'var(--sp-6)' }}>No recipes match that search.</p>
      )}

      <div className="fh-rows" style={{ marginTop: 'var(--sp-6)', maxHeight: 360, overflowY: 'auto' }}>
        {visible.map((r) => (
          <button key={r.id} className="fh-row" onClick={() => onPick(r)}>
            <span className="fh-row__lead">
              <Icon name="soup" size={18} />
            </span>
            <span className="fh-row__body">
              <span className="fh-row__label">{r.title}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
