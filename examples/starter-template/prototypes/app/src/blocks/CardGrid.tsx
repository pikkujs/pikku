import type { ReactNode } from 'react'

export const CardGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
)
