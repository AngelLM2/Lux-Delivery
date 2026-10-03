import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROUTER_FUTURE } from '../../../app/router'
import { makeUser } from '../../../test/fixtures'
import { useAuthStore } from '../store'
import { ProtectedRoute, type RedirectState } from './ProtectedRoute'

const LoginProbe = () => {
  const state = useLocation().state as RedirectState | null
  return <p>Página de login (voltar para {state?.from ?? '-'})</p>
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/" element={<p>Página inicial</p>} />
        <Route path="/login" element={<LoginProbe />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/orders" element={<p>Meus pedidos</p>} />
        </Route>
        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="/admin" element={<p>Painel admin</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'anonymous', user: null, sessionEnd: null })
  })

  it('redirects anonymous users to /login, remembering where they were going', () => {
    renderAt('/orders?tab=1')
    expect(screen.getByText('Página de login (voltar para /orders?tab=1)')).toBeInTheDocument()
    expect(screen.queryByText('Meus pedidos')).not.toBeInTheDocument()
  })

  it('does not carry the previous page over an explicit logout', () => {
    useAuthStore.setState({ status: 'anonymous', user: null, sessionEnd: 'logout' })
    renderAt('/orders')
    expect(screen.getByText('Página de login (voltar para -)')).toBeInTheDocument()
  })

  it('waits for the session check instead of redirecting too early', () => {
    useAuthStore.setState({ status: 'loading', user: null })
    renderAt('/orders')
    expect(screen.getByText('Verificando sua sessão...')).toBeInTheDocument()
  })

  it('lets authenticated customers into protected routes', () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser({ role: 'customer' }) })
    renderAt('/orders')
    expect(screen.getByText('Meus pedidos')).toBeInTheDocument()
  })

  it('sends non-admin users trying to open /admin back to the home page', () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser({ role: 'customer' }) })
    renderAt('/admin')
    expect(screen.getByText('Página inicial')).toBeInTheDocument()
    expect(screen.queryByText('Painel admin')).not.toBeInTheDocument()
  })

  it('allows admins into admin routes', () => {
    useAuthStore.setState({ status: 'authenticated', user: makeUser({ role: 'admin' }) })
    renderAt('/admin')
    expect(screen.getByText('Painel admin')).toBeInTheDocument()
  })
})
