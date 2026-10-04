import { Search } from 'lucide-react'
import { useState } from 'react'
import type { CategoryRead } from '../../../shared/api/types'
import { useDebounce } from '../../../shared/hooks/useDebounce'
import { usePageMeta } from '../../../shared/hooks/usePageMeta'
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal'
import { Alert } from '../../../shared/ui/Alert'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { InputField } from '../../../shared/ui/Input'
import { CartBar } from '../../cart/components/CartBar'
import { ProductGrid } from '../components/ProductGrid'
import { useCategories, useMenu } from '../hooks'
import './menu-page.css'

/** "Entradas, massas, sobremesas e vinhos." from the real category list. */
const describeCategories = (categories: CategoryRead[]) => {
  const names = categories.map((category, index) =>
    index === 0 ? category.name : category.name.charAt(0).toLocaleLowerCase('pt-BR') + category.name.slice(1),
  )
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}.`
}

export const MenuPage = () => {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const q = useDebounce(search.trim(), 350)

  const { data: categories = [] } = useCategories()
  const menu = useMenu(q)

  usePageMeta('Cardápio')
  useScrollReveal(`${menu.products.length}-${q}-${category}-${menu.isPending}`)

  const isEmpty = !menu.isPending && !menu.isError && menu.products.length === 0

  return (
    <div className="container page">
      <header className="menu-hero reveal-on-load">
        <div>
          <h1 className="menu-hero-title">Cardápio</h1>
          {categories.length > 1 && <p className="menu-hero-lede">{describeCategories(categories)}</p>}
        </div>
        <div className="menu-search">
          <InputField
            label="Buscar no cardápio"
            hideLabel
            type="search"
            placeholder="Buscar no cardápio"
            maxLength={60}
            icon={<Search size={18} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </header>

      {menu.isError && !menu.data ? (
        <Alert tone="danger">Não foi possível carregar o cardápio. Tente novamente em instantes.</Alert>
      ) : (
        <ProductGrid
          products={menu.products}
          categories={categories}
          activeCategory={category}
          onSelectCategory={setCategory}
          isLoading={menu.isPending}
          isStale={menu.isPlaceholderData}
          isComplete={menu.isComplete}
        />
      )}

      {/* The floating cart lives only where products are added. */}
      <CartBar />

      {isEmpty && (
        <EmptyState
          title={q ? 'Nada com esse nome' : 'Cardápio vazio'}
          description={q ? `Não achamos nenhum prato para "${q}". Tente outra palavra.` : 'Ainda não há pratos cadastrados.'}
        />
      )}
    </div>
  )
}
