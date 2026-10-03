import type { CSSProperties } from 'react'

type SpinnerProps = { size?: number; color?: string }

export const Spinner = ({ size = 20, color }: SpinnerProps) => {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.15)',
    borderTopColor: color ?? 'rgba(255, 255, 255, 0.8)',
    animation: 'spin 0.7s linear infinite',
  }

  return <span style={style} aria-label="Loading" />
}
