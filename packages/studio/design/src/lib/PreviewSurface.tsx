import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PreviewSurface({
  framed = true,
  className,
  children,
}: {
  framed?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-background p-3 font-sans text-foreground',
        framed && 'border border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}
