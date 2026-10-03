import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { useCartStore } from '../../stores/cart.store'
import { useUiStore } from '../../stores/ui.store'

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const logout = useAuthStore((state) => state.logout)
  const toggleCart = useUiStore((state) => state.toggleCart)
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0))

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className={`lux-navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="lux-navbar-inner">
        {/* Brand */}
        <NavLink to="/" className="lux-brand">
          <span className="lux-brand-name">LUX</span>
          <span className="lux-brand-tag">Delivery</span>
        </NavLink>

        {/* Navigation */}
        <nav className="lux-nav">
          <NavLink to="/" className={({ isActive }) => `lux-nav-link ${isActive ? 'active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/menu" className={({ isActive }) => `lux-nav-link ${isActive ? 'active' : ''}`}>
            Cardapio
          </NavLink>
          {status === 'authenticated' && (
            <NavLink to="/orders" className={({ isActive }) => `lux-nav-link ${isActive ? 'active' : ''}`}>
              Pedidos
            </NavLink>
          )}
        </nav>

        {/* Actions */}
        <div className="lux-actions">
          <button type="button" className="lux-cart-btn" onClick={toggleCart}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 6h15l-1.5 9h-12L6 6z"/>
              <circle cx="9" cy="20" r="1"/>
              <circle cx="18" cy="20" r="1"/>
            </svg>
            {cartCount > 0 && <span className="lux-cart-count">{cartCount}</span>}
          </button>

          {status === 'authenticated' && user ? (
            <div className="lux-user-menu">
              <button type="button" className="lux-user-btn">
                <span className="lux-avatar">{user.full_name.charAt(0)}</span>
              </button>
              <div className="lux-dropdown">
                <button onClick={() => navigate('/profile')}>Perfil</button>
                {user.role === 'admin' && (
                  <button onClick={() => navigate('/admin')}>Admin</button>
                )}
                <button onClick={handleLogout}>Sair</button>
              </div>
            </div>
          ) : (
            <button type="button" className="lux-sign-btn" onClick={() => navigate('/login')}>
              Entrar
            </button>
          )}
        </div>
      </div>

      <style>{`
        .lux-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(8, 9, 12, 0.9);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          transition: background-color 0.3s ease, border-color 0.3s ease;
        }
        
        .lux-navbar.scrolled {
          background: rgba(8, 9, 12, 0.98);
        }
        
        .lux-navbar-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem 1.5rem;
          gap: 2rem;
        }
        
        .lux-brand {
          display: flex;
          flex-direction: column;
          text-decoration: none;
          gap: 2px;
        }
        
        .lux-brand-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.5rem;
          letter-spacing: 0.12em;
          color: #f5f5f7;
          line-height: 1;
        }
        
        .lux-brand-tag {
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #6b7280;
        }
        
        .lux-nav {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        
        .lux-nav-link {
          position: relative;
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9ca3af;
          text-decoration: none;
          padding: 0.5rem 0;
          transition: color 0.2s ease;
        }
        
        .lux-nav-link::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: 0;
          width: 0;
          height: 1px;
          background: #f5f5f7;
          transition: width 0.3s ease;
        }
        
        .lux-nav-link:hover,
        .lux-nav-link.active {
          color: #f5f5f7;
        }
        
        .lux-nav-link:hover::after,
        .lux-nav-link.active::after {
          width: 100%;
        }
        
        .lux-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .lux-cart-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f5f5f7;
          cursor: pointer;
          transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
          border-radius: 2px;
        }
        
        .lux-cart-btn:hover {
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.05);
        }
        
        .lux-cart-count {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f7;
          color: #08090c;
          font-size: 0.65rem;
          font-weight: 600;
          border-radius: 50%;
        }
        
        .lux-sign-btn {
          padding: 0.6rem 1.25rem;
          background: #f5f5f7;
          color: #08090c;
          border: none;
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition:
            background-color 0.2s ease,
            color 0.2s ease,
            transform 0.2s ease,
            box-shadow 0.2s ease;
          border-radius: 2px;
        }
        
        .lux-sign-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
        }
        
        .lux-user-menu {
          position: relative;
        }

        .lux-user-menu::after {
          content: '';
          position: absolute;
          top: 100%;
          right: 0;
          width: 160px;
          height: 10px;
        }
        
        .lux-user-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
        }
        
        .lux-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #f5f5f7;
          font-size: 0.85rem;
          font-weight: 500;
          border-radius: 50%;
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        
        .lux-user-btn:hover .lux-avatar {
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.15);
        }
        
        .lux-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 140px;
          background: #12161c;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.5rem;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateY(-4px);
          transition: opacity 0.2s ease, transform 0.2s ease;
          z-index: 50;
        }
        
        .lux-user-menu:hover .lux-dropdown,
        .lux-user-menu:focus-within .lux-dropdown {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translateY(0);
        }
        
        .lux-dropdown button {
          display: block;
          width: 100%;
          padding: 0.6rem 0.75rem;
          background: transparent;
          border: none;
          color: #9ca3af;
          font-size: 0.8rem;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        
        .lux-dropdown button:hover {
          color: #f5f5f7;
          background: rgba(255, 255, 255, 0.05);
        }
        
        @media (max-width: 768px) {
          .lux-navbar-inner {
            padding: 0.75rem 1rem;
          }
          
          .lux-nav {
            gap: 1.25rem;
          }
          
          .lux-nav-link {
            font-size: 0.7rem;
          }
        }
        
        @media (max-width: 500px) {
          .lux-nav {
            gap: 0.75rem;
          }
          
          .lux-sign-btn {
            padding: 0.5rem 0.75rem;
            font-size: 0.7rem;
          }
        }
      `}</style>
    </header>
  )
}
