import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'

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
      <div className="hub-intro">
        <h1>Family Admin</h1>
        <p>Approve new sign-ups and manage everyone's role.</p>
      </div>

      {error && <div className="rb-form-error">{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading && pending.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12 }}>Waiting for approval ({pending.length})</h3>
          <div className="pin-grid" style={{ marginBottom: 32 }}>
            {pending.map((p) => (
              <div key={p.id} className="pin-card" style={{ cursor: 'default' }}>
                <span className="pin-dot" />
                <h3>{p.email}</h3>
                <p>Signed up {new Date(p.created_at).toLocaleDateString()}</p>
                <button
                  className="btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={busyId === p.id}
                  onClick={() => setApproved(p.id, true)}
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && (
        <>
          <h3 style={{ marginBottom: 12 }}>Everyone ({everyone.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {everyone.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  background: 'var(--cream-card)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '12px 16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <strong>{p.email}</strong>
                  {p.id === user?.id && <span style={{ opacity: 0.6 }}> (you)</span>}
                </div>

                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: 20,
                    background: p.approved ? '#e4f0e4' : '#fdf3d7',
                    color: p.approved ? '#2d4a31' : '#7a5c10',
                  }}
                >
                  {p.approved ? 'Approved' : 'Pending'}
                </span>

                <select
                  value={p.role}
                  disabled={busyId === p.id || p.id === user?.id}
                  onChange={(e) => setRole(p.id, e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)' }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {p.approved ? (
                  <button
                    className="rb-delete-btn"
                    disabled={busyId === p.id || p.id === user?.id}
                    onClick={() => setApproved(p.id, false)}
                  >
                    Revoke access
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    style={{ width: 'auto', padding: '8px 16px' }}
                    disabled={busyId === p.id}
                    onClick={() => setApproved(p.id, true)}
                  >
                    Approve
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
