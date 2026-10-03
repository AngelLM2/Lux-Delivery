import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store'
import { ErrorBoundary } from '../shared/layout/ErrorBoundary'
import { PageLoader } from '../shared/layout/PageLoader'
import { Loading } from '../shared/ui/Loading'
import { ToastContainer } from '../shared/ui/Toast'
import { AppProviders } from './providers'
import { AppRoutes, ROUTER_FUTURE } from './router'

const Navbar = lazy(() => import('../shared/layout/Navbar').then((module) => ({ default: module.Navbar })))
const CustomCursor = lazy(() =>
  import('../shared/layout/CustomCursor').then((module) => ({ default: module.CustomCursor })),
)
const CartDrawer = lazy(() =>
  import('../features/cart/components/CartDrawer').then((module) => ({ default: module.CartDrawer })),
)

const RouteFallback = () => (
  <div className="container page">
    <Loading />
  </div>
)

const AppShell = () => {
  const boot = useAuthStore((state) => state.boot)
  const location = useLocation()
  const isHomeLanding = location.pathname === '/'

  useEffect(() => {
    void boot()
  }, [boot])

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
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

export const App = () => (
  <AppProviders>
    <BrowserRouter future={ROUTER_FUTURE}>
      <AppShell />
    </BrowserRouter>
  </AppProviders>
)
