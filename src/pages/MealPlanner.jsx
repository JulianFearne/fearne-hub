import { useEffect, useMemo, useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import {
  MEAL_TYPES,
  startOfWeek,
  addDays,
  weekDates,
  toISODate,
  fetchMealPlanEntries,
  addMealPlanEntry,
  deleteMealPlanEntry,
  ingredientsFromEntries,
  createShoppingList,
  fetchShoppingLists,
  addListItems,
} from './mealPlanData'
import RecipePickerModal from '../components/RecipePickerModal.jsx'
import './MealPlanner.css'
import './Recipes.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function MealPlanner() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pickerSlot, setPickerSlot] = useState(null) // { date, mealType } | null
  const [showShopModal, setShowShopModal] = useState(false)

  const days = useMemo(() => weekDates(weekStart), [weekStart])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMealPlanEntries(weekStart, weekEnd)
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekStart, weekEnd])

  function entryFor(date, mealType) {
    const iso = toISODate(date)
    return entries.find((e) => e.entry_date === iso && e.meal_type === mealType)
  }

  async function handlePick(recipe) {
    const { date, mealType } = pickerSlot
    try {
      const saved = await addMealPlanEntry({
        entry_date: toISODate(date),
        meal_type: mealType,
        recipe_id: recipe.id,
      })
      setEntries((prev) => [...prev, saved])
    } catch (err) {
      setError(err.message)
    } finally {
      setPickerSlot(null)
    }
  }

  async function handleRemove(entry) {
    try {
      await deleteMealPlanEntry(entry.id)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} \u2013 ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  const todayISO = toISODate(new Date())

  return (
    <div>
      <div className="hub-intro">
        <h1>Meal Planner</h1>
        <p>Plan the week, then turn it straight into a shopping list.</p>
      </div>

      {error && <div className="rb-form-error">{error}</div>}

      <div className="mp-toolbar">
        <div className="mp-week-nav">
          <button className="mp-nav-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ← Prev
          </button>
          <span className="mp-week-label">{weekLabel}</span>
          <button className="mp-nav-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next →
          </button>
          <button className="mp-nav-btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </button>
        </div>
        <button className="mp-shop-btn" onClick={() => setShowShopModal(true)} disabled={entries.length === 0}>
          🛒 Add week to shopping list
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="mp-grid">
          <div className="mp-corner" />
          {days.map((d, i) => (
            <div key={i} className={`mp-day-header ${toISODate(d) === todayISO ? 'mp-today' : ''}`}>
              {DAY_LABELS[i]}
              <span className="mp-day-date">{d.getDate()}/{d.getMonth() + 1}</span>
            </div>
          ))}

          {MEAL_TYPES.map((meal) => (
            <Fragment key={meal.id}>
              <div className="mp-meal-label">{meal.label}</div>
              {days.map((d, i) => {
                const entry = entryFor(d, meal.id)
                return (
                  <div
                    key={`${meal.id}-${i}`}
                    className={`mp-cell ${entry ? 'mp-cell-filled' : 'mp-cell-empty'}`}
                    onClick={() => !entry && setPickerSlot({ date: d, mealType: meal.id })}
                  >
                    {entry ? (
                      <>
                        <span className="mp-cell-emoji">{entry.recipes?.emoji || '🍽️'}</span>
                        <span className="mp-cell-title">{entry.recipes?.title}</span>
                        <button
                          className="mp-cell-remove"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemove(entry)
                          }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      '+'
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      )}

      {pickerSlot && <RecipePickerModal onClose={() => setPickerSlot(null)} onPick={handlePick} />}

      {showShopModal && <AddToShoppingListModal entries={entries} onClose={() => setShowShopModal(false)} />}
    </div>
  )
}

function AddToShoppingListModal({ entries, onClose }) {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [choice, setChoice] = useState('') // list id, or 'new'
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchShoppingLists()
      .then((data) => {
        setLists(data)
        setChoice(data[0]?.id || 'new')
      })
      .finally(() => setLoading(false))
  }, [])

  const ingredients = useMemo(() => ingredientsFromEntries(entries), [entries])

  async function handleAdd() {
    setSaving(true)
    setError(null)
    try {
      let listId = choice
      if (choice === 'new') {
        if (!newName.trim()) {
          setError('Give the new list a name.')
          setSaving(false)
          return
        }
        const created = await createShoppingList(newName.trim())
        listId = created.id
      }
      await addListItems(listId, ingredients)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rb-modal" style={{ maxWidth: 440 }}>
        <div className="rb-modal-close">
          <button className="rb-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="rb-modal-body">
          <div className="rb-modal-title" style={{ fontSize: '1.3rem' }}>
            Add this week's ingredients
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--rb-brown)', marginBottom: 16 }}>
            {ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'} from this week's planned meals.
          </p>

          {error && <div className="rb-form-error">{error}</div>}

          {loading ? (
            <p>Loading lists…</p>
          ) : done ? (
            <div className="rb-form-error" style={{ background: '#e4f0e4', color: '#2d4a31' }}>
              Added. Head to Shopping Lists to see it.
            </div>
          ) : (
            <>
              <div className="rb-form-field">
                <label>Add to which list?</label>
                <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  <option value="new">+ New list…</option>
                </select>
              </div>
              {choice === 'new' && (
                <div className="rb-form-field">
                  <label>New list name</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Family" />
                </div>
              )}
              <button className="rb-form-submit" onClick={handleAdd} disabled={saving}>
                {saving ? 'Adding…' : 'Add ingredients'}
              </button>
            </>
          )}

          {done && (
            <Link
              to="/shopping"
              className="rb-form-submit"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 10 }}
            >
              Go to Shopping Lists
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
