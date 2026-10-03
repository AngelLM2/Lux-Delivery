import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { useCartStore } from '../../stores/cart.store'
import type { ProductRead } from '../../api/types'
import { formatCurrency, clampText } from '../../utils/formatters'

type ProductCardProps = {
  product: ProductRead
  categoryName?: string
}

const buildPlaceholder = (name: string) => {
  const label = name.length > 18 ? `${name.slice(0, 18)}...` : name
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>
    <rect width='640' height='480' fill='%23101318'/>
    <rect x='0' y='0' width='640' height='480' fill='url(%23g)'/>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='%23141820'/>
        <stop offset='100%' stop-color='%230d1015'/>
      </linearGradient>
    </defs>
    <text x='40' y='250' fill='%23f3f4f6' font-size='28' font-family='system-ui, sans-serif' opacity='0.8'>${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const ProductCard = ({ product, categoryName }: ProductCardProps) => {
  const addItem = useCartStore((state) => state.addItem)

  const handleAdd = () => {
    addItem({
      product_id: product.id,
      name: product.name,
      price: product.price,
    })
  }

  return (
    <article className="card product-card" style={{ padding: 0 }} data-reveal>
      <div className="product-image">
        {product.is_offer && <span className="offer-badge">Special</span>}
        <img
          src={product.image_url || buildPlaceholder(product.name)}
          alt={product.name}
        />
      </div>

      <div style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
        <div>
          <h3 className="h3" style={{ marginBottom: '0.25rem' }}>{product.name}</h3>
          <span className="category-pill">{categoryName || 'Uncategorized'}</span>
        </div>

        <p className="body-text" style={{ margin: 0 }}>
          {clampText(product.short_description || product.description, 80)}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="price-text">{formatCurrency(product.price)}</span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAdd}
            aria-label={`Add ${product.name}`}
          >
            Add
          </Button>
        </div>

        {product.is_offer && <Badge tone="success">ON PROMO</Badge>}
      </div>
    </article>
  )
}
