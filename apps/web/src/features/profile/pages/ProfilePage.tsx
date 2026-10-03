import { useState, type FormEvent } from 'react'
import type { UserRead, UserUpdate } from '../../../shared/api/types'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { FORM_ERROR_KEY, getApiErrorMessage, getErrorCode, getFieldErrors } from '../../../shared/lib/errors'
import { formatRole } from '../../../shared/lib/formatters'
import { PASSWORD_HINT, isStrongPassword } from '../../../shared/lib/validators'
import { toast } from '../../../shared/stores/ui.store'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { InputField } from '../../../shared/ui/Input'
import { useAuthStore } from '../../auth/store'
import { profileApi } from '../api'

/** Only the fields that actually changed are sent (PATCH semantics). */
const buildPayload = (
  user: UserRead,
  form: { fullName: string; phone: string; currentPassword: string; newPassword: string; confirmPassword: string },
): UserUpdate => {
  const payload: UserUpdate = {}
  if (form.fullName.trim() !== user.full_name) payload.full_name = form.fullName.trim()
  if (form.phone.trim() !== (user.phone ?? '')) payload.phone = form.phone.trim() || null
  if (form.newPassword) {
    payload.current_password = form.currentPassword
    payload.password = form.newPassword
    payload.password_confirm = form.confirmPassword
  }
  return payload
}

export const ProfilePage = () => {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  usePageMeta('Meu perfil')

  if (!user) return null // ProtectedRoute guarantees a user; this only narrows the type.

  const validate = () => {
    const next: Record<string, string> = {}
    if (fullName.trim().length < 2) next.full_name = 'Informe seu nome completo.'
    if (newPassword) {
      // The current password is only required to change the password.
      if (!currentPassword) next.current_password = 'Informe a senha atual para alterar a senha.'
      if (!isStrongPassword(newPassword)) next.password = PASSWORD_HINT
      if (newPassword !== confirmPassword) next.password_confirm = 'As senhas não conferem.'
    }
    return next
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validate()
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    const payload = buildPayload(user, { fullName, phone, currentPassword, newPassword, confirmPassword })
    if (Object.keys(payload).length === 0) {
      toast.info('Nenhuma alteração para salvar.')
      return
    }

    setLoading(true)
    try {
      const updated = await profileApi.updateMe(payload)
      setUser(updated)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
      toast.success(payload.password ? 'Perfil e senha atualizados.' : 'Perfil atualizado.')
      setTimeout(() => setSuccess(false), 1200)
    } catch (error) {
      if (getErrorCode(error) === 'invalid_current_password') {
        setErrors({ current_password: 'Senha atual incorreta.' })
        return
      }
      const fields = getFieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0 || fields[FORM_ERROR_KEY]) {
        setFormError(fields[FORM_ERROR_KEY] ?? getApiErrorMessage(error))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container page">
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Configurações da conta</p>
        <h1 className="h1" style={{ margin: 0 }}>Meu perfil</h1>
      </header>

      <div className="card" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--color-surface-soft)',
              border: '1px solid var(--color-line)',
            }}
            aria-hidden="true"
          >
            <span style={{ fontSize: '1.25rem', color: 'var(--color-ink)' }}>
              {user.full_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{user.full_name}</strong>
            <Badge tone="info">{formatRole(user.role)}</Badge>
          </div>
        </div>

        {formError && <Alert tone="danger">{formError}</Alert>}

        <form onSubmit={handleSave} style={{ display: 'grid', gap: '0.75rem' }} noValidate>
          <InputField label="E-mail" value={user.email} readOnly disabled />
          <InputField
            label="Nome completo"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={errors.full_name}
          />
          <InputField
            label="Telefone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={errors.phone}
          />

          <div style={{ borderTop: '1px solid var(--color-line)', margin: '0.75rem 0', paddingTop: '0.75rem' }}>
            <span className="label" style={{ display: 'block' }}>Alterar senha (opcional)</span>
          </div>

          <InputField
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errors.password}
          />
          {newPassword && (
            <>
              <InputField
                label="Confirmar nova senha"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={errors.password_confirm}
              />
              <InputField
                label="Senha atual"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                error={errors.current_password}
              />
            </>
          )}

          <Button variant="primary" type="submit" isLoading={loading} isSuccess={success} style={{ marginTop: '0.5rem' }}>
            Salvar alterações
          </Button>
        </form>
      </div>
    </div>
  )
}
