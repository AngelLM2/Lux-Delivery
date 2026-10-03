import { useEffect, useRef } from 'react'
import { Button } from './Button'

type LoadMoreProps = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  /** Also load automatically when the button scrolls into view (infinite scroll). */
  auto?: boolean
  label?: string
}

/** "Carregar mais" for cursor-paginated lists, optionally with infinite scroll. */
export const LoadMore = ({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  auto = false,
  label = 'Carregar mais',
}: LoadMoreProps) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!auto || !hasNextPage || isFetchingNextPage || !node) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { rootMargin: '240px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [auto, hasNextPage, isFetchingNextPage, onLoadMore])

  if (!hasNextPage) return null

  return (
    <div ref={sentinelRef} style={{ textAlign: 'center', marginTop: '1.5rem' }}>
      <Button variant="outline" onClick={onLoadMore} isLoading={isFetchingNextPage}>
        {isFetchingNextPage ? 'Carregando...' : label}
      </Button>
    </div>
  )
}
