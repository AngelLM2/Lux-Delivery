import { useMemo, useRef } from 'react'
import type { CategoryRead, ProductRead } from '../../../shared/api/types'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { ProductCard } from './ProductCard'
import './menu.css'

type ProductGridProps = {
  products: ProductRead[]
  categories: CategoryRead[]
  /** Section shown on its own; `null` shows every category. */
  activeCategory: string | null
  onSelectCategory: (key: string | null) => void
  isLoading?: boolean
  /** Results being shown belong to the previous search while the new one loads. */
  isStale?: boolean
  /** Every page is loaded, so the per-section counts are exact. */
  isComplete?: boolean
}

type MenuSection = { key: string; title: string; products: ProductRead[] }

/** Groups the products by category, in the menu's category order. */
const groupByCategory = (products: ProductRead[], categories: CategoryRead[]): MenuSection[] => {
  const groups = new Map<number | null, ProductRead[]>()
  const known = new Set(categories.map((category) => category.id))
  for (const product of products) {
    const key = product.category_id != null && known.has(product.category_id) ? product.category_id : null
    groups.set(key, [...(groups.get(key) ?? []), product])
  }
  const sections: MenuSection[] = categories
    .filter((category) => groups.has(category.id))
    .map((category) => ({ key: String(category.id), title: category.name, products: groups.get(category.id) ?? [] }))
  const uncategorized = groups.get(null)
  if (uncategorized) sections.push({ key: 'outros', title: 'Outros', products: uncategorized })
  return sections
}

/** Height of the sticky navbar, read from the `--nav-height` CSS variable. */
const navHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 76

export const ProductGrid = ({
  products,
  categories,
  activeCategory,
  onSelectCategory,
  isLoading,
  isStale,
  isComplete,
}: ProductGridProps) => {
  const catalogRef = useRef<HTMLDivElement | null>(null)
  const sections = useMemo(() => groupByCategory(products, categories), [products, categories])
  // A search can leave the selected category without results: then every section is shown.
  const active = sections.some((section) => section.key === activeCategory) ? activeCategory : null
  const visible = active ? sections.filter((section) => section.key === active) : sections

  const select = (key: string | null) => {
    onSelectCategory(key)
    // From deep in the list, go back to the top of the catalog so the filtered list starts in view.
    const top = catalogRef.current?.getBoundingClientRect().top
    if (top !== undefined && top < navHeight()) {
      window.scrollTo({ top: window.scrollY + top - navHeight(), behavior: 'smooth' })
    }
  }

  if (isLoading) {
    return (
      <div className="menu-sections" aria-busy="true">
        <section className="menu-section">
          <Skeleton height={32} width={200} />
          <div className="product-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="product-card product-card-skeleton" key={index}>
                <div className="product-image skeleton" />
                <div className="product-body">
                  <Skeleton height={22} width="70%" />
                  <Skeleton height={14} />
                  <Skeleton height={14} width="55%" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  if (sections.length === 0) return null

  return (
    <div ref={catalogRef} className="menu-catalog">
      {sections.length > 1 && (
        <nav className="menu-tabs" aria-label="Filtrar por categoria">
          <div className="menu-tabs-list">
            <button type="button" className="menu-tab" aria-pressed={active === null} onClick={() => select(null)}>
              Todos
            </button>
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                className="menu-tab"
                aria-pressed={active === section.key}
                onClick={() => select(section.key)}
              >
                {section.title}
              </button>
            ))}
          </div>
        </nav>
      )}

      <div
        className="menu-sections"
        aria-busy={isStale || undefined}
        style={{ opacity: isStale ? 0.55 : 1, transition: 'opacity 0.25s ease' }}
      >
        {visible.map((section) => {
          const headingId = `secao-${section.key}-titulo`
          const count = section.products.length
          return (
            <section key={section.key} className="menu-section" aria-labelledby={headingId}>
              <header className="menu-section-head" data-reveal>
                <h2 id={headingId} className="menu-section-title">{section.title}</h2>
                {isComplete && (
                  <span className="menu-section-count">
                    {count} {count === 1 ? 'opção' : 'opções'}
                  </span>
                )}
              </header>
              <div className="product-grid" data-reveal data-stagger="true">
                {section.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
