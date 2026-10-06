import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground', className)} {...props} />
)
