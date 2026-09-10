import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import { displayName } from './accountData'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'
import Badge from '../components/ds/Badge.jsx'
import { Select } from '../components/ds/Field.jsx'
import Avatar from '../components/ds/Avatar.jsx'

const ROLES = ['admin', 'adult', 'kid']

export default function Admin() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setProfiles(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function setApproved(id, approved) {
    setBusyId(id)
    const { error } = await supabase.from('profiles').update({ approved }).eq('id', id)
    if (error) setError(error.message)
    else setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, approved } : p)))
    setBusyId(null)
  }

  async function setRole(id, role) {
    setBusyId(id)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) setError(error.message)
    else setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)))
    setBusyId(null)
  }

  const pending = profiles.filter((p) => !p.approved)
  const everyone = profiles

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}
      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && pending.length > 0 && (
        <>
          <p className="fh-recipedetail__h">Waiting for approval ({pending.length})</p>
          <div className="fh-recipes__grid" style={{ marginBottom: 'var(--sp-9)' }}>
            {pending.map((p) => (
              <Card key={p.id} tile>
                <div>
                  <CardTitle>{p.email}</CardTitle>
                  <CardMeta>Signed up {new Date(p.created_at).toLocaleDateString()}</CardMeta>
                </div>
                <Button loading={busyId === p.id} onClick={() => setApproved(p.id, true)}>
                  Approve
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}

      {!loading && (
        <>
          <p className="fh-recipedetail__h">Everyone ({everyone.length})</p>
          <div className="fh-rows">
            {everyone.map((p) => (
              <div key={p.id} className="fh-row fh-row--static">
                <Avatar name={displayName(p)} src={p.avatar_url} size="md" />
                <span className="fh-row__body">
                  <span className="fh-row__label">
                    {displayName(p)}
                    {p.id === user?.id && <span style={{ color: 'var(--ink-3)' }}> (you)</span>}
                  </span>
                  <span className="fh-row__meta">
                    <Badge tone={p.approved ? 'success' : 'warning'}>{p.approved ? 'Approved' : 'Pending'}</Badge>
                  </span>
                </span>
                <span className="fh-row__trail">
                  <Select
                    value={p.role}
                    disabled={busyId === p.id || p.id === user?.id}
                    onChange={(e) => setRole(p.id, e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                  {p.approved ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === p.id || p.id === user?.id}
                      onClick={() => setApproved(p.id, false)}
                      style={{ color: 'var(--danger)' }}
                    >
                      Revoke access
                    </Button>
                  ) : (
                    <Button size="sm" loading={busyId === p.id} onClick={() => setApproved(p.id, true)}>
                      Approve
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
