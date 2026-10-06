import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn('h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
    {...props}
  />
)
