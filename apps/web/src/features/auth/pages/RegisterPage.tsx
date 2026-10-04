import { LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { FORM_ERROR_KEY, getApiErrorMessage, getFieldErrors } from '../../../shared/lib/errors'
import { PASSWORD_HINT, isStrongPassword, isValidEmail, passwordStrength } from '../../../shared/lib/validators'
import { toast } from '../../../shared/stores/ui.store'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { InputField } from '../../../shared/ui/Input'
import { useAuthStore } from '../store'

const STRENGTH_LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte']

type RegisterForm = { full_name: string; email: string; phone: string; password: string }

const validate = (form: RegisterForm) => {
  const errors: Record<string, string> = {}
  if (form.full_name.trim().length < 2) errors.full_name = 'Informe seu nome completo.'
  if (!isValidEmail(form.email)) errors.email = 'E-mail inválido.'
  if (!isStrongPassword(form.password)) errors.password = PASSWORD_HINT
  return errors
}

export const RegisterPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const register = useAuthStore((state) => state.register)
  const [form, setForm] = useState<RegisterForm>({ full_name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  usePageMeta('Criar conta')

  const strength = passwordStrength(form.password)
  const strengthColor =
    strength >= 4 ? 'var(--color-success)' : strength >= 2 ? 'var(--color-warning)' : 'var(--color-muted)'

  const handleChange = (field: keyof RegisterForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validate(form)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setLoading(true)
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
      })
      setSuccess(true)
      toast.success('Conta criada! Entre com seu e-mail e senha.')
      setTimeout(() => navigate('/login', { state: location.state }), 800)
    } catch (error) {
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
      <div className="card form-card reveal-on-load">
        <header style={{ marginBottom: '1rem' }}>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Comece agora</p>
          <h1 className="h1" style={{ margin: 0 }}>Crie sua conta</h1>
        </header>

        <p className="body-text" style={{ marginBottom: '1.5rem' }}>
          Faça parte da experiência Lux Delivery.
        </p>

        {formError && <Alert tone="danger">{formError}</Alert>}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.1rem' }} noValidate>
          <InputField
            label="Nome completo"
            autoComplete="name"
            icon={<UserRound size={17} />}
            value={form.full_name}
            onChange={handleChange('full_name')}
            error={errors.full_name}
          />
          <InputField
            label="E-mail"
            type="email"
            icon={<Mail size={17} />}
            placeholder="voce@email.com"
            autoComplete="email"
            value={form.email}
            onChange={handleChange('email')}
            error={errors.email}
          />
          <InputField
            label="Telefone (opcional)"
            type="tel"
            icon={<Phone size={17} />}
            placeholder="(11) 90000-0000"
            autoComplete="tel"
            value={form.phone}
            onChange={handleChange('phone')}
            error={errors.phone}
          />
          <InputField
            label="Senha"
            type="password"
            icon={<LockKeyhole size={17} />}
            autoComplete="new-password"
            value={form.password}
            onChange={handleChange('password')}
            error={errors.password}
          />

          <div style={{ marginBottom: '0.5rem' }}>
            <div
              className="strength-meter"
              role="meter"
              aria-label="Força da senha"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={strength}
            >
              <div style={{ width: `${(strength / 4) * 100}%`, background: strengthColor }} />
            </div>
            <span className="caption" style={{ marginTop: '0.5rem', display: 'block' }}>
              Força da senha: {STRENGTH_LABELS[strength]}. {PASSWORD_HINT}
            </span>
          </div>

          <Button variant="primary" type="submit" isLoading={loading} isSuccess={success} style={{ marginTop: '0.5rem', width: '100%' }}>
            Criar conta
          </Button>
        </form>

        <p className="caption" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          Já tem uma conta?{' '}
          <Link to="/login" state={location.state} className="text-link">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
