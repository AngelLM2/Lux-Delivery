import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProducts } from '../../../hooks/useProducts'
import { productsApi } from '../../../api/products'
import { ProductForm } from '../../../components/product/ProductForm'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { formatCurrency } from '../../../utils/formatters'
import type { ProductCreate, ProductRead } from '../../../api/types'
import { usePageMeta } from '../../../hooks/usePageMeta'

export const AdminProductsPage = () => {
  const queryClient = useQueryClient()
  const { products, categories, createProduct, updateProduct, deleteProduct } = useProducts()
  const [editing, setEditing] = useState<ProductRead | null>(null)

  usePageMeta('Admin - Products')

  const handleSubmit = async (payload: ProductCreate, imageFile: File | null, id?: number) => {
    let savedProduct: ProductRead
    if (id) {
      savedProduct = await updateProduct({ id, payload })
      setEditing(null)
    } else {
      savedProduct = await createProduct(payload)
    }

    if (imageFile) {
      await productsApi.uploadImage(savedProduct.id, imageFile)
    }
    await queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Manage</p>
        <h2 className="h1" style={{ margin: 0 }}>Products</h2>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3 className="h3" style={{ margin: 0 }}>{editing ? 'Edit product' : 'New product'}</h3>
          <ProductForm
            categories={categories}
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        </div>

        <div className="card" style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          {products.length === 0 ? (
            <EmptyState title="No products" description="Add the first items to your menu." />
          ) : (
            products.map((product) => (
              <div
                key={product.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '0.75rem',
                  border: '1px solid var(--color-line)',
                  background: 'var(--color-surface-soft)',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      overflow: 'hidden',
                      border: '1px solid var(--color-line)',
                      flexShrink: 0,
                    }}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'var(--color-surface)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '0.65rem',
                          color: 'var(--color-faint)',
                          textAlign: 'center',
                          padding: '0.25rem',
                        }}
                      >
                        No image
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '0.25rem', alignContent: 'start' }}>
                    <strong>{product.name}</strong>
                    <span className="caption">{product.short_description}</span>
                    {product.highlights && (
                      <span className="badge badge-warning" style={{ alignSelf: 'start', fontSize: '0.65rem' }}>
                        ⭐ {product.highlights}
                      </span>
                    )}
                    <span className="price-text" style={{ fontSize: '0.85rem' }}>{formatCurrency(product.price)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <Button variant="outline" size="sm" onClick={() => setEditing(product)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteProduct(product.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
