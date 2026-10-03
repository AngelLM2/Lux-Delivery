import { AnimatePresence } from 'framer-motion'
import { lazy, type ComponentType, type ReactNode } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute'
import { PageWrapper } from '../shared/layout/PageWrapper'

/** Opt into React Router v7 behaviour now (silences the v6 deprecation warnings). */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const

/** `React.lazy` for named exports: every page is its own chunk. */
const lazyPage = <M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M & string) =>
  lazy(async () => ({ default: (await loader())[name] as ComponentType }))

const HomePage = lazyPage(() => import('../features/catalog/pages/HomePage'), 'HomePage')
const MenuPage = lazyPage(() => import('../features/catalog/pages/MenuPage'), 'MenuPage')
const LoginPage = lazyPage(() => import('../features/auth/pages/LoginPage'), 'LoginPage')
const RegisterPage = lazyPage(() => import('../features/auth/pages/RegisterPage'), 'RegisterPage')
const OrdersPage = lazyPage(() => import('../features/orders/pages/OrdersPage'), 'OrdersPage')
const OrderDetailPage = lazyPage(() => import('../features/orders/pages/OrderDetailPage'), 'OrderDetailPage')
const NotificationsPage = lazyPage(
  () => import('../features/notifications/pages/NotificationsPage'),
  'NotificationsPage',
)
const ProfilePage = lazyPage(() => import('../features/profile/pages/ProfilePage'), 'ProfilePage')
const AdminLayout = lazyPage(() => import('../features/admin/AdminLayout'), 'AdminLayout')
const DashboardPage = lazyPage(() => import('../features/admin/pages/DashboardPage'), 'DashboardPage')
const AdminOrdersPage = lazyPage(() => import('../features/admin/pages/AdminOrdersPage'), 'AdminOrdersPage')
const AdminProductsPage = lazyPage(() => import('../features/admin/pages/AdminProductsPage'), 'AdminProductsPage')
const AdminCategoriesPage = lazyPage(
  () => import('../features/admin/pages/AdminCategoriesPage'),
  'AdminCategoriesPage',
)
const AdminUsersPage = lazyPage(() => import('../features/admin/pages/AdminUsersPage'), 'AdminUsersPage')

const page = (element: ReactNode) => <PageWrapper>{element}</PageWrapper>

const NotFoundPage = () => (
  <div className="container page" style={{ textAlign: 'center' }}>
    <p className="kicker" style={{ marginBottom: '0.5rem' }}>Erro 404</p>
    <h1 className="h1">Página não encontrada</h1>
    <p className="body-text">O endereço acessado não existe ou foi movido.</p>
    <Link to="/" className="btn btn-outline" style={{ marginTop: '1rem' }}>
      Voltar ao início
    </Link>
  </div>
)

export const AppRoutes = () => {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={page(<HomePage />)} />
        <Route path="/login" element={page(<LoginPage />)} />
        <Route path="/register" element={page(<RegisterPage />)} />
        <Route path="/menu" element={page(<MenuPage />)} />

        <Route element={<ProtectedRoute />}>
          <Route path="/orders" element={page(<OrdersPage />)} />
          <Route path="/orders/:id" element={page(<OrderDetailPage />)} />
          <Route path="/notifications" element={page(<NotificationsPage />)} />
          <Route path="/profile" element={page(<ProfilePage />)} />
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="/admin" element={page(<AdminLayout />)}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
        </Route>

        <Route path="*" element={page(<NotFoundPage />)} />
      </Routes>
    </AnimatePresence>
  )
}
