import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import {
  LIST_KINDS,
  PERMISSIONS,
  accessFor,
  canEdit,
  canManage,
  fetchLists,
  createList,
  renameList,
  deleteList,
  setListShare,
  removeListShare,
  fetchListItems,
  addListItem,
  addListItems,
  updateListItem,
  toggleListItem,
  deleteListItem,
  uncheckAllItems,
  deleteCheckedItems,
} from './listsData'
import { fetchFamilyMembers } from './choresData'
import { displayName } from './accountData'
import { formatEventDate, toISODate } from './calendarData'
import { notify } from '../lib/notify'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Badge from '../components/ds/Badge.jsx'
import Button from '../components/ds/Button.jsx'
import IconButton from '../components/ds/IconButton.jsx'
import Icon from '../components/ds/Icon.jsx'
import Sheet from '../components/ds/Sheet.jsx'
import { Field, Input, Select } from '../components/ds/Field.jsx'
import TickRow from '../components/ds/TickRow.jsx'

// Open items with a due date first, soonest first; undated ones keep
// the order they were added in.
function byDueDate(a, b) {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

const PERMISSION_LABEL = { owner: 'Owner', ...Object.fromEntries(PERMISSIONS.map((p) => [p.id, p.label])) }

// Every list of one kind (shopping, to-do, checklist...) at /lists/:kind.
// What each kind can do is driven by its entry in LIST_KINDS; what the
// current user can do to each list is driven by its sharing (accessFor).
export default function ListCollection() {
  const { kind } = useParams()
  if (!LIST_KINDS[kind]) return <Navigate to="/lists" replace />
  // Keyed so switching kind resets the page state rather than reusing it.
  return <KindLists key={kind} kind={kind} />
}

function KindLists({ kind }) {
  const k = LIST_KINDS[kind]
  const { user } = useAuth()
  const [lists, setLists] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [newListName, setNewListName] = useState('')
  const [combineMode, setCombineMode] = useState(false)
  const [selectedForCombine, setSelectedForCombine] = useState([])

  useEffect(() => {
    load()
    fetchFamilyMembers()
      .then(setMembers)
      .catch(() => {})
  }, [])

  function load() {
    setLoading(true)
    fetchLists(kind)
      .then(setLists)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  function nameOf(userId) {
    const m = members.find((x) => x.id === userId)
    return m ? displayName(m) : 'someone'
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newListName.trim()) return
    try {
      const created = await createList(newListName.trim(), kind)
      setLists((prev) => [...prev, created])
      setNewListName('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteList(id) {
    try {
      await deleteList(id)
      setLists((prev) => prev.filter((l) => l.id !== id))
      if (activeId === id) setActiveId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleLeaveList(id) {
    try {
      await removeListShare(id, user.id)
      setLists((prev) => prev.filter((l) => l.id !== id))
      if (activeId === id) setActiveId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // After a rename or a sharing change. If the change took away the
  // current user's own access (a manager removing themselves), drop it.
  function handleListChange(updated) {
    if (!accessFor(updated, user.id)) {
      setLists((prev) => prev.filter((l) => l.id !== updated.id))
      setActiveId(null)
      return
    }
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  }

  function toggleCombineSelect(id) {
    setSelectedForCombine((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleCombine() {
    if (selectedForCombine.length < 2) return
    try {
      const name = `Combined (${new Date().toLocaleDateString()})`
      const combined = await createList(name, kind)
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

  function sharingMeta(list, access) {
    if (access === 'owner') {
      const n = list.list_shares?.length || 0
      return n ? `Shared with ${n} ${n === 1 ? 'person' : 'people'}` : 'Only you'
    }
    return `From ${nameOf(list.created_by)}`
  }

  const activeList = lists.find((l) => l.id === activeId)

  if (activeList) {
    return (
      <ListDetail
        list={activeList}
        kind={kind}
        access={accessFor(activeList, user.id)}
        members={members}
        onBack={() => setActiveId(null)}
        onListChange={handleListChange}
      />
    )
  }

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="fh-lists__toolbar">
        <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder={k.namePlaceholder} />
        <Button type="submit" icon="plus">
          Create
        </Button>
      </form>

      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && lists.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name={k.icon} size={22} />
          </span>
          <p className="fh-empty__title">No {k.noun}s yet</p>
          <p className="fh-empty__body">{k.emptyBody}</p>
        </div>
      )}

      {!loading && lists.length > 0 && (
        <>
          {k.combine && lists.length > 1 && (
            <div className="fh-lists__actions">
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
          )}

          <div className="fh-lists__grid">
            {lists.map((l) => {
              const access = accessFor(l, user.id)
              return (
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
                    <span className="fh-lists__combinebox">
                      <span className="fh-tick__box" style={selectedForCombine.includes(l.id) ? { background: 'var(--success)', borderColor: 'var(--success)', color: 'var(--white)' } : undefined}>
                        {selectedForCombine.includes(l.id) && <Icon name="check" size={16} />}
                      </span>
                    </span>
                  )}
                  <span className="fh-recipes__mark">
                    <Icon name={k.icon} size={18} />
                  </span>
                  <div>
                    <CardTitle>{l.name}</CardTitle>
                    <CardMeta>
                      {sharingMeta(l, access)}
                      {access !== 'owner' && (
                        <>
                          {' '}
                          <Badge>{PERMISSION_LABEL[access]}</Badge>
                        </>
                      )}
                    </CardMeta>
                    {!combineMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={canManage(access) ? 'trash-2' : 'log-out'}
                        style={{ marginTop: 'var(--sp-3)', color: 'var(--danger)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (canManage(access)) handleDeleteList(l.id)
                          else handleLeaveList(l.id)
                        }}
                      >
                        {canManage(access) ? 'Delete list' : 'Leave list'}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ListDetail({ list, kind, access, members, onBack, onListChange }) {
  const k = LIST_KINDS[kind]
  const { user, profile } = useAuth()
  const editable = canEdit(access)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newItem, setNewItem] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDue, setNewDue] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  // Only people who can see the list can be given something on it.
  const people = members.filter(
    (m) => m.id === list.created_by || list.list_shares?.some((s) => s.user_id === m.id)
  )
  const nameOf = (id) => {
    const m = members.find((x) => x.id === id)
    return m ? displayName(m) : null
  }

  function tellAssignee(item) {
    if (!item.assigned_to || item.assigned_to === user.id) return
    notify({
      userId: item.assigned_to,
      title: `${displayName(profile, user.email)} gave you a job`,
      body: `${item.name} (${list.name})`,
      url: `/lists/${kind}`,
    })
  }

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
      const saved = await addListItem(list.id, {
        name: newItem.trim(),
        amount: newAmount.trim() || null,
        assigned_to: newAssignee || null,
        due_date: newDue || null,
      })
      setItems((prev) => [...prev, saved])
      tellAssignee(saved)
      setNewItem('')
      setNewAmount('')
      setNewAssignee('')
      setNewDue('')
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

  async function handleSaveItem(item, fields) {
    const saved = await updateListItem(item.id, fields)
    setItems((prev) => prev.map((i) => (i.id === item.id ? saved : i)))
    if (saved.assigned_to !== item.assigned_to) tellAssignee(saved)
    setEditingItem(null)
  }

  async function handleUncheckAll() {
    setItems((prev) => prev.map((i) => ({ ...i, checked: false })))
    try {
      await uncheckAllItems(list.id)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearDone() {
    try {
      await deleteCheckedItems(list.id)
      setItems((prev) => prev.filter((i) => !i.checked))
    } catch (err) {
      setError(err.message)
    }
  }

  let unchecked = k.splitDone ? items.filter((i) => !i.checked) : items
  if (k.dueDates) unchecked = [...unchecked].sort(byDueDate)
  const checked = k.splitDone ? items.filter((i) => i.checked) : []
  const checkedCount = items.filter((i) => i.checked).length
  const itemProps = { editable, nameOf, onToggle: handleToggle, onDelete: handleDelete, onEdit: setEditingItem }

  return (
    <div>
      <Button variant="quiet" icon="chevron-left" style={{ marginBottom: 'var(--sp-6)' }} onClick={onBack}>
        All {k.title.toLowerCase()}
      </Button>

      <div className="fh-lists__head">
        <p className="fh-home__greet" style={{ font: 'var(--type-title-lg)' }}>{list.name}</p>
        {canManage(access) ? (
          <Button variant="quiet" icon="users" onClick={() => setShowShare(true)}>
            Share
          </Button>
        ) : (
          <Badge>{PERMISSION_LABEL[access]}</Badge>
        )}
      </div>

      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {editable && (
        <form onSubmit={handleAdd} className="fh-lists__add">
          <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={k.itemPlaceholder} />
          {k.amounts && (
            <Input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="Amount (optional)" style={{ flex: '0 0 140px' }} />
          )}
          <Button type="submit" icon="plus">
            Add
          </Button>
          {(k.assignees || k.dueDates) && (
            <div className="fh-lists__extras">
              {k.assignees && (
                <Select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} aria-label="Who's doing it">
                  <option value="">Anyone</option>
                  {people.map((m) => (
                    <option key={m.id} value={m.id}>
                      {displayName(m)}
                    </option>
                  ))}
                </Select>
              )}
              {k.dueDates && (
                <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} aria-label="Due date" />
              )}
            </div>
          )}
        </form>
      )}

      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name={k.icon} size={22} />
          </span>
          <p className="fh-empty__title">This list is empty</p>
          {editable && <p className="fh-empty__body">{k.emptyItemsBody}</p>}
        </div>
      )}

      {!loading && editable && k.resetAll && checkedCount > 0 && (
        <div className="fh-lists__actions">
          <Button variant="quiet" icon="rotate-ccw" onClick={handleUncheckAll}>
            Untick all ({checkedCount})
          </Button>
        </div>
      )}

      {!loading && unchecked.length > 0 && (
        <div className="fh-rows">
          {unchecked.map((item) => (
            <ListItem key={item.id} item={item} {...itemProps} />
          ))}
        </div>
      )}

      {!loading && checked.length > 0 && (
        <>
          <div className="fh-lists__group">
            <p className="fh-lists__grouplabel">
              {k.doneLabel} ({checked.length})
            </p>
            {editable && k.clearDone && (
              <Button variant="ghost" size="sm" icon="trash-2" onClick={handleClearDone}>
                Clear
              </Button>
            )}
          </div>
          <div className="fh-rows">
            {checked.map((item) => (
              <ListItem key={item.id} item={item} {...itemProps} />
            ))}
          </div>
        </>
      )}

      {editingItem && (
        <ItemSheet item={editingItem} k={k} people={people} onClose={() => setEditingItem(null)} onSave={handleSaveItem} />
      )}

      {showShare && (
        <ShareSheet list={list} kind={kind} members={members} onClose={() => setShowShare(false)} onListChange={onListChange} />
      )}
    </div>
  )
}

function ListItem({ item, editable, nameOf, onToggle, onDelete, onEdit }) {
  const assignee = item.assigned_to && nameOf(item.assigned_to)
  const overdue = item.due_date && !item.checked && item.due_date < toISODate(new Date())
  return (
    <TickRow
      checked={item.checked}
      onToggle={() => onToggle(item)}
      disabled={!editable}
      qty={item.amount}
      trail={
        editable && (
          <>
            <IconButton icon="pencil" label={`Edit ${item.name}`} onClick={() => onEdit(item)} />
            <IconButton icon="x" label={`Remove ${item.name}`} onClick={() => onDelete(item.id)} />
          </>
        )
      }
    >
      {item.name}
      {item.recipe_title && <span style={{ color: 'var(--ink-3)', font: 'var(--type-caption)' }}> ({item.recipe_title})</span>}
      {(assignee || item.due_date) && (
        <span className="fh-lists__itemmeta">
          {assignee}
          {assignee && item.due_date && ' · '}
          {item.due_date && (
            <span className={overdue ? 'fh-lists__overdue' : undefined}>
              {overdue ? 'Overdue: ' : 'Due '}
              {formatEventDate(item.due_date)}
            </span>
          )}
        </span>
      )}
    </TickRow>
  )
}

// Edit one item's details. Which fields show depends on the kind of list.
function ItemSheet({ item, k, people, onClose, onSave }) {
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(item.amount || '')
  const [assignee, setAssignee] = useState(item.assigned_to || '')
  const [due, setDue] = useState(item.due_date || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const fields = { name: name.trim() }
    if (k.amounts) fields.amount = amount.trim() || null
    if (k.assignees) fields.assigned_to = assignee || null
    if (k.dueDates) fields.due_date = due || null
    try {
      await onSave(item, fields)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Sheet
      title="Edit item"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="fh-item-form" loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}
      <form id="fh-item-form" onSubmit={handleSubmit} className="fh-lists__form">
        <Field label="Name" htmlFor="fh-item-name">
          <Input id="fh-item-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {k.amounts && (
          <Field label="Amount" htmlFor="fh-item-amount">
            <Input id="fh-item-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Optional" />
          </Field>
        )}
        {k.assignees && (
          <Field label="Who's doing it" htmlFor="fh-item-assignee">
            <Select id="fh-item-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Anyone</option>
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {k.dueDates && (
          <Field label="Due date" htmlFor="fh-item-due">
            <Input id="fh-item-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        )}
      </form>
    </Sheet>
  )
}

// Rename the list and choose who else can see it, and at what level.
// Changes save as they're made; there's no separate save for sharing.
function ShareSheet({ list, kind, members, onClose, onListChange }) {
  const { user, profile } = useAuth()
  const [name, setName] = useState(list.name)
  const [savingName, setSavingName] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const shares = list.list_shares || []
  const owner = members.find((m) => m.id === list.created_by)
  const others = members.filter((m) => m.id !== list.created_by)

  async function handleRename(e) {
    e.preventDefault()
    if (!name.trim() || name.trim() === list.name) return
    setSavingName(true)
    setError(null)
    try {
      await renameList(list.id, name.trim())
      onListChange({ ...list, name: name.trim() })
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingName(false)
    }
  }

  async function handlePermission(member, permission) {
    setBusyId(member.id)
    setError(null)
    const had = shares.some((s) => s.user_id === member.id)
    try {
      if (permission) {
        await setListShare(list.id, member.id, permission)
        const next = had
          ? shares.map((s) => (s.user_id === member.id ? { ...s, permission } : s))
          : [...shares, { user_id: member.id, permission }]
        onListChange({ ...list, list_shares: next })
        if (!had && member.id !== user.id) {
          notify({
            userId: member.id,
            title: `${displayName(profile, user.email)} shared a list with you`,
            body: list.name,
            url: `/lists/${kind}`,
          })
        }
      } else {
        await removeListShare(list.id, member.id)
        onListChange({ ...list, list_shares: shares.filter((s) => s.user_id !== member.id) })
        if (member.id === user.id) onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Sheet title="Share list" onClose={onClose}>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleRename} className="fh-lists__toolbar">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="List name" />
        <Button type="submit" variant="quiet" loading={savingName} disabled={!name.trim() || name.trim() === list.name}>
          Rename
        </Button>
      </form>

      <p className="fh-lists__grouplabel fh-lists__sharelabel">Who has access</p>
      <div className="fh-rows">
        <div className="fh-row fh-row--static">
          <span className="fh-row__body">
            <span className="fh-row__label">{owner ? displayName(owner) : 'Owner'}</span>
          </span>
          <span className="fh-row__trail">
            <Badge>Owner</Badge>
          </span>
        </div>
        {others.map((m) => {
          const current = shares.find((s) => s.user_id === m.id)?.permission ?? ''
          return (
            <div key={m.id} className="fh-row fh-row--static">
              <span className="fh-row__body">
                <span className="fh-row__label">
                  {displayName(m)}
                  {m.id === user.id && ' (you)'}
                </span>
              </span>
              <span className="fh-row__trail">
                <Select
                  value={current}
                  disabled={busyId === m.id}
                  aria-label={`Access for ${displayName(m)}`}
                  onChange={(e) => handlePermission(m, e.target.value)}
                >
                  <option value="">No access</option>
                  {PERMISSIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </span>
            </div>
          )
        })}
      </div>

      <p className="fh-lists__hint">
        {PERMISSIONS.map((p) => `${p.label}: ${p.hint.toLowerCase()}.`).join(' ')}
      </p>
    </Sheet>
  )
}
