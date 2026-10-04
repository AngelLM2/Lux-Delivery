import { Archive, ArchiveRestore, ImageOff, Pencil, Plus, Search } from 'lucide-react'
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
import { SelectField } from '../../../shared/ui/Select'
import { SidePanel } from '../../../shared/ui/SidePanel'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { ProductForm } from '../../catalog/components/ProductForm'
import { useAdminProducts, useArchiveProduct, useCategories, useRestoreProduct, useSaveProduct } from '../../catalog/hooks'
import { AdminPageHeader } from '../components/AdminPageHeader'

/** "25 produtos", or "50+ produtos" while more pages exist. */
const countLabel = (count: number, hasMore: boolean) => `${count}${hasMore ? '+' : ''} ${count === 1 ? 'produto' : 'produtos'}`

/** `null`: panel closed; `'new'`: create form; a product: edit form. */
type PanelState = null | 'new' | ProductRead

const ProductStatus = ({ product }: { product: ProductRead }) => {
  if (product.archived_at) return <span className="availability">Arquivado</span>
  return (
    <>
      {product.is_available ? (
        <span className="availability is-on">Disponível</span>
      ) : (
        <span className="availability is-warning">Esgotado</span>
      )}
      {product.highlights && <Badge tone="info">Destaque</Badge>}
      {product.is_offer && <Badge tone="info">Oferta</Badge>}
    </>
  )
}

export const AdminProductsPage = () => {
  const [panel, setPanel] = useState<PanelState>(null)
  const [archiveTarget, setArchiveTarget] = useState<ProductRead | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const q = useDebounce(search.trim(), 350)

  const { data: categories = [] } = useCategories({ fresh: true })
  const productsQuery = useAdminProducts({ q, categoryId: categoryFilter ? Number(categoryFilter) : null })
  const saveProduct = useSaveProduct()
  const archiveProduct = useArchiveProduct()
  const restoreProduct = useRestoreProduct()

  usePageMeta('Produtos — Admin')

  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const editing = panel !== null && panel !== 'new' ? panel : null
  const closePanel = () => setPanel(null)

  const handleSubmit = async (payload: ProductCreate, imageFile: File | null) => {
    // Errors propagate to ProductForm, which shows them and keeps the panel open.
    await saveProduct.mutateAsync({ id: editing?.id, payload, imageFile })
    closePanel()
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Produtos"
        meta={productsQuery.isPending ? undefined : countLabel(productsQuery.products.length, productsQuery.hasNextPage)}
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setPanel('new')}>
            Novo produto
          </Button>
        }
      />

      <section className="card admin-card admin-list-card">
        <div className="admin-toolbar">
          <div className="admin-toolbar-search">
            <InputField
              label="Buscar produto"
              hideLabel
              type="search"
              placeholder="Buscar produto..."
              icon={<Search size={17} />}
              maxLength={60}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="admin-toolbar-filter">
            <SelectField
              label="Filtrar por categoria"
              hideLabel
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Todas as categorias' },
                ...categories.map((category) => ({ value: String(category.id), label: category.name })),
              ]}
            />
          </div>
        </div>

        {productsQuery.isPending ? (
          <div className="admin-rows">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} height={64} />
            ))}
          </div>
        ) : productsQuery.isError ? (
          <Alert tone="danger">Não foi possível carregar os produtos.</Alert>
        ) : productsQuery.products.length === 0 ? (
          <EmptyState
            title={q || categoryFilter ? 'Nenhum resultado' : 'Nenhum produto'}
            description={q ? `Nada encontrado para "${q}".` : 'Cadastre os primeiros itens do cardápio.'}
          />
        ) : (
          <ul className="admin-rows" aria-label="Produtos">
            {productsQuery.products.map((product) => {
              const archived = Boolean(product.archived_at)
              return (
                <li key={product.id} className={`admin-row admin-product-grid ${archived ? 'is-muted' : ''}`}>
                  <span className="admin-thumb">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" loading="lazy" />
                    ) : (
                      <ImageOff size={18} aria-label="Sem imagem" />
                    )}
                  </span>
                  <span className="admin-row-main">
                    <strong>{product.name}</strong>
                    <span className="caption">
                      {product.category_id != null
                        ? (categoryNames.get(product.category_id) ?? 'Categoria removida')
                        : 'Sem categoria'}
                    </span>
                  </span>
                  <span className="price-text admin-row-price">{formatCurrency(product.price)}</span>
                  <span className="admin-row-badges">
                    <ProductStatus product={product} />
                  </span>
                  <span className="admin-row-actions">
                    {archived ? (
                      <button
                        type="button"
                        className="icon-action"
                        onClick={() => restoreProduct.mutate(product.id)}
                        disabled={restoreProduct.isPending && restoreProduct.variables === product.id}
                        aria-label={`Restaurar ${product.name}`}
                        title="Restaurar"
                      >
                        <ArchiveRestore size={17} aria-hidden="true" />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="icon-action"
                          onClick={() => setPanel(product)}
                          aria-label={`Editar ${product.name}`}
                          title="Editar"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-action is-danger"
                          onClick={() => setArchiveTarget(product)}
                          aria-label={`Arquivar ${product.name}`}
                          title="Arquivar"
                        >
                          <Archive size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <LoadMore
          hasNextPage={productsQuery.hasNextPage}
          isFetchingNextPage={productsQuery.isFetchingNextPage}
          onLoadMore={() => void productsQuery.fetchNextPage()}
        />
      </section>

      <SidePanel
        isOpen={panel !== null}
        title={editing ? 'Editar produto' : 'Novo produto'}
        description={editing ? editing.name : 'Preencha os dados do novo item do cardápio.'}
        onClose={closePanel}
      >
        <ProductForm
          key={editing ? `edit-${editing.id}` : 'new'}
          categories={categories}
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={closePanel}
        />
      </SidePanel>

      <Modal
        isOpen={archiveTarget !== null}
        title={`Arquivar "${archiveTarget?.name ?? ''}"?`}
        description="O produto sai do cardápio, mas continua nos pedidos antigos. Você pode restaurá-lo depois."
        onClose={() => setArchiveTarget(null)}
        onConfirm={() =>
          archiveTarget &&
          archiveProduct.mutate(archiveTarget.id, {
            onSettled: () => {
              if (editing?.id === archiveTarget.id) closePanel()
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
