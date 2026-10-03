import { useState } from 'react'
import { useAuthStore } from '../../stores/auth.store'
import { usersApi } from '../../api/users'
import { InputField } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { getFieldErrors } from '../../utils/errors'
import { usePageMeta } from '../../hooks/usePageMeta'

export const ProfilePage = () => {
  const user = useAuthStore((state) => state.user)
  const refreshProfile = useAuthStore((state) => state.refreshProfile)
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  usePageMeta('Profile — Lux Delivery')

  if (!user) {
    return (
      <div className="container page">
        <p className="body-text">Please sign in to edit your profile.</p>
      </div>
    )
  }

  const handleSave = async () => {
    if (!currentPassword) {
      setErrors({ actualy_password: 'Current password is required.' })
      return
    }
    if (newPassword && newPassword !== confirmPassword) {
      setErrors({ password_confirm: 'Passwords do not match.' })
      return
    }
    setLoading(true)
    setErrors({})
    try {
      await usersApi.updateMe({
        full_name: fullName,
        phone: phone || null,
        actualy_password: currentPassword,
        password: newPassword || null,
        password_confirm: newPassword ? confirmPassword : null,
      })
      await refreshProfile()
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 1200)
    } catch (error) {
      setErrors(getFieldErrors(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container page">
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Account settings</p>
        <h1 className="h1" style={{ margin: 0 }}>Profile</h1>
      </header>

      <div className="card" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{
            width: 56,
            height: 56,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--color-surface-soft)',
            border: '1px solid var(--color-line)',
          }}>
            <span style={{ fontSize: '1.25rem', color: 'var(--color-ink)' }}>
              {user.full_name[0].toUpperCase()}
            </span>
          </div>
          <div>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{user.full_name}</strong>
            <Badge tone="info">{user.role}</Badge>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <InputField
            label="Email"
            value={user.email}
            onChange={() => undefined}
            disabled
          />
          <InputField
            label="Full name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={errors.full_name}
          />
          <InputField
            label="Phone"
            value={phone || ''}
            onChange={(event) => setPhone(event.target.value)}
            error={errors.phone}
          />

          <div style={{ borderTop: '1px solid var(--color-line)', margin: '0.75rem 0', paddingTop: '0.75rem' }}>
            <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>Change password</span>
          </div>

          <InputField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            error={errors.actualy_password}
          />
          <InputField
            label="New password (optional)"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errors.password}
          />
          <InputField
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={errors.password_confirm}
          />

          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={loading}
            isSuccess={success}
            style={{ marginTop: '0.5rem' }}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}
