import { useEffect } from 'react'

/**
 * Fades `[data-reveal]` elements in as they enter the viewport. Re-scans the DOM whenever
 * `revealKey` changes (e.g. after a new page of products is rendered).
 */
export const useScrollReveal = (revealKey: unknown) => {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 },
    )

    const watch = (node: HTMLElement) => {
      if (node.classList.contains('is-visible')) return
      node.classList.add('scroll-reveal')
      observer.observe(node)
    }

    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      if (element.dataset.stagger === 'true') {
        Array.from(element.children).forEach((child, index) => {
          const node = child as HTMLElement
          node.style.transitionDelay = `${Math.min(index, 8) * 80}ms`
          watch(node)
        })
      } else {
        watch(element)
      }
    })

    return () => observer.disconnect()
  }, [revealKey])
}
