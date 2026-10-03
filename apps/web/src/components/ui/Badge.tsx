import type { ReactNode } from 'react'

type BadgeProps = {
  tone?: 'success' | 'error' | 'info' | 'warning' | 'neutral' | 'danger'
  children: ReactNode
  className?: string
}

export const Badge = ({ tone = 'info', children, className = '' }: BadgeProps) => {
  return <span className={`badge ${tone} ${className}`}>{children}</span>
}
