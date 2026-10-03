import type { CSSProperties } from 'react'

type SkeletonProps = {
  height?: number | string
  width?: number | string
  radius?: number | string
}

export const Skeleton = ({ height = 16, width = '100%', radius = 0 }: SkeletonProps) => {
  const style: CSSProperties = { height, width, borderRadius: radius }
  return <div className="skeleton" style={style} />
}
