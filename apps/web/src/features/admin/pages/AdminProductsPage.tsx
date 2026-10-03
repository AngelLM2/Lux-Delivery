import { useMemo, useState } from 'react'
import type { ProductCreate, ProductRead } from '../../../shared/api/types'
import { useDebounce } from '../../../shared/hooks/useDebounce'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { formatCurrency } from '../../../shared/lib/formatters'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { InputField } from '../../../shared/ui/Input'
import { LoadMore } from '../../../shared/ui/LoadMore'
import { Modal } from '../../../shared/ui/Modal'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { ProductForm } from '../../catalog/components/ProductForm'
import { useAdminProducts, useArchiveProduct, useCategories, useRestoreProduct, useSaveProduct } from '../../catalog/hooks'

export const AdminProductsPage = () => {
  const [editing, setEditing] = useState<ProductRead | null>(null)
  // Bumped after a successful create so the (uncontrolled) form remounts empty.
  const [formVersion, setFormVersion] = useState(0)
  const [archiveTarget, setArchiveTarget] = useState<ProductRead | null>(null)
  const [search, setSearch] = useState('')
  const q = useDebounce(search.trim(), 350)

  const { data: categories = [] } = useCategories({ fresh: true })
  const productsQuery = useAdminProducts({ q })
  const saveProduct = useSaveProduct()
  const archiveProduct = useArchiveProduct()
  const restoreProduct = useRestoreProduct()

  usePageMeta('Produtos — Admin')

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])

  const handleSubmit = async (payload: ProductCreate, imageFile: File | null) => {
    await saveProduct.mutateAsync({ id: editing?.id, payload, imageFile })
    setEditing(null)
    setFormVersion((version) => version + 1)
  }

  const startEditing = (product: ProductRead) => {
    setEditing(product)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Catálogo</p>
        <h2 className="h1" style={{ margin: 0 }}>Produtos</h2>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        <div className="card">
          <h3 className="h3" style={{ margin: 0 }}>{editing ? `Editar "${editing.name}"` : 'Novo produto'}</h3>
          <ProductForm
            key={editing ? `edit-${editing.id}` : `new-${formVersion}`}
            categories={categories}
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={editing ? () => setEditing(null) : undefined}
          />
        </div>

        <div className="card" style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <InputField
            label="Buscar produto"
            type="search"
            maxLength={60}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {productsQuery.isPending ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={96} />)
          ) : productsQuery.isError ? (
            <Alert tone="danger">Não foi possível carregar os produtos.</Alert>
          ) : productsQuery.products.length === 0 ? (
            <EmptyState
              title={q ? 'Nenhum resultado' : 'Nenhum produto'}
              description={q ? `Nada encontrado para "${q}".` : 'Cadastre os primeiros itens do cardápio.'}
            />
          ) : (
            productsQuery.products.map((product) => {
              const archived = Boolean(product.archived_at)
              return (
                <div key={product.id} className={`admin-product-row ${archived ? 'is-archived' : ''}`}>
                  <div style={{ display: 'flex', gap: '1rem', minWidth: 0 }}>
                    <div className="admin-product-thumb">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" loading="lazy" />
                      ) : (
                        <span>Sem imagem</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: '0.25rem', alignContent: 'start', minWidth: 0 }}>
                      <strong>{product.name}</strong>
                      <span className="caption">
                        {product.category_id != null ? categoryNames.get(product.category_id) ?? 'Categoria removida' : 'Sem categoria'}
                      </span>
                      <span className="price-text" style={{ fontSize: '0.85rem' }}>{formatCurrency(product.price)}</span>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {archived && <Badge tone="neutral">Arquivado</Badge>}
                        {!archived && !product.is_available && <Badge tone="warning">Esgotado</Badge>}
                        {product.highlights && <Badge tone="info">Destaque</Badge>}
                        {product.is_offer && <Badge tone="success">Oferta</Badge>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexShrink: 0 }}>
                    {archived ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreProduct.mutate(product.id)}
                        isLoading={restoreProduct.isPending && restoreProduct.variables === product.id}
                      >
                        Restaurar
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => startEditing(product)}>
                          Editar
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setArchiveTarget(product)}>
                          Arquivar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}

          <LoadMore
            hasNextPage={productsQuery.hasNextPage}
            isFetchingNextPage={productsQuery.isFetchingNextPage}
            onLoadMore={() => void productsQuery.fetchNextPage()}
          />
        </div>
      </div>

      <Modal
        isOpen={archiveTarget !== null}
        title={`Arquivar "${archiveTarget?.name ?? ''}"?`}
        description="O produto sai do cardápio, mas continua nos pedidos antigos. Você pode restaurá-lo depois."
        onClose={() => setArchiveTarget(null)}
        onConfirm={() =>
          archiveTarget &&
          archiveProduct.mutate(archiveTarget.id, {
            onSettled: () => {
              if (editing?.id === archiveTarget.id) setEditing(null)
              setArchiveTarget(null)
            },
          })
        }
        confirmLabel="Arquivar"
        confirmVariant="danger"
        isConfirming={archiveProduct.isPending}
      />
    </div>
  )
}
