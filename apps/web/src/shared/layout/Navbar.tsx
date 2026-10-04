import { Bell, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/store'
import { selectCartCount, useCartStore } from '../../features/cart/store'
import { useUnreadCount } from '../../features/notifications/hooks'
import { toast, useUiStore } from '../stores/ui.store'
import './navbar.css'

const navLinkClass = ({ isActive }: { isActive: boolean }) => `lux-nav-link ${isActive ? 'active' : ''}`

const badgeText = (count: number) => (count > 99 ? '99+' : String(count))

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated')
  const logout = useAuthStore((state) => state.logout)
  const toggleCart = useUiStore((state) => state.toggleCart)
  const cartCount = useCartStore(selectCartCount)
  const { data: unread = 0 } = useUnreadCount(isAuthenticated)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = async () => {
    await logout()
    toast.info('Você saiu da sua conta.')
    navigate('/login')
  }

  return (
    <header className={`lux-navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="lux-navbar-inner">
        <NavLink to="/" className="lux-brand" aria-label="Lux Delivery - início">
          <span className="lux-brand-name">LUX</span>
          <span className="lux-brand-tag">Delivery</span>
        </NavLink>

        <nav className="lux-nav" aria-label="Principal">
          <NavLink to="/" end className={(state) => `${navLinkClass(state)} lux-nav-home`}>
            Início
          </NavLink>
          <NavLink to="/menu" className={navLinkClass}>
            Cardápio
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/orders" className={navLinkClass}>
              Pedidos
            </NavLink>
          )}
        </nav>

        <div className="lux-actions">
          {isAuthenticated && (
            <NavLink
              to="/notifications"
              className="lux-cart-btn"
              aria-label={unread > 0 ? `Notificações: ${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Notificações'}
            >
              <Bell size={19} strokeWidth={1.5} aria-hidden="true" />
              {unread > 0 && <span className="lux-cart-count">{badgeText(unread)}</span>}
            </NavLink>
          )}

          <button
            type="button"
            className="lux-cart-btn"
            onClick={toggleCart}
            aria-label={cartCount > 0 ? `Carrinho: ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}` : 'Carrinho'}
          >
            <ShoppingBag size={19} strokeWidth={1.5} aria-hidden="true" />
            {cartCount > 0 && <span className="lux-cart-count">{badgeText(cartCount)}</span>}
          </button>

          {isAuthenticated && user ? (
            <div className="lux-user-menu">
              <button type="button" className="lux-user-btn" aria-label={`Menu de ${user.full_name}`} aria-haspopup="menu">
                <span className="lux-avatar">{user.full_name.charAt(0).toUpperCase()}</span>
              </button>
              <div className="lux-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => navigate('/profile')}>
                  Meu perfil
                </button>
                <button type="button" role="menuitem" onClick={() => navigate('/notifications')}>
                  Notificações
                </button>
                {user.role === 'admin' && (
                  <button type="button" role="menuitem" onClick={() => navigate('/admin')}>
                    Painel admin
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => void handleLogout()}>
                  Sair
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="lux-sign-btn" onClick={() => navigate('/login')}>
              Entrar
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
