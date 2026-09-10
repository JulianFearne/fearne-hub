import { useEffect, useMemo, useState } from 'react'
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
import Sheet from '../components/ds/Sheet.jsx'
import Button from '../components/ds/Button.jsx'
import IconButton from '../components/ds/IconButton.jsx'
import Icon from '../components/ds/Icon.jsx'
import { Field, Select, Input } from '../components/ds/Field.jsx'

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  const todayISO = toISODate(new Date())

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="fh-planner__toolbar">
        <div className="fh-planner__week">
          <IconButton icon="chevron-left" label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} />
          <span className="fh-planner__label">{weekLabel}</span>
          <IconButton icon="chevron-right" label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} />
        </div>
        <Button variant="quiet" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          This week
        </Button>
        <Button icon="shopping-basket" disabled={entries.length === 0} onClick={() => setShowShopModal(true)}>
          Add week to shopping list
        </Button>
      </div>

      {loading ? (
        <p className="fh-loading">Loading…</p>
      ) : (
        <div className="fh-planner__days">
          {days.map((d, i) => {
            const isToday = toISODate(d) === todayISO
            return (
              <div key={i} className={`fh-planner__day${isToday ? ' fh-planner__day--today' : ''}`}>
                <div className="fh-planner__dayhead">
                  <span className="fh-planner__dayname">{DAY_LABELS[i]}</span>
                  <span className="fh-planner__daydate">
                    {d.getDate()}/{d.getMonth() + 1}
                  </span>
                </div>
                {MEAL_TYPES.map((meal) => {
                  const entry = entryFor(d, meal.id)
                  return (
                    <div
                      key={meal.id}
                      className="fh-planner__slot"
                      role={entry ? undefined : 'button'}
                      tabIndex={entry ? undefined : 0}
                      onClick={entry ? undefined : () => setPickerSlot({ date: d, mealType: meal.id })}
                      onKeyDown={
                        entry
                          ? undefined
                          : (e) => {
                              if (e.key === 'Enter' || e.key === ' ') setPickerSlot({ date: d, mealType: meal.id })
                            }
                      }
                    >
                      <span className="fh-planner__meal">{meal.label}</span>
                      <span className={`fh-planner__dish${entry ? '' : ' fh-planner__dish--empty'}`}>
                        {entry ? entry.recipes?.title : 'Add a meal'}
                      </span>
                      {entry && (
                        <IconButton
                          icon="x"
                          label={`Remove ${entry.recipes?.title}`}
                          onClick={() => handleRemove(entry)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
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
    <Sheet
      title="Add this week's ingredients"
      onClose={onClose}
      footer={
        !done && (
          <>
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleAdd} loading={saving}>
              {saving ? 'Adding…' : 'Add ingredients'}
            </Button>
          </>
        )
      }
    >
      <p style={{ font: 'var(--type-meta)', color: 'var(--ink-3)', marginBottom: 'var(--sp-6)' }}>
        {ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'} from this week's planned meals.
      </p>

      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <p className="fh-loading">Loading lists…</p>
      ) : done ? (
        <>
          <div className="fh-notice fh-notice--success">
            <Icon name="check-circle" size={16} />
            Added. Head to Shopping Lists to see it.
          </div>
          <Button as={Link} to="/shopping" block>
            Go to Shopping Lists
          </Button>
        </>
      ) : (
        <>
          <Field label="Add to which list?" htmlFor="mp-list-choice">
            <Select id="mp-list-choice" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="new">New list…</option>
            </Select>
          </Field>
          {choice === 'new' && (
            <Field label="New list name" htmlFor="mp-list-name" style={{ marginTop: 'var(--sp-5)' }}>
              <Input id="mp-list-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Family" />
            </Field>
          )}
        </>
      )}
    </Sheet>
  )
}
