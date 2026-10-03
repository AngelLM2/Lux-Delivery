import { useState } from 'react'
import { useDebounce } from '../../../shared/hooks/useDebounce'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal'
import { Alert } from '../../../shared/ui/Alert'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { InputField } from '../../../shared/ui/Input'
import { ProductGrid } from '../components/ProductGrid'
import { useCategories, useProductList } from '../hooks'

export const MenuPage = () => {
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const q = useDebounce(search.trim(), 350)

  const { data: categories = [] } = useCategories()
  const productsQuery = useProductList({ categoryId, q })
  const { products } = productsQuery

  usePageMeta('Cardápio')
  useScrollReveal(`${products.length}-${categoryId}-${q}`)

  const isEmpty = !productsQuery.isPending && !productsQuery.isError && products.length === 0

  return (
    <div className="container page">
      <header style={{ marginBottom: '2rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Explore nossa seleção</p>
        <h1 className="h1" style={{ margin: 0 }}>Cardápio</h1>
      </header>

      <div style={{ marginBottom: '1.5rem', maxWidth: 320 }}>
        <InputField
          label="Buscar pratos"
          type="search"
          maxLength={60}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {productsQuery.isError && !productsQuery.data ? (
        <Alert tone="danger">Não foi possível carregar o cardápio. Tente novamente em instantes.</Alert>
      ) : (
        <ProductGrid
          products={products}
          categories={categories}
          activeCategoryId={categoryId}
          onSelectCategory={setCategoryId}
          onLoadMore={() => void productsQuery.fetchNextPage()}
          hasNextPage={productsQuery.hasNextPage}
          isLoading={productsQuery.isPending}
          isFetchingNextPage={productsQuery.isFetchingNextPage}
          isStale={productsQuery.isPlaceholderData}
          autoLoad
        />
      )}

      {isEmpty && (
        <EmptyState
          title="Nada por aqui ainda"
          description={
            q
              ? `Nenhum prato encontrado para "${q}".`
              : categoryId
                ? 'Esta categoria ainda não tem produtos.'
                : 'O cardápio está vazio no momento.'
          }
        />
      )}
    </div>
  )
}
