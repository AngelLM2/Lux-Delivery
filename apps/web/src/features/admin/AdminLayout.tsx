import { FolderTree, LayoutDashboard, Package, ShoppingBag, Users } from 'lucide-react'
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Loading } from '../../shared/ui/Loading'
import { AdminSidebar, type AdminLink } from './components/AdminSidebar'
import './admin.css'

const ADMIN_LINKS: AdminLink[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/orders', icon: ShoppingBag, label: 'Pedidos' },
  { to: '/admin/products', icon: Package, label: 'Produtos' },
  { to: '/admin/categories', icon: FolderTree, label: 'Categorias' },
  { to: '/admin/users', icon: Users, label: 'Usuários' },
]

export const AdminLayout = () => (
  <div className="admin-shell">
    <AdminSidebar links={ADMIN_LINKS} />
    <main className="admin-main">
      <div className="admin-content">
        {/* Only the content waits for a section's code to load; the sidebar never blinks. */}
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </div>
    </main>
  </div>
)
