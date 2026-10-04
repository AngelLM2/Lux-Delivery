import { LockKeyhole, Phone, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { UserRead, UserUpdate } from '../../../shared/api/types'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { FORM_ERROR_KEY, getApiErrorMessage, getErrorCode, getFieldErrors } from '../../../shared/lib/errors'
import { formatRole } from '../../../shared/lib/formatters'
import { PASSWORD_HINT, isStrongPassword } from '../../../shared/lib/validators'
import { toast } from '../../../shared/stores/ui.store'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { InputField } from '../../../shared/ui/Input'
import { useAuthStore } from '../../auth/store'
import { profileApi } from '../api'
import '../profile.css'

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
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  usePageMeta('Meu perfil')

  if (!user) return null // ProtectedRoute guarantees a user; this only narrows the type.

  const payload = buildPayload(user, { fullName, phone, currentPassword, newPassword, confirmPassword })
  const hasChanges = Object.keys(payload).length > 0

  const resetPassword = () => {
    setChangingPassword(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setErrors((prev) => {
      const next = { ...prev }
      delete next.current_password
      delete next.password
      delete next.password_confirm
      return next
    })
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (fullName.trim().length < 2) next.full_name = 'Informe seu nome completo.'
    if (newPassword) {
      // The current password is only required to change the password.
      if (!currentPassword) next.current_password = 'Informe a senha atual.'
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
    if (Object.keys(clientErrors).length > 0 || !hasChanges) return

    setLoading(true)
    try {
      const updated = await profileApi.updateMe(payload)
      setUser(updated)
      resetPassword()
      toast.success(payload.password ? 'Dados e senha atualizados.' : 'Dados atualizados.')
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
    <div className="container page profile-page">
      <h1 className="profile-title">Meu perfil</h1>

      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <div>
          <strong>{user.full_name}</strong>
          <span>
            {user.email} · {formatRole(user.role)}
          </span>
        </div>
      </div>

      <form className="profile-form" onSubmit={handleSave} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        <section className="card profile-card" aria-labelledby="profile-data-title">
          <div className="profile-card-head">
            <h2 id="profile-data-title" className="h3">Dados pessoais</h2>
            <p className="caption">O e-mail é o seu login e não pode ser alterado aqui.</p>
          </div>
          <div className="profile-fields">
            <InputField
              label="Nome completo"
              autoComplete="name"
              icon={<UserRound size={17} />}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              error={errors.full_name}
            />
            <InputField
              label="Telefone"
              type="tel"
              autoComplete="tel"
              icon={<Phone size={17} />}
              placeholder="(11) 90000-0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              error={errors.phone}
            />
          </div>
        </section>

        <section className="card profile-card" aria-labelledby="profile-password-title">
          <div className="profile-card-head is-row">
            <div>
              <h2 id="profile-password-title" className="h3">Senha</h2>
              <p className="caption">Para trocar, confirme a senha atual.</p>
            </div>
            {changingPassword ? (
              <Button variant="ghost" size="sm" onClick={resetPassword}>
                Cancelar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setChangingPassword(true)}>
                Alterar senha
              </Button>
            )}
          </div>

          {changingPassword && (
            <div className="profile-fields">
              <InputField
                label="Senha atual"
                type="password"
                autoComplete="current-password"
                icon={<LockKeyhole size={17} />}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                error={errors.current_password}
                autoFocus
              />
              <span aria-hidden="true" />
              <InputField
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                icon={<LockKeyhole size={17} />}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                error={errors.password}
              />
              <InputField
                label="Confirmar nova senha"
                type="password"
                autoComplete="new-password"
                icon={<LockKeyhole size={17} />}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={errors.password_confirm}
              />
              {!errors.password && <p className="caption profile-hint">{PASSWORD_HINT}</p>}
            </div>
          )}
        </section>

        <div className="profile-actions">
          <Button variant="primary" type="submit" isLoading={loading} disabled={!hasChanges}>
            Salvar alterações
          </Button>
        </div>
      </form>
    </div>
  )
}
