import type { TopProduct } from '../../../shared/api/types'
import { formatCurrency, formatNumber } from '../../../shared/lib/formatters'

export const TopProductsList = ({ products }: { products: TopProduct[] }) => {
  if (products.length === 0) {
    return <p className="body-text">Nenhum produto vendido no período.</p>
  }

  return (
    <ol className="admin-mini-list is-ranked">
      {products.map((product) => (
        <li key={product.product_id} title={`${formatCurrency(product.revenue)} em vendas`}>
          <span className="admin-mini-label">{product.name}</span>
          <span className="admin-mini-value">{formatNumber(product.quantity)}</span>
        </li>
      ))}
    </ol>
  )
}
