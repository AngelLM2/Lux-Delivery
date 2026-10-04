import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollReveal } from './useScrollReveal'

type Callback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void

/** Minimal IntersectionObserver whose callback the test triggers by hand. */
class FakeObserver {
  static current: FakeObserver
  observed = new Set<Element>()
  callback: Callback
  constructor(callback: Callback) {
    this.callback = callback
    FakeObserver.current = this
  }
  observe = (node: Element) => this.observed.add(node)
  unobserve = (node: Element) => this.observed.delete(node)
  disconnect = () => this.observed.clear()
  /** Reports these nodes as visible, in the given (arbitrary) order, in one batch. */
  show(nodes: Element[]) {
    act(() => this.callback(nodes.map((target) => ({ target, isIntersecting: true }))))
  }
}

const Grid = ({ count }: { count: number }) => {
  useScrollReveal(count)
  return (
    <div data-reveal data-stagger="true">
      {Array.from({ length: count }, (_, index) => (
        <article key={index} data-testid={`card-${index + 1}`} />
      ))}
    </div>
  )
}

const cards = (container: HTMLElement) => Array.from(container.querySelectorAll('article'))
const delays = (nodes: HTMLElement[]) => nodes.map((node) => node.style.getPropertyValue('--reveal-delay'))

describe('useScrollReveal', () => {
  beforeEach(() => vi.stubGlobal('IntersectionObserver', FakeObserver))
  afterEach(() => vi.unstubAllGlobals())

  it('hides the children until they enter the viewport', () => {
    const { container } = render(<Grid count={3} />)
    for (const card of cards(container)) {
      expect(card).toHaveClass('scroll-reveal')
      expect(card).not.toHaveClass('is-visible')
    }
  })

  it('reveals a row that enters together one by one, in document order', () => {
    const { container } = render(<Grid count={3} />)
    const [first, second, third] = cards(container)

    // The observer may report the row in any order: the stagger follows the layout, 1 → 2 → 3.
    FakeObserver.current.show([third, first, second])

    expect([first, second, third].every((card) => card.classList.contains('is-visible'))).toBe(true)
    expect(delays([first, second, third])).toEqual(['0ms', '110ms', '220ms'])
    expect(FakeObserver.current.observed.size).toBe(0)
  })

  it('restarts the stagger for the next row and caps long batches', () => {
    const { container } = render(<Grid count={12} />)
    const all = cards(container)

    FakeObserver.current.show(all.slice(0, 3))
    FakeObserver.current.show(all.slice(3, 12))

    expect(delays(all.slice(3, 6))).toEqual(['0ms', '110ms', '220ms'])
    expect(delays(all.slice(9, 12))).toEqual(['660ms', '660ms', '660ms'])
  })

  it('drops the reveal classes once its own animation ends, so hover transitions work again', () => {
    const { container } = render(<Grid count={1} />)
    const [card] = cards(container)
    FakeObserver.current.show([card])

    // A child animation bubbling up must not end the reveal early.
    const child = document.createElement('span')
    card.appendChild(child)
    child.dispatchEvent(new Event('animationend', { bubbles: true }))
    expect(card).toHaveClass('is-visible')

    card.dispatchEvent(new Event('animationend'))
    expect(card).not.toHaveClass('scroll-reveal')
    expect(card).not.toHaveClass('is-visible')
    expect(card.dataset.revealed).toBe('true')
  })
})
