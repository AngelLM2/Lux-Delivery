import { useEffect } from 'react'

const STAGGER_MS = 110
const MAX_STAGGER_STEPS = 6

const byDocumentOrder = (a: Element, b: Element) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1

/**
 * Reveals `[data-reveal]` elements (or their children, with `data-stagger`) as they enter the viewport,
 * one after another in document order: a 3-column row appears 1 → 2 → 3. Re-scans when `revealKey` changes. */
export const useScrollReveal = (revealKey: unknown) => {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const finish = (event: AnimationEvent) => {
      const node = event.currentTarget as HTMLElement
      // Child animations (shimmer, spinners) bubble up: only our own animation counts.
      if (event.target !== node) return
      node.removeEventListener('animationend', finish)
      node.classList.remove('scroll-reveal', 'is-visible')
      node.style.removeProperty('--reveal-delay')
      node.dataset.revealed = 'true'
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          .sort(byDocumentOrder)
          .forEach((node, index) => {
            observer.unobserve(node)
            node.style.setProperty('--reveal-delay', `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`)
            node.addEventListener('animationend', finish)
            node.classList.add('is-visible')
          })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )

    const watch = (node: HTMLElement) => {
      if (node.dataset.revealed === 'true' || node.classList.contains('is-visible')) return
      node.classList.add('scroll-reveal')
      observer.observe(node)
    }

    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      if (element.dataset.stagger === 'true') {
        Array.from(element.children).forEach((child) => watch(child as HTMLElement))
      } else {
        watch(element)
      }
    })

    return () => observer.disconnect()
  }, [revealKey])
}
