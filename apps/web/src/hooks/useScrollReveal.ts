import { useEffect } from 'react'

export const useScrollReveal = (deps: unknown[] = []) => {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
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

    elements.forEach((el) => {
      if (el.dataset.stagger === 'true') {
        Array.from(el.children).forEach((child, index) => {
          const node = child as HTMLElement
          node.classList.add('scroll-reveal')
          node.style.transitionDelay = `${index * 80}ms`
          observer.observe(node)
        })
      } else {
        el.classList.add('scroll-reveal')
        observer.observe(el)
      }
    })

    return () => observer.disconnect()
  }, deps)
}
