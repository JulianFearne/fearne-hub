import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

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
    <div className="auth-wrap">
      <h1>{mode === 'signin' ? 'Welcome back' : 'Join the family hub'}</h1>
      <p className="auth-sub">
        {mode === 'signin' ? 'Sign in to Fearne Hub.' : 'Create your family account.'}
      </p>

      {error && <div className="auth-error">{error}</div>}
      {checkEmail && (
        <div className="auth-error" style={{ background: '#eaf2ea', color: '#22402f' }}>
          Check your email to confirm your account. After that, a family admin will need to
          approve you before you can get into the hub.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="auth-toggle">
        {mode === 'signin' ? (
          <>
            New to the hub?{' '}
            <button onClick={() => { setMode('signup'); setError(null) }}>Create an account</button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button onClick={() => { setMode('signin'); setError(null) }}>Sign in</button>
          </>
        )}
      </div>
    </div>
  )
}
