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
import './Recipes.css'

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
    return (
      <ListDetail
        list={activeList}
        onBack={() => setActiveId(null)}
      />
    )
  }

  return (
    <div>
      <div className="hub-intro">
        <h1>Shopping Lists</h1>
        <p>Keep separate lists, or combine a few into one before you head out.</p>
      </div>

      {error && <div className="rb-form-error">{error}</div>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="New list name, e.g. Family"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
        />
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 18px' }} type="submit">
          + Create
        </button>
      </form>

      {loading && <p>Loading…</p>}

      {!loading && lists.length === 0 && (
        <div className="rb-empty">
          <div className="rb-empty-icon">🛒</div>
          <h3>No lists yet</h3>
          <p>Create one above, or add ingredients from the Meal Planner.</p>
        </div>
      )}

      {!loading && lists.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
            {combineMode ? (
              <>
                <button
                  className="btn-primary"
                  style={{ width: 'auto', padding: '8px 16px' }}
                  disabled={selectedForCombine.length < 2}
                  onClick={handleCombine}
                >
                  Combine {selectedForCombine.length} lists
                </button>
                <button
                  className="mp-nav-btn"
                  onClick={() => {
                    setCombineMode(false)
                    setSelectedForCombine([])
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button className="mp-nav-btn" onClick={() => setCombineMode(true)}>
                Combine lists…
              </button>
            )}
          </div>

          <div className="pin-grid">
            {lists.map((l) => (
              <div
                key={l.id}
                className="pin-card"
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  combineMode ? toggleCombineSelect(l.id) : setActiveId(l.id)
                }
              >
                <span className="pin-dot" />
                {combineMode && (
                  <input
                    type="checkbox"
                    checked={selectedForCombine.includes(l.id)}
                    onChange={() => toggleCombineSelect(l.id)}
                    style={{ position: 'absolute', top: 10, right: 10 }}
                  />
                )}
                <h3>{l.name}</h3>
                {!combineMode && (
                  <button
                    className="rb-delete-btn"
                    style={{ marginTop: 8 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteList(l.id)
                    }}
                  >
                    Delete list
                  </button>
                )}
              </div>
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
      <button className="mp-nav-btn" onClick={onBack} style={{ marginBottom: 16 }}>
        ← All lists
      </button>

      <div className="hub-intro">
        <h1>{list.name}</h1>
      </div>

      {error && <div className="rb-form-error">{error}</div>}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add an item…"
          style={{ flex: 2, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
        />
        <input
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          placeholder="Amount (optional)"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
        />
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 18px' }} type="submit">
          Add
        </button>
      </form>

      {loading && <p>Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="rb-empty">
          <div className="rb-empty-icon">🛒</div>
          <h3>This list is empty</h3>
          <p>Add items above, or pull ingredients in from the Meal Planner.</p>
        </div>
      )}

      {!loading && unchecked.length > 0 && (
        <ul style={{ listStyle: 'none', marginBottom: 20 }}>
          {unchecked.map((item) => (
            <ShoppingItem key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      {!loading && checked.length > 0 && (
        <>
          <div className="rb-sidebar-title">Got it ({checked.length})</div>
          <ul style={{ listStyle: 'none' }}>
            {checked.map((item) => (
              <ShoppingItem key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ShoppingItem({ item, onToggle, onDelete }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px dashed var(--line)',
        opacity: item.checked ? 0.5 : 1,
      }}
    >
      <input type="checkbox" checked={item.checked} onChange={() => onToggle(item)} />
      <span style={{ flex: 1, textDecoration: item.checked ? 'line-through' : 'none' }}>
        {item.name}
        {item.amount ? ` — ${item.amount}` : ''}
        {item.recipe_title && (
          <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginLeft: 6 }}>
            ({item.recipe_title})
          </span>
        )}
      </span>
      <button
        onClick={() => onDelete(item.id)}
        style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: '0.8rem' }}
      >
        ✕
      </button>
    </li>
  )
}
