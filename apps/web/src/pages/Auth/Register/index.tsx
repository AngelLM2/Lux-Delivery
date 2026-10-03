import { useState, type FormEvent, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { InputField } from '../../../components/ui/Input'
import { useAuthStore } from '../../../stores/auth.store'
import { getFieldErrors } from '../../../utils/errors'
import { passwordStrength } from '../../../utils/validators'
import { usePageMeta } from '../../../hooks/usePageMeta'

export const RegisterPage = () => {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  usePageMeta('Create account — Lux Delivery')

  const strength = passwordStrength(form.password)

  const handleChange = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await register({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        password: form.password,
        role: 'customer',
      })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 800)
    } catch (error) {
      setErrors(getFieldErrors(error))
    } finally {
      setLoading(false)
    }
  }

  const strengthColor = strength >= 3 ? 'var(--color-success)' : strength >= 2 ? 'var(--color-warning)' : 'var(--color-muted)'

  return (
    <div className="container page">
      <div className="card form-card reveal-on-load">
        <header style={{ marginBottom: '1rem' }}>
          <p className="kicker" style={{ marginBottom: '0.5rem' }}>Get started</p>
          <h1 className="h1" style={{ margin: 0 }}>Create your account</h1>
        </header>

        <p className="body-text" style={{ marginBottom: '1.5rem' }}>
          Join the Lux Delivery experience.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
          <InputField
            label="Full name"
            value={form.full_name}
            onChange={handleChange('full_name')}
            error={errors.full_name}
          />
          <InputField
            label="Email"
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            error={errors.email}
          />
          <InputField
            label="Phone (optional)"
            value={form.phone}
            onChange={handleChange('phone')}
            error={errors.phone}
          />
          <InputField
            label="Password"
            type="password"
            value={form.password}
            onChange={handleChange('password')}
            error={errors.password}
          />

          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              height: 4,
              background: 'var(--color-surface-soft)',
              border: '1px solid var(--color-line)',
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${(strength / 4) * 100}%`,
                  background: strengthColor,
                  transition: 'width 0.3s ease, background 0.3s ease',
                }}
              />
            </div>
            <span className="caption" style={{ marginTop: '0.25rem', display: 'block' }}>
              Password strength
            </span>
          </div>

          <Button
            variant="primary"
            type="submit"
            isLoading={loading}
            isSuccess={success}
            style={{ marginTop: '0.5rem' }}
          >
            Create account
          </Button>
        </form>

        <p className="caption" style={{ marginTop: '1.5rem' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--color-ink)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
