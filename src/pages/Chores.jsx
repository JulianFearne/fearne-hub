import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  FREQUENCIES,
  currentPeriodKey,
  fetchChores,
  createChore,
  deleteChore,
  completeChore,
  uncompleteChore,
  fetchFamilyMembers,
} from './choresData'
import Button from '../components/ds/Button.jsx'
import IconButton from '../components/ds/IconButton.jsx'
import Icon from '../components/ds/Icon.jsx'
import Badge from '../components/ds/Badge.jsx'
import { Input, Select } from '../components/ds/Field.jsx'
import TickRow from '../components/ds/TickRow.jsx'
import { Chip, ChipRow } from '../components/ds/Chip.jsx'

const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.id, f.label]))

export default function Chores() {
  const { user, isAdmin } = useAuth()
  const [chores, setChores] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('mine')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    Promise.all([fetchChores(), fetchFamilyMembers()])
      .then(([c, m]) => {
        setChores(c)
        setMembers(m)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  const memberEmail = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.email])), [members])

  async function handleCreate(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const created = await createChore({ title: title.trim(), assigned_to: assignedTo, frequency })
      setChores((prev) => [...prev, created])
      setTitle('')
      setAssignedTo('')
      setFrequency('daily')
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteChore(id)
      setChores((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggle(chore, done) {
    const period = currentPeriodKey(chore.frequency)
    setChores((prev) =>
      prev.map((c) => {
        if (c.id !== chore.id) return c
        const others = c.chore_completions.filter((x) => x.period_key !== period)
        return {
          ...c,
          chore_completions: done
            ? [...others, { completed_by: user.id, period_key: period, completed_at: new Date().toISOString() }]
            : others,
        }
      })
    )
    try {
      if (done) await completeChore(chore.id, chore.frequency)
      else await uncompleteChore(chore.id, chore.frequency)
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  const visible = chores.filter((c) => (filter === 'mine' ? !c.assigned_to || c.assigned_to === user?.id : true))

  const withStatus = visible.map((c) => {
    const period = currentPeriodKey(c.frequency)
    return { ...c, done: c.chore_completions.some((x) => x.period_key === period) }
  })

  const toDo = withStatus.filter((c) => !c.done)
  const done = withStatus.filter((c) => c.done)

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="fh-chores__toolbar">
        <ChipRow>
          <Chip active={filter === 'mine'} onClick={() => setFilter('mine')}>
            Mine
          </Chip>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            Everyone
          </Chip>
        </ChipRow>
        <Button icon="plus" onClick={() => setShowForm((v) => !v)}>
          Add chore
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="fh-chores__form">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />
          <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </Select>
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </form>
      )}

      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && withStatus.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name="list-checks" size={22} />
          </span>
          <p className="fh-empty__title">Nothing here</p>
          <p className="fh-empty__body">Add a chore above to get started.</p>
        </div>
      )}

      {!loading && toDo.length > 0 && (
        <div className="fh-rows">
          {toDo.map((chore) => (
            <ChoreRow
              key={chore.id}
              chore={chore}
              memberEmail={memberEmail}
              user={user}
              isAdmin={isAdmin}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {!loading && done.length > 0 && (
        <>
          <p className="fh-shop__group">Done ({done.length})</p>
          <div className="fh-rows">
            {done.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                memberEmail={memberEmail}
                user={user}
                isAdmin={isAdmin}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ChoreRow({ chore, memberEmail, user, isAdmin, onToggle, onDelete }) {
  const canDelete = isAdmin || chore.created_by === user?.id
  const assigneeLabel = chore.assigned_to ? memberEmail[chore.assigned_to] ?? '…' : 'Anyone'

  return (
    <TickRow
      checked={chore.done}
      onToggle={() => onToggle(chore, !chore.done)}
      trail={
        canDelete ? (
          <IconButton icon="trash-2" label={`Delete ${chore.title}`} onClick={() => onDelete(chore.id)} />
        ) : null
      }
    >
      {chore.title}
      <span className="fh-row__meta">
        {assigneeLabel} · <Badge>{FREQUENCY_LABEL[chore.frequency]}</Badge>
      </span>
    </TickRow>
  )
}
