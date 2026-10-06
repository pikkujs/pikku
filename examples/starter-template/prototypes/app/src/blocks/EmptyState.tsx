import type { ReactNode } from 'react'

export const EmptyState = ({ title, text, children }: { title: string; text: string; children?: ReactNode }) => (
  <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-border p-8">
    <b className="text-lg">{title}</b>
    <p className="max-w-prose text-muted-foreground">{text}</p>
    {children}
  </div>
)
