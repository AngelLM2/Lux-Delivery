import { useEffect, useMemo, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useProducts } from '../../hooks/useProducts'
import { clampText, formatCurrency } from '../../utils/formatters'
import { HomeSkeletonGrid } from './HomeSkeletonGrid'
import './home.css'

const HERO_BASE = 'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab'
const heroSrc = (width: number) => `${HERO_BASE}?auto=format&fit=crop&w=${width}&q=68`
const HERO_SRC = heroSrc(1280)
const HERO_SRCSET = `${heroSrc(640)} 640w, ${heroSrc(960)} 960w, ${heroSrc(1280)} 1280w, ${heroSrc(1600)} 1600w`

export const HomePage = () => {
  const navigate = useNavigate()
  const { products, productsQuery } = useProducts({ includeCategories: false, pageSize: 12 })

  usePageMeta('LUX - Delivery Premium')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const featuredProducts = useMemo(() => {
    return products.filter((product) => product.highlights)
  }, [products])

  // Preload the first product image as soon as we know it (helps LCP on slow connections)
  useEffect(() => {
    if (featuredProducts.length > 0 && featuredProducts[0].image_url) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = featuredProducts[0].image_url
      document.head.appendChild(link)
      return () => {
        document.head.removeChild(link)
      }
    }
  }, [featuredProducts])

  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-hero-bg">
          <img
            src={HERO_SRC}
            srcSet={HERO_SRCSET}
            sizes="100vw"
            width={1600}
            height={900}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            loading="eager"
          />
          <div className="home-hero-overlay" />
        </div>

        <div className="home-hero-content">
          <p className="home-kicker">Delivery premium</p>
          <h1 className="home-title">LUX</h1>
          <p className="home-subtitle">
            Pratos sofisticados entregues na sua porta com o cuidado que voce merece.
          </p>

          <button
            type="button"
            className="home-cta"
            onClick={() => navigate('/menu')}
          >
            <span>Ver cardapio</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>

      <section className="home-section">
        <div className="home-container">
          <header className="home-section-header">
            <div>
              <p className="home-kicker">Destaques</p>
              <h2 className="home-heading">Nossos produtos em destaque</h2>
            </div>
            <button
              type="button"
              className="home-link-btn"
              onClick={() => navigate('/menu')}
            >
              Ver tudo
            </button>
          </header>

          {productsQuery.isLoading ? (
            <HomeSkeletonGrid />
          ) : featuredProducts.length === 0 ? (
            <p className="home-empty-state">Ainda nao ha produtos cadastrados.</p>
          ) : (
            <div className="home-grid">
              {featuredProducts.map((product, index) => (
                <article
                  key={product.id}
                  className="home-card"
                  style={{ '--stagger': `${Math.min(index, 8) * 70}ms` } as CSSProperties}
                  onClick={() => navigate('/menu')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate('/menu')}
                >
                  <div className="home-card-image">
                    <img
                      src={product.image_url || 'https://via.placeholder.com/400x300?text=Sem+imagem'}
                      alt={product.name}
                      // First card is likely LCP; load eagerly with high priority.
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'low'}
                      decoding={index === 0 ? 'sync' : 'async'}
                    />
                    <span className="home-card-tag">{product.is_offer ? 'Oferta' : 'Destaque'}</span>
                  </div>
                  <div className="home-card-content">
                    <h3>{product.name}</h3>
                    <p className="home-card-description">
                      {clampText(product.short_description || product.description || 'Sem descricao', 80)}
                    </p>
                    {product.highlights && (
                      <p className="home-card-highlights">
                        Produto em destaque
                      </p>
                    )}
                    <div className="home-card-footer">
                      <span className="home-card-price">{formatCurrency(product.price)}</span>
                      <span className="home-card-action">Ver produto</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="home-cta-section" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 400px' }}>
        <div className="home-container">
          <div className="home-cta-card">
            <div className="home-cta-text">
              <h2>Pronto para pedir?</h2>
              <p>Explore nosso cardapio completo e faca seu pedido em poucos cliques.</p>
            </div>
            <button
              type="button"
              className="home-cta home-cta-light"
              onClick={() => navigate('/menu')}
            >
              <span>Acessar cardapio</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <footer className="home-footer" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 100px' }}>
        <div className="home-container">
          <div className="home-footer-content">
            <div className="home-footer-brand">
              <span className="home-footer-logo">LUX</span>
              <span className="home-footer-tagline">Delivery Premium</span>
            </div>
            <p className="home-footer-copy">Sabor e elegancia em cada entrega</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
