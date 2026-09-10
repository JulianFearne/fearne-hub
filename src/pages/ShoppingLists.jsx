import { useEffect, useState } from 'react'
import {
  fetchShoppingLists,
  createShoppingList,
  deleteShoppingList,
  fetchListItems,
  addListItem,
  addListItems,
  toggleListItem,
  deleteListItem,
} from './mealPlanData'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import IconButton from '../components/ds/IconButton.jsx'
import Icon from '../components/ds/Icon.jsx'
import { Input } from '../components/ds/Field.jsx'
import TickRow from '../components/ds/TickRow.jsx'

export default function ShoppingLists() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [newListName, setNewListName] = useState('')
  const [combineMode, setCombineMode] = useState(false)
  const [selectedForCombine, setSelectedForCombine] = useState([])

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    fetchShoppingLists()
      .then(setLists)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newListName.trim()) return
    try {
      const created = await createShoppingList(newListName.trim())
      setLists((prev) => [...prev, created])
      setNewListName('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteList(id) {
    try {
      await deleteShoppingList(id)
      setLists((prev) => prev.filter((l) => l.id !== id))
      if (activeId === id) setActiveId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  function toggleCombineSelect(id) {
    setSelectedForCombine((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleCombine() {
    if (selectedForCombine.length < 2) return
    try {
      const name = `Combined (${new Date().toLocaleDateString()})`
      const combined = await createShoppingList(name)
      const allItems = []
      for (const id of selectedForCombine) {
        const items = await fetchListItems(id)
        allItems.push(
          ...items.map((i) => ({
            name: i.name,
            amount: i.amount,
            source: i.source,
            recipe_title: i.recipe_title,
          }))
        )
      }
      if (allItems.length > 0) await addListItems(combined.id, allItems)
      setLists((prev) => [...prev, combined])
      setCombineMode(false)
      setSelectedForCombine([])
      setActiveId(combined.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const activeList = lists.find((l) => l.id === activeId)

  if (activeList) {
    return <ListDetail list={activeList} onBack={() => setActiveId(null)} />
  }

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="fh-shop__toolbar">
        <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New list name, e.g. Family" />
        <Button type="submit" icon="plus">
          Create
        </Button>
      </form>

      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && lists.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name="shopping-basket" size={22} />
          </span>
          <p className="fh-empty__title">Nothing on this list yet</p>
          <p className="fh-empty__body">Create one above, or pull the ingredients in from this week's meals.</p>
        </div>
      )}

      {!loading && lists.length > 0 && (
        <>
          <div className="fh-shop__actions">
            {combineMode ? (
              <>
                <Button variant="quiet" onClick={() => { setCombineMode(false); setSelectedForCombine([]) }}>
                  Cancel
                </Button>
                <Button icon="merge" disabled={selectedForCombine.length < 2} onClick={handleCombine}>
                  Combine {selectedForCombine.length} lists
                </Button>
              </>
            ) : (
              <Button variant="quiet" icon="merge" onClick={() => setCombineMode(true)}>
                Combine lists
              </Button>
            )}
          </div>

          <div className="fh-shop__grid">
            {lists.map((l) => (
              <Card
                key={l.id}
                as="div"
                tile
                role="button"
                tabIndex={0}
                style={{ position: 'relative' }}
                onClick={() => (combineMode ? toggleCombineSelect(l.id) : setActiveId(l.id))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') (combineMode ? toggleCombineSelect(l.id) : setActiveId(l.id))
                }}
              >
                {combineMode && (
                  <span className="fh-shop__combinebox">
                    <span className="fh-tick__box" style={selectedForCombine.includes(l.id) ? { background: 'var(--success)', borderColor: 'var(--success)', color: 'var(--white)' } : undefined}>
                      {selectedForCombine.includes(l.id) && <Icon name="check" size={16} />}
                    </span>
                  </span>
                )}
                <span className="fh-recipes__mark">
                  <Icon name="shopping-basket" size={18} />
                </span>
                <div>
                  <CardTitle>{l.name}</CardTitle>
                  {!combineMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="trash-2"
                      style={{ marginTop: 'var(--sp-3)', color: 'var(--danger)' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteList(l.id)
                      }}
                    >
                      Delete list
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ListDetail({ list, onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newItem, setNewItem] = useState('')
  const [newAmount, setNewAmount] = useState('')

  useEffect(() => {
    fetchListItems(list.id)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [list.id])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newItem.trim()) return
    try {
      const saved = await addListItem(list.id, { name: newItem.trim(), amount: newAmount.trim() || null })
      setItems((prev) => [...prev, saved])
      setNewItem('')
      setNewAmount('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggle(item) {
    const next = !item.checked
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: next } : i)))
    try {
      await toggleListItem(item.id, next)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteListItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  const unchecked = items.filter((i) => !i.checked)
  const checked = items.filter((i) => i.checked)

  return (
    <div>
      <Button variant="quiet" icon="chevron-left" style={{ marginBottom: 'var(--sp-6)' }} onClick={onBack}>
        All lists
      </Button>

      <p className="fh-home__greet" style={{ font: 'var(--type-title-lg)', marginBottom: 'var(--sp-6)' }}>{list.name}</p>

      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="fh-shop__add">
        <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item…" />
        <Input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="Amount (optional)" style={{ flex: '0 0 140px' }} />
        <Button type="submit" icon="plus">
          Add
        </Button>
      </form>

      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name="shopping-basket" size={22} />
          </span>
          <p className="fh-empty__title">This list is empty</p>
          <p className="fh-empty__body">Add items above, or pull ingredients in from this week's meals.</p>
        </div>
      )}

      {!loading && unchecked.length > 0 && (
        <div className="fh-rows">
          {unchecked.map((item) => (
            <ShoppingItem key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {!loading && checked.length > 0 && (
        <>
          <p className="fh-shop__group">Got it ({checked.length})</p>
          <div className="fh-rows">
            {checked.map((item) => (
              <ShoppingItem key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ShoppingItem({ item, onToggle, onDelete }) {
  return (
    <TickRow
      checked={item.checked}
      onToggle={() => onToggle(item)}
      qty={item.amount}
      trail={<IconButton icon="x" label={`Remove ${item.name}`} onClick={() => onDelete(item.id)} />}
    >
      {item.name}
      {item.recipe_title && <span style={{ color: 'var(--ink-3)', font: 'var(--type-caption)' }}> ({item.recipe_title})</span>}
    </TickRow>
  )
}
