import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { InputField } from '../../../components/ui/Input'
import { useAuthStore } from '../../../stores/auth.store'
import { getFieldErrors } from '../../../utils/errors'
import { usePageMeta } from '../../../hooks/usePageMeta'

export const LoginPage = () => {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  usePageMeta('Sign in — Lux Delivery')

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await login(email, password)
      setSuccess(true)
      const role = useAuthStore.getState().user?.role
      setTimeout(() => navigate(role === 'admin' ? '/admin' : '/menu'), 600)
    } catch (error) {
      setErrors(getFieldErrors(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container page">
      <div className="card form-card reveal-on-load">
        <header style={{ marginBottom: '1rem' }}>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Welcome back</p>
          <h1 className="h1" style={{ margin: 0 }}>Sign in</h1>
        </header>

        <p className="body-text" style={{ marginBottom: '1.5rem' }}>
          Access your Lux Delivery account to track and manage your orders.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <InputField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
          />
          <InputField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
          />
          <Button
            variant="primary"
            type="submit"
            isLoading={loading}
            isSuccess={success}
            style={{ marginTop: '0.5rem' }}
          >
            Sign in
          </Button>
        </form>

        <p className="caption" style={{ marginTop: '1.5rem' }}>
          New here? <Link to="/register" style={{ color: 'var(--color-ink)' }}>Create an account</Link>
        </p>
      </div>
    </div>
  )
}
