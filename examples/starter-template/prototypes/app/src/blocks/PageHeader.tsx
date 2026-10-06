import type { ReactNode } from 'react'

export const PageHeader = ({ title, text, actions }: { title: string; text?: string; actions?: ReactNode }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {text ? <p className="mt-1 max-w-prose text-muted-foreground">{text}</p> : null}
    </div>
    {actions ? <div className="flex gap-2">{actions}</div> : null}
  </header>
)
