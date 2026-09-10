import { useAuth } from '../context/AuthContext.jsx'
import Wordmark from '../components/ds/Wordmark.jsx'
import Card from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'

export default function PendingApproval() {
  const { user, signOut } = useAuth()

  return (
    <div className="fh-authscreen">
      <div className="fh-authscreen__inner">
        <Wordmark as="span" />
        <Card className="fh-authscreen__card">
          <h1>You're almost in</h1>
          <p className="fh-authscreen__sub">
            {user?.email} has signed up, but needs approval from a family admin before you can
            get into the hub. This is usually quick — check back shortly, or ask whoever manages
            the hub to approve you.
          </p>
          <Button variant="quiet" block onClick={() => signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    </div>
  )
}
