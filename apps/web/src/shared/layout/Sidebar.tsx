import { ChevronLeft, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export type SidebarLink = {
  to: string
  label: string
  icon: LucideIcon
  /** Match the route exactly (index routes). */
  end?: boolean
}

type SidebarProps = {
  title: string
  links: SidebarLink[]
  backTo?: { to: string; label: string }
}

export const Sidebar = ({ title, links, backTo }: SidebarProps) => (
  <aside className="admin-sidebar" style={{ padding: '1.5rem 0', display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '0 1.5rem 1.5rem', borderBottom: '1px solid var(--color-line)', marginBottom: '1rem' }}>
      {backTo && (
        <NavLink
          to={backTo.to}
          className="admin-sidebar-back"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: 0, border: 0 }}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {backTo.label}
        </NavLink>
      )}
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.25rem', color: 'var(--color-ink)', margin: 0 }}>
        {title}
      </h1>
    </div>

    <nav aria-label={title} style={{ flex: 1, padding: '0 0.75rem' }}>
      {links.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? 'active' : '')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 500 }}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  </aside>
)
