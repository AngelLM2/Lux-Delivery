import { FolderTree, LayoutDashboard, Package, ShoppingBag, Users } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Sidebar, type SidebarLink } from '../../shared/layout/Sidebar'

const ADMIN_LINKS: SidebarLink[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/orders', icon: ShoppingBag, label: 'Pedidos' },
  { to: '/admin/products', icon: Package, label: 'Produtos' },
  { to: '/admin/categories', icon: FolderTree, label: 'Categorias' },
  { to: '/admin/users', icon: Users, label: 'Usuários' },
]

export const AdminLayout = () => (
  <div className="admin-layout" style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
    <Sidebar title="Painel administrativo" links={ADMIN_LINKS} backTo={{ to: '/', label: 'Voltar ao site' }} />
    <main style={{ padding: '2rem', overflowY: 'auto', minWidth: 0 }}>
      <Outlet />
    </main>
  </div>
)
