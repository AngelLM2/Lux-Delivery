import { useEffect, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { clampText, formatCurrency } from '../../../shared/lib/formatters'
import { useHighlightedProducts } from '../hooks'
import { productPlaceholder } from '../placeholder'
import { HomeSkeletonGrid } from './HomeSkeletonGrid'
import './home.css'

const HERO_BASE = 'https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab'
const heroSrc = (width: number) => `${HERO_BASE}?auto=format&fit=crop&w=${width}&q=68`
const HERO_SRC = heroSrc(1280)
const HERO_SRCSET = `${heroSrc(640)} 640w, ${heroSrc(960)} 960w, ${heroSrc(1280)} 1280w, ${heroSrc(1600)} 1600w`

export const HomePage = () => {
  const navigate = useNavigate()
  // Server-side filter, so highlights beyond the first page of the catalog are not missed.
  const { data: featuredProducts = [], isPending, isError } = useHighlightedProducts(6)

  usePageMeta('LUX - Delivery Premium')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Preload the first product image as soon as we know it (helps LCP on slow connections).
  const firstImage = featuredProducts[0]?.image_url
  useEffect(() => {
    if (!firstImage) return
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = firstImage
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [firstImage])

  const goToMenu = () => navigate('/menu')

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
            Pratos sofisticados entregues na sua porta com o cuidado que você merece.
          </p>

          <button type="button" className="home-cta" onClick={goToMenu}>
            <span>Ver cardápio</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <button type="button" className="home-link-btn" onClick={goToMenu}>
              Ver tudo
            </button>
          </header>

          {isPending ? (
            <HomeSkeletonGrid />
          ) : isError ? (
            <p className="home-empty-state">Não foi possível carregar os destaques agora.</p>
          ) : featuredProducts.length === 0 ? (
            <p className="home-empty-state">Ainda não há produtos em destaque.</p>
          ) : (
            <div className="home-grid">
              {featuredProducts.map((product, index) => (
                <article
                  key={product.id}
                  className="home-card"
                  style={{ '--stagger': `${Math.min(index, 8) * 70}ms` } as CSSProperties}
                  onClick={goToMenu}
                  role="link"
                  tabIndex={0}
                  aria-label={`${product.name}, ${formatCurrency(product.price)}. Ver no cardápio`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      goToMenu()
                    }
                  }}
                >
                  <div className="home-card-image">
                    <img
                      src={product.image_url || productPlaceholder(product.name)}
                      alt={product.name}
                      // First card is likely LCP; load eagerly with high priority.
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'low'}
                      decoding={index === 0 ? 'sync' : 'async'}
                    />
                    <span className="home-card-tag">
                      {!product.is_available ? 'Esgotado' : product.is_offer ? 'Oferta' : 'Destaque'}
                    </span>
                  </div>
                  <div className="home-card-content">
                    <h3>{product.name}</h3>
                    <p className="home-card-description">
                      {clampText(product.short_description || product.description || 'Sem descrição', 80)}
                    </p>
                    <p className="home-card-highlights">Produto em destaque</p>
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
              <p>Explore nosso cardápio completo e faça seu pedido em poucos cliques.</p>
            </div>
            <button type="button" className="home-cta home-cta-light" onClick={goToMenu}>
              <span>Acessar cardápio</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
            <p className="home-footer-copy">Sabor e elegância em cada entrega</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
