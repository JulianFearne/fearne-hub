import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { updateProfile, uploadAvatar } from './accountData'
import { subscribeToPush, unsubscribeFromPush } from './pushData'
import Card from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'
import Avatar from '../components/ds/Avatar.jsx'
import { Field, Input } from '../components/ds/Field.jsx'

export default function Settings() {
  const { user, profile, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState(profile?.notify_email ?? false)
  const [notifyPush, setNotifyPush] = useState(profile?.notify_push ?? false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSaveName(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ display_name: displayName.trim() || null })
      await refreshProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadAvatar(file)
      await refreshProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleToggleEmail() {
    const next = !notifyEmail
    setEmailBusy(true)
    setError(null)
    try {
      await updateProfile({ notify_email: next })
      setNotifyEmail(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleTogglePush() {
    setPushBusy(true)
    setError(null)
    try {
      if (notifyPush) {
        await unsubscribeFromPush()
        await updateProfile({ notify_push: false })
        setNotifyPush(false)
      } else {
        await subscribeToPush()
        await updateProfile({ notify_push: true })
        setNotifyPush(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <Card className="fh-settings__avatarcard">
        <Avatar name={displayName || user?.email} src={profile?.avatar_url} size="lg" />
        <div>
          <p className="fh-row__label" style={{ marginBottom: 'var(--sp-3)' }}>
            {user?.email}
          </p>
          <Button as="label" variant="quiet" size="sm" icon="camera" loading={uploading}>
            Change photo
            <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
          </Button>
        </div>
      </Card>

      <form onSubmit={handleSaveName} className="fh-settings__namerow">
        <Field label="Nickname" htmlFor="settings-name" hint="Shown instead of your email around the hub.">
          <Input
            id="settings-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user?.email}
          />
        </Field>
        <Button type="submit" loading={saving}>
          Save
        </Button>
      </form>

      <p className="fh-recipedetail__h">Notifications</p>
      <div className="fh-rows">
        <div className="fh-row fh-row--static">
          <span className="fh-row__lead">
            <Icon name="bell" size={18} />
          </span>
          <span className="fh-row__body">
            <span className="fh-row__label">Push notifications</span>
            <span className="fh-row__meta">Alerts on this device — e.g. a chore assigned to you.</span>
          </span>
          <span className="fh-row__trail">
            <Button variant={notifyPush ? 'primary' : 'quiet'} size="sm" loading={pushBusy} onClick={handleTogglePush}>
              {notifyPush ? 'On' : 'Turn on'}
            </Button>
          </span>
        </div>
        <div className="fh-row fh-row--static">
          <span className="fh-row__lead">
            <Icon name="mail" size={18} />
          </span>
          <span className="fh-row__body">
            <span className="fh-row__label">Email notifications</span>
            <span className="fh-row__meta">The same alerts, sent to {user?.email}.</span>
          </span>
          <span className="fh-row__trail">
            <Button variant={notifyEmail ? 'primary' : 'quiet'} size="sm" loading={emailBusy} onClick={handleToggleEmail}>
              {notifyEmail ? 'On' : 'Turn on'}
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}
