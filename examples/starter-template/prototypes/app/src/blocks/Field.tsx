import type { ReactNode } from 'react'

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm font-medium">
    {label}
    {children}
  </label>
)
