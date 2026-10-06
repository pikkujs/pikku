import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-xl border border-border bg-card text-card-foreground p-5', className)} {...props} />
)
