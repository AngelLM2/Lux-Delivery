import type { CategoryRead, ProductRead } from '../../api/types'
import { ProductCard } from './ProductCard'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'

type ProductGridProps = {
  products: ProductRead[]
  categories: CategoryRead[]
  activeCategoryId?: number | null
  onSelectCategory?: (id: number | null) => void
  onLoadMore?: () => void
  hasNextPage?: boolean
  isLoading?: boolean
  isFetchingNextPage?: boolean
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
}: ProductGridProps) => {
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]))

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div className="filter-pills" data-reveal>
        <button
          className={`filter-pill ${!activeCategoryId ? 'active' : ''}`}
          onClick={() => onSelectCategory?.(null)}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`filter-pill ${activeCategoryId === category.id ? 'active' : ''}`}
            onClick={() => onSelectCategory?.(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="product-grid">
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
        <div className="product-grid" data-reveal data-stagger="true">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={categoryMap.get(product.category_id || -1)}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div style={{ textAlign: 'center' }}>
          <Button variant="outline" onClick={onLoadMore} isLoading={isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
