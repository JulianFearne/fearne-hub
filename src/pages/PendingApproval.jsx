import { useAuth } from '../context/AuthContext.jsx'

export default function PendingApproval() {
  const { user, signOut } = useAuth()

  return (
    <div className="auth-wrap">
      <h1>You're almost in</h1>
      <p className="auth-sub">
        {user?.email} has signed up, but needs approval from a family admin before you can get into
        the hub. This is usually quick — check back shortly, or ask whoever manages the hub to
        approve you.
      </p>
      <button className="btn-primary" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  )
}
