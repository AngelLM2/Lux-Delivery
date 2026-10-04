import { LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { FORM_ERROR_KEY, getApiErrorMessage, getErrorStatus, getFieldErrors } from '../../../shared/lib/errors'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { InputField } from '../../../shared/ui/Input'
import type { RedirectState } from '../components/ProtectedRoute'
import { useAuthStore } from '../store'

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  usePageMeta('Entrar')

  const redirectTo = (location.state as RedirectState | null)?.from

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setLoading(true)
    try {
      const user = await login({ email: email.trim(), password })
      setSuccess(true)
      const fallback = user.role === 'admin' ? '/admin' : '/menu'
      setTimeout(() => navigate(redirectTo ?? fallback, { replace: true }), 500)
    } catch (error) {
      const fields = getFieldErrors(error)
      setFieldErrors(fields)
      if (Object.keys(fields).length === 0 || fields[FORM_ERROR_KEY]) {
        setFormError(
          getErrorStatus(error) === 401
            ? 'E-mail ou senha incorretos.'
            : (fields[FORM_ERROR_KEY] ?? getApiErrorMessage(error)),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container page">
      <div className="card form-card reveal-on-load">
        <header style={{ marginBottom: '1rem' }}>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Bem-vindo de volta</p>
          <h1 className="h1" style={{ margin: 0 }}>Entrar</h1>
        </header>

        <p className="body-text" style={{ marginBottom: '1.5rem' }}>
          Acesse sua conta Lux Delivery para acompanhar e gerenciar seus pedidos.
        </p>

        {formError && <Alert tone="danger">{formError}</Alert>}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.1rem' }} noValidate>
          <InputField
            label="E-mail"
            type="email"
            icon={<Mail size={17} />}
            placeholder="voce@email.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            required
          />
          <InputField
            label="Senha"
            type="password"
            icon={<LockKeyhole size={17} />}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            required
          />
          <Button
            variant="primary"
            type="submit"
            isLoading={loading}
            isSuccess={success}
            disabled={!email.trim() || !password}
            style={{ marginTop: '0.5rem', width: '100%' }}
          >
            Entrar
          </Button>
        </form>

        <p className="caption" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          Ainda não tem conta?{' '}
          <Link to="/register" state={location.state} className="text-link">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}
