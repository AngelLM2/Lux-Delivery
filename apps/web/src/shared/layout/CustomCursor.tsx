import { useEffect, useRef } from 'react'

export const CustomCursor = () => {
  const cursorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isTouch) return

    let targetX = -100
    let targetY = -100
    let currentX = -100
    let currentY = -100
    let frame = 0

    const move = (event: MouseEvent) => {
      targetX = event.clientX
      targetY = event.clientY
      cursorRef.current?.classList.add('visible')
    }

    const leave = () => {
      cursorRef.current?.classList.remove('visible')
    }

    const animate = () => {
      currentX += (targetX - currentX) * 0.2
      currentY += (targetY - currentY) * 0.2

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${currentX - 6}px, ${currentY - 6}px, 0)`
      }

      frame = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseleave', leave)
    frame = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseleave', leave)
      cancelAnimationFrame(frame)
    }
  }, [])

  return <div ref={cursorRef} className="custom-cursor" />
}
