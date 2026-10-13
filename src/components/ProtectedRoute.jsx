import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, requireRole }) {
  const { session, loading, profile, profileLoading, isApproved, role } = useAuth()
  const location = useLocation()

  if (loading || (session && profileLoading && !profile)) {
    return <p className="fh-loading">Loading…</p>
  }

  if (!session) {
    // Remember where they were heading (e.g. a game invite link with a
    // ?code=) so signing in lands them back there, not on Home.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!isApproved) {
    return <Navigate to="/pending" replace />
  }

  if (requireRole && role !== requireRole) {
    return <Navigate to="/" replace />
  }

  return children
}
