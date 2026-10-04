import { Minus, Plus, Trash2 } from 'lucide-react'
import type { ProductRead } from '../../../shared/api/types'
import { clampText, formatCurrency } from '../../../shared/lib/formatters'
import { MAX_ITEM_QUANTITY, useCartStore } from '../../cart/store'
import { productPlaceholder } from '../placeholder'

type ProductCardProps = {
  product: ProductRead
}

export const ProductCard = ({ product }: ProductCardProps) => {
  const quantity = useCartStore((state) => state.items.find((item) => item.product_id === product.id)?.quantity ?? 0)
  const addItem = useCartStore((state) => state.addItem)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const soldOut = !product.is_available

  const add = () => addItem({ product_id: product.id, name: product.name, price: product.price })

  return (
    <article className={`product-card ${soldOut ? 'is-sold-out' : ''}`}>
      <div className="product-image">
        {soldOut ? (
          <span className="product-tag">Esgotado</span>
        ) : (
          product.is_offer && <span className="product-tag is-offer">Oferta</span>
        )}
        <img src={product.image_url || productPlaceholder(product.name)} alt={product.name} loading="lazy" decoding="async" />
      </div>

      <div className="product-body">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{clampText(product.short_description || product.description, 90)}</p>

        <div className="product-footer">
          <span className="price-text">{formatCurrency(product.price)}</span>
          {soldOut ? (
            <span className="product-unavailable">Indisponível</span>
          ) : quantity > 0 ? (
            <div className="menu-stepper" role="group" aria-label={`${product.name} no carrinho`}>
              <button
                type="button"
                onClick={() => updateQuantity(product.id, quantity - 1)}
                aria-label={quantity === 1 ? `Tirar ${product.name} do carrinho` : `Diminuir ${product.name}`}
              >
                {quantity === 1 ? <Trash2 size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
              </button>
              <span aria-live="polite">{quantity}</span>
              <button
                type="button"
                onClick={add}
                disabled={quantity >= MAX_ITEM_QUANTITY}
                aria-label={`Mais um ${product.name}`}
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button type="button" className="menu-add" onClick={add} aria-label={`Adicionar ${product.name} ao carrinho`}>
              <Plus size={16} aria-hidden="true" />
              Adicionar
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
