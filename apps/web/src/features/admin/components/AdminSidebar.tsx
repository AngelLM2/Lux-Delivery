import { ArrowUpRight, LogOut, type LucideIcon } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { toast } from '../../../shared/stores/ui.store'
import { useAuthStore } from '../../auth/store'

export type AdminLink = {
  to: string
  label: string
  icon: LucideIcon
  /** Match the route exactly (index routes). */
  end?: boolean
}

const linkClass = ({ isActive }: { isActive: boolean }) => `admin-nav-link ${isActive ? 'active' : ''}`

export const AdminSidebar = ({ links }: { links: AdminLink[] }) => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = async () => {
    await logout()
    toast.info('Você saiu da sua conta.')
    navigate('/login')
  }

  return (
    <aside className="admin-sidebar">
      <Link to="/" className="admin-brand" aria-label="Lux Delivery: página inicial" title="Ir para a página inicial">
        <span className="admin-brand-name">LUX</span>
        <span className="admin-brand-tag">Admin</span>
      </Link>

      <nav className="admin-nav" aria-label="Painel administrativo">
        <span className="admin-nav-label">Gestão</span>
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <NavLink to="/" className="admin-nav-link admin-site-link">
          <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Ver site</span>
        </NavLink>
        {user && (
          <div className="admin-user">
            <span className="admin-user-avatar" aria-hidden="true">
              {user.full_name.charAt(0).toUpperCase()}
            </span>
            <div className="admin-user-info">
              <strong>{user.full_name}</strong>
              <span>{user.email}</span>
            </div>
            <button type="button" className="icon-action" onClick={() => void handleLogout()} aria-label="Sair" title="Sair">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
