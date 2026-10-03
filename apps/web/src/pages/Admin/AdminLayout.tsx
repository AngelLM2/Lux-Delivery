import { NavLink, Outlet } from 'react-router-dom'
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Package, 
  FolderTree, 
  Users,
  ChevronLeft
} from 'lucide-react'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/orders', icon: ShoppingBag, label: 'Pedidos' },
  { to: '/admin/products', icon: Package, label: 'Produtos' },
  { to: '/admin/categories', icon: FolderTree, label: 'Categorias' },
  { to: '/admin/users', icon: Users, label: 'Usuarios' },
]

export const AdminLayout = () => {
  return (
    <div className="admin-layout" style={{
      minHeight: '100vh',
      background: 'var(--color-bg)',
    }}>
      {/* Admin Sidebar */}
      <aside className="admin-sidebar" style={{
        padding: '1.5rem 0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '0 1.5rem 1.5rem',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '1rem',
        }}>
          <NavLink 
            to="/" 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--color-text-muted)',
              fontSize: '0.875rem',
              textDecoration: 'none',
              marginBottom: '1rem',
            }}
          >
            <ChevronLeft size={16} />
            Voltar ao site
          </NavLink>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.25rem',
            color: 'var(--color-text)',
            margin: 0,
          }}>
            Admin Panel
          </h1>
        </div>

        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '0.25rem',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                background: isActive ? 'var(--color-bg)' : 'transparent',
                transition: 'all 0.15s ease',
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{
        padding: '2rem',
        overflowY: 'auto',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
