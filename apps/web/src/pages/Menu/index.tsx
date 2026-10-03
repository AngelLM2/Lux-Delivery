import { useMemo, useRef, useEffect, useState } from 'react'
import { useProducts } from '../../hooks/useProducts'
import { ProductGrid } from '../../components/product/ProductGrid'
import { InputField } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/EmptyState'
import { useDebounce } from '../../hooks/useDebounce'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useScrollReveal } from '../../hooks/useScrollReveal'

export const MenuPage = () => {
  const { products, categories, productsQuery } = useProducts()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  usePageMeta('Menu — Lux Delivery')
  useScrollReveal([products.length, categoryId, debounced])

  const filtered = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = categoryId ? product.category_id === categoryId : true
      const matchesSearch = debounced
        ? product.name.toLowerCase().includes(debounced.toLowerCase())
        : true
      return matchesCategory && matchesSearch
    })
  }, [products, categoryId, debounced])
  const hasNoMatches = filtered.length === 0 && !productsQuery.isLoading

  useEffect(() => {
    const isMobile = window.innerWidth < 768
    if (!isMobile) return
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && productsQuery.hasNextPage) {
          productsQuery.fetchNextPage()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [productsQuery])

  return (
    <div className="container page">
      <header style={{ marginBottom: '2rem' }}>
        <p className="kicker" style={{ marginBottom: '0.5rem' }}>Explore our selection</p>
        <h1 className="h1" style={{ margin: 0 }}>Menu</h1>
      </header>

      <div style={{ marginBottom: '1.5rem', maxWidth: 320 }}>
        <InputField
          label="Search dishes"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <ProductGrid
        products={filtered}
        categories={categories}
        activeCategoryId={categoryId}
        onSelectCategory={setCategoryId}
        onLoadMore={() => productsQuery.fetchNextPage()}
        hasNextPage={productsQuery.hasNextPage}
        isLoading={productsQuery.isLoading}
        isFetchingNextPage={productsQuery.isFetchingNextPage}
      />

      {hasNoMatches && (
        <EmptyState
          title="Nothing here yet"
          description={
            categoryId
              ? 'This category has no products yet.'
              : 'No items match your filters.'
          }
        />
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  )
}
