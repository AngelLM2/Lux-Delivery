import type { ProductRead } from '../../../shared/api/types'
import { clampText, formatCurrency } from '../../../shared/lib/formatters'
import { toast } from '../../../shared/stores/ui.store'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { useCartStore } from '../../cart/store'
import { productPlaceholder } from '../placeholder'

type ProductCardProps = {
  product: ProductRead
  categoryName?: string
}

export const ProductCard = ({ product, categoryName }: ProductCardProps) => {
  const addItem = useCartStore((state) => state.addItem)
  const soldOut = !product.is_available

  const handleAdd = () => {
    addItem({ product_id: product.id, name: product.name, price: product.price })
    toast.success(`${product.name} adicionado ao carrinho.`, 2200)
  }

  return (
    <article className={`card product-card ${soldOut ? 'is-sold-out' : ''}`} style={{ padding: 0 }} data-reveal>
      <div className="product-image">
        {soldOut ? (
          <span className="offer-badge sold-out-badge">Esgotado</span>
        ) : (
          product.is_offer && <span className="offer-badge">Oferta</span>
        )}
        <img src={product.image_url || productPlaceholder(product.name)} alt={product.name} loading="lazy" decoding="async" />
      </div>

      <div style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
        <div>
          <h3 className="h3" style={{ marginBottom: '0.25rem' }}>{product.name}</h3>
          <span className="category-pill">{categoryName || 'Sem categoria'}</span>
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
            disabled={soldOut}
            aria-label={soldOut ? `${product.name} esgotado` : `Adicionar ${product.name} ao carrinho`}
          >
            {soldOut ? 'Esgotado' : 'Adicionar'}
          </Button>
        </div>

        {product.is_offer && !soldOut && <Badge tone="success">Em promoção</Badge>}
      </div>
    </article>
  )
}
