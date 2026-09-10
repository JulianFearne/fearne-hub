import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { CATEGORIES, fetchRecipes, addRecipe, deleteRecipe } from './recipesData'
import RecipeModal from '../components/RecipeModal.jsx'
import RecipeForm from '../components/RecipeForm.jsx'
import CookMode from '../components/CookMode.jsx'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'
import SearchField from '../components/ds/SearchField.jsx'
import { Chip, ChipRow } from '../components/ds/Chip.jsx'

function recipeMeta(r) {
  return [r.time, r.serves ? `serves ${r.serves}` : null, r.difficulty].filter(Boolean).join(', ')
}

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

  return (
    <div>
      <div className="fh-recipes__toolbar">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v)
            setCategory('all')
          }}
          placeholder="Search recipes…"
        />
        <Button icon="plus" onClick={() => setShowForm(true)}>
          Add a recipe
        </Button>
        <Button as={Link} to="/import" variant="quiet" icon="share-2">
          Import
        </Button>
      </div>

      <ChipRow>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={category === c.id}
            count={counts[c.id] ?? 0}
            onClick={() => {
              setCategory(c.id)
              setSearch('')
            }}
          >
            {c.label}
          </Chip>
        ))}
      </ChipRow>

      <div className="fh-recipes__section">
        <span />
        <span className="fh-recipes__count">
          {visible.length} recipe{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading && <p className="fh-loading">Loading recipes…</p>}
      {loadError && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {loadError}
        </div>
      )}

      {!loading && !loadError && visible.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name="search-x" size={22} />
          </span>
          <p className="fh-empty__title">Nothing here yet</p>
          <p className="fh-empty__body">Add the first recipe for this category, or try a different search.</p>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div className="fh-recipes__grid">
          {visible.map((r) => {
            const cat = CATEGORIES.find((c) => c.id === r.category)
            return (
              <Card key={r.id} tile onClick={() => setSelected(r)}>
                <span className="fh-recipes__mark">
                  <Icon name={cat?.icon ?? 'utensils'} size={18} />
                </span>
                <div>
                  <CardTitle>{r.title}</CardTitle>
                  <CardMeta>{recipeMeta(r) || cat?.label}</CardMeta>
                </div>
              </Card>
            )
          })}
        </div>
      )}

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
