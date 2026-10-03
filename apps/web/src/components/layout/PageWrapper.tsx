import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export const PageWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  )
}
