import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loading } from '../../../shared/ui/Loading'
import { useAuthStore } from '../store'

export type RedirectState = { from?: string }

type ProtectedRouteProps = {
  adminOnly?: boolean
}

/** Gate for nested routes: anonymous users go to /login, non-admins are kept out of /admin. */
export const ProtectedRoute = ({ adminOnly = false }: ProtectedRouteProps) => {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const sessionEnd = useAuthStore((state) => state.sessionEnd)
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="container page">
        <Loading label="Verificando sua sessão..." />
      </div>
    )
  }

  if (status === 'anonymous' || !user) {
    // Expired session / direct visit: come back here after login. Explicit logout: start fresh,
    // otherwise the next person to sign in would land on the previous user's page.
    const state: RedirectState | undefined =
      sessionEnd === 'logout' ? undefined : { from: `${location.pathname}${location.search}` }
    return <Navigate to="/login" replace state={state} />
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
