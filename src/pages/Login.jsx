import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Wordmark from '../components/ds/Wordmark.jsx'
import Card from '../components/ds/Card.jsx'
import { Field, Input } from '../components/ds/Field.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error } =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password)

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

    if (mode === 'signup') {
      setCheckEmail(true)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="fh-authscreen">
      <div className="fh-authscreen__inner">
        <Wordmark as="span" />
        <Card className="fh-authscreen__card">
          <h1>{mode === 'signin' ? 'Welcome back' : 'Join the family hub'}</h1>
          <p className="fh-authscreen__sub">
            {mode === 'signin' ? 'Sign in to Fearne Hub.' : 'Create your family account.'}
          </p>

          {error && (
            <div className="fh-notice fh-notice--danger">
              <Icon name="alert-circle" size={16} />
              {error}
            </div>
          )}
          {checkEmail && (
            <div className="fh-notice fh-notice--success">
              <Icon name="check-circle" size={16} />
              Check your email to confirm your account. After that, a family admin will need to
              approve you before you can get into the hub.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </Field>
            <Button type="submit" block loading={submitting}>
              {submitting
                ? mode === 'signin'
                  ? 'Signing in…'
                  : 'Creating your account…'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>
          </form>

          <p className="fh-authscreen__toggle">
            {mode === 'signin' ? (
              <>
                New to the hub?{' '}
                <button type="button" onClick={() => { setMode('signup'); setError(null) }}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => { setMode('signin'); setError(null) }}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </Card>
      </div>
    </div>
  )
}
