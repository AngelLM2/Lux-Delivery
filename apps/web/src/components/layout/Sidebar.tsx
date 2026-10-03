import { NavLink } from 'react-router-dom'

const ADMIN_LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/users', label: 'Users' },
]

export const Sidebar = () => {
  return (
    <aside className="admin-sidebar">
      <h3>Admin Panel</h3>
      <nav>
        {ADMIN_LINKS.map((link) => (
          <NavLink
            key={link.to}
            className={({ isActive }) => (isActive ? 'active' : '')}
            to={link.to}
            end={link.end}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
