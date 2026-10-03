import { useMemo } from 'react'
import type { CategoryRead, ProductRead } from '../../../shared/api/types'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { ProductCard } from './ProductCard'

type ProductGridProps = {
  products: ProductRead[]
  categories: CategoryRead[]
  activeCategoryId?: number | null
  onSelectCategory?: (id: number | null) => void
  onLoadMore: () => void
  hasNextPage: boolean
  isLoading?: boolean
  isFetchingNextPage: boolean
  /** Results being shown belong to the previous filter while the new one loads. */
  isStale?: boolean
  autoLoad?: boolean
}

export const ProductGrid = ({
  products,
  categories,
  activeCategoryId,
  onSelectCategory,
  onLoadMore,
  hasNextPage,
  isLoading,
  isFetchingNextPage,
  isStale,
  autoLoad,
}: ProductGridProps) => {
  const categoryNames = useMemo(() => new Map(categories.map((cat) => [cat.id, cat.name])), [categories])

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div className="filter-pills" role="group" aria-label="Filtrar por categoria" data-reveal>
        <button
          type="button"
          className={`filter-pill ${!activeCategoryId ? 'active' : ''}`}
          aria-pressed={!activeCategoryId}
          onClick={() => onSelectCategory?.(null)}
        >
          Todos
        </button>
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            className={`filter-pill ${activeCategoryId === category.id ? 'active' : ''}`}
            aria-pressed={activeCategoryId === category.id}
            onClick={() => onSelectCategory?.(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="product-grid" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="card" key={index} style={{ padding: 0 }}>
              <Skeleton height={200} />
              <div style={{ padding: '1rem', display: 'grid', gap: '0.5rem' }}>
                <Skeleton height={20} width="70%" />
                <Skeleton height={14} width="50%" />
                <Skeleton height={14} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="product-grid"
          data-reveal
          data-stagger="true"
          aria-busy={isStale || undefined}
          style={{ opacity: isStale ? 0.55 : 1, transition: 'opacity 0.2s ease' }}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={product.category_id != null ? categoryNames.get(product.category_id) : undefined}
            />
          ))}
        </div>
      )}

      <LoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
        auto={autoLoad}
        label="Carregar mais pratos"
      />
    </div>
  )
}
