import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ToastContainer } from './components/ui/Toast'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { PageWrapper } from './components/layout/PageWrapper'
import { PageLoader } from './components/layout/PageLoader'
import { useAuthStore } from './stores/auth.store'
import { useUiStore } from './stores/ui.store'

const Navbar = lazy(() =>
  import('./components/layout/Navbar').then((module) => ({ default: module.Navbar })),
)
const CustomCursor = lazy(() =>
  import('./components/layout/CustomCursor').then((module) => ({ default: module.CustomCursor })),
)
const CartDrawer = lazy(() =>
  import('./components/cart/CartDrawer').then((module) => ({ default: module.CartDrawer })),
)

const HomePage = lazy(() => import('./pages/Home').then((module) => ({ default: module.HomePage })))
const LoginPage = lazy(() => import('./pages/Auth/Login').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazy(() =>
  import('./pages/Auth/Register').then((module) => ({ default: module.RegisterPage })),
)
const MenuPage = lazy(() => import('./pages/Menu').then((module) => ({ default: module.MenuPage })))
const OrdersPage = lazy(() => import('./pages/Orders').then((module) => ({ default: module.OrdersPage })))
const OrderDetailPage = lazy(() =>
  import('./pages/OrderDetail').then((module) => ({ default: module.OrderDetailPage })),
)
const NotificationsPage = lazy(() =>
  import('./pages/Notifications').then((module) => ({ default: module.NotificationsPage })),
)
const ProfilePage = lazy(() => import('./pages/Profile').then((module) => ({ default: module.ProfilePage })))
const AdminLayout = lazy(() =>
  import('./pages/Admin/AdminLayout').then((module) => ({ default: module.AdminLayout })),
)
const AdminDashboardPage = lazy(() =>
  import('./pages/Admin/Dashboard').then((module) => ({ default: module.AdminDashboardPage })),
)
const AdminOrdersPage = lazy(() =>
  import('./pages/Admin/Orders').then((module) => ({ default: module.AdminOrdersPage })),
)
const AdminProductsPage = lazy(() =>
  import('./pages/Admin/Products').then((module) => ({ default: module.AdminProductsPage })),
)
const AdminCategoriesPage = lazy(() =>
  import('./pages/Admin/Categories').then((module) => ({ default: module.AdminCategoriesPage })),
)
const AdminUsersPage = lazy(() =>
  import('./pages/Admin/Users').then((module) => ({ default: module.AdminUsersPage })),
)

const RouteFallback = () => (
  <div className="container page">
    <p className="body-text">Carregando...</p>
  </div>
)

const AnimatedRoutes = () => {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={(
            <PageWrapper>
              <HomePage />
            </PageWrapper>
          )}
        />
        <Route
          path="/login"
          element={(
            <PageWrapper>
              <LoginPage />
            </PageWrapper>
          )}
        />
        <Route
          path="/register"
          element={(
            <PageWrapper>
              <RegisterPage />
            </PageWrapper>
          )}
        />
        <Route
          path="/menu"
          element={(
            <PageWrapper>
              <MenuPage />
            </PageWrapper>
          )}
        />

        <Route element={<ProtectedRoute />}>
          <Route
            path="/orders"
            element={(
              <PageWrapper>
                <OrdersPage />
              </PageWrapper>
            )}
          />
          <Route
            path="/orders/:id"
            element={(
              <PageWrapper>
                <OrderDetailPage />
              </PageWrapper>
            )}
          />
          <Route
            path="/notifications"
            element={(
              <PageWrapper>
                <NotificationsPage />
              </PageWrapper>
            )}
          />
          <Route
            path="/profile"
            element={(
              <PageWrapper>
                <ProfilePage />
              </PageWrapper>
            )}
          />
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route
            path="/admin"
            element={(
              <PageWrapper>
                <AdminLayout />
              </PageWrapper>
            )}
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Routes>
    </AnimatePresence>
  )
}

const AppContent = () => {
  const boot = useAuthStore((state) => state.boot)
  const consumePendingToast = useUiStore((state) => state.consumePendingToast)
  const location = useLocation()
  const isHomeLanding = location.pathname === '/'

  useEffect(() => {
    boot()
    consumePendingToast()
  }, [boot, consumePendingToast])

  return (
    <div>
      <PageLoader />
      <Suspense fallback={null}>
        <CustomCursor />
      </Suspense>
      {!isHomeLanding && (
        <Suspense fallback={null}>
          <Navbar />
          <CartDrawer />
        </Suspense>
      )}
      <ToastContainer />
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <AnimatedRoutes />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
