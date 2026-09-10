import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, requireRole }) {
  const { session, loading, profile, profileLoading, isApproved, role } = useAuth()

  if (loading || (session && profileLoading && !profile)) {
    return <p className="fh-loading">Loading…</p>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isApproved) {
    return <Navigate to="/pending" replace />
  }

  if (requireRole && role !== requireRole) {
    return <Navigate to="/" replace />
  }

  return children
}
