import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'

export const ProtectedRoute = ({ adminOnly = false }: { adminOnly?: boolean }) => {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)

  if (status === 'loading') {
    return (
      <div className="container page">
        <p className="body-text">Checking your session...</p>
      </div>
    )
  }

  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
