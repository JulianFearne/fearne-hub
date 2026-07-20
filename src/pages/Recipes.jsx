import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { CATEGORIES, fetchRecipes, addRecipe, deleteRecipe } from './recipesData'
import RecipeModal from '../components/RecipeModal.jsx'
import RecipeForm from '../components/RecipeForm.jsx'
import CookMode from '../components/CookMode.jsx'
import './Recipes.css'

export default function Recipes() {
  const { user } = useAuth()
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [cooking, setCooking] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchRecipes()
      .then((data) => {
        if (!cancelled) setRecipes(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const c = { all: recipes.length }
    for (const cat of CATEGORIES) {
      if (cat.id === 'all') continue
      c[cat.id] = recipes.filter((r) => r.category === cat.id).length
    }
    return c
  }, [recipes])

  const visible = useMemo(() => {
    let list = recipes
    if (category !== 'all') list = list.filter((r) => r.category === category)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.tags || []).some((t) => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [recipes, category, search])

  async function handleAddRecipe(recipe) {
    const saved = await addRecipe(recipe)
    setRecipes((prev) => [saved, ...prev])
  }

  async function handleDelete(id) {
    await deleteRecipe(id)
    setRecipes((prev) => prev.filter((r) => r.id !== id))
    setSelected(null)
  }

  const sectionTitle = category === 'all' ? 'All Recipes' : CATEGORIES.find((c) => c.id === category)?.label

  return (
    <div className="recipe-book">
      <div className="rb-header">
        <div className="rb-logo">
          <span>Fearne</span> Recipe Book
        </div>
        <div className="rb-search">
          <input
            type="text"
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCategory('all')
            }}
          />
        </div>
        <button className="rb-add-btn" onClick={() => setShowForm(true)}>
          + Add recipe
        </button>
      </div>

      <div className="rb-layout">
        <aside className="rb-sidebar">
          <div className="rb-sidebar-title">Categories</div>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`rb-cat-btn ${category === c.id ? 'active' : ''}`}
              onClick={() => {
                setCategory(c.id)
                setSearch('')
              }}
            >
              <span>{c.emoji}</span>
              <span>{c.label}</span>
              <span className="rb-cat-count">{counts[c.id] ?? 0}</span>
            </button>
          ))}
        </aside>

        <main className="rb-main">
          <div className="rb-section-header">
            <h2>{sectionTitle}</h2>
            <span className="rb-count-label">
              {visible.length} recipe{visible.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading && <p>Loading recipes…</p>}
          {loadError && <div className="rb-form-error">{loadError}</div>}

          {!loading && !loadError && visible.length === 0 && (
            <div className="rb-empty">
              <div className="rb-empty-icon">🍽️</div>
              <h3>No recipes here yet</h3>
              <p>Add the first one for this category.</p>
            </div>
          )}

          {!loading && visible.length > 0 && (
            <div className="rb-grid">
              {visible.map((r) => (
                <button key={r.id} className="rb-card" onClick={() => setSelected(r)}>
                  <div className={`rb-card-thumb acc-${r.category}`}>{r.emoji}</div>
                  <div className="rb-card-body">
                    <div className="rb-card-category">
                      {CATEGORIES.find((c) => c.id === r.category)?.label}
                    </div>
                    <div className="rb-card-title">{r.title}</div>
                    <div className="rb-card-meta">
                      {r.time && <span>⏱ {r.time}</span>}
                      {r.serves && <span>👤 {r.serves}</span>}
                      {r.difficulty && <span>⭐ {r.difficulty}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      {selected && (
        <RecipeModal
          recipe={selected}
          canDelete={selected.created_by === user?.id}
          onClose={() => setSelected(null)}
          onDelete={() => handleDelete(selected.id)}
          onCook={() => {
            setCooking(selected)
            setSelected(null)
          }}
        />
      )}

      {showForm && <RecipeForm onClose={() => setShowForm(false)} onSubmit={handleAddRecipe} />}

      {cooking && <CookMode recipe={cooking} onExit={() => setCooking(null)} />}
    </div>
  )
}
