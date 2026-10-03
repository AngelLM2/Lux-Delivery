import type { TopProduct } from '../../../shared/api/types'
import { formatCurrency, formatNumber } from '../../../shared/lib/formatters'

export const TopProductsTable = ({ products }: { products: TopProduct[] }) => {
  if (products.length === 0) {
    return <p className="body-text">Nenhum produto vendido no período.</p>
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Produto</th>
          <th scope="col" className="numeric">Quantidade</th>
          <th scope="col" className="numeric">Receita</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product, index) => (
          <tr key={product.product_id}>
            <td className="caption">{index + 1}</td>
            <td>{product.name}</td>
            <td className="numeric">{formatNumber(product.quantity)}</td>
            <td className="numeric">{formatCurrency(product.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
