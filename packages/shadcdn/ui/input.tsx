import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { WithLabels } from '@/lib/i18n-props'

const inputVariants = cva(
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-all outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  {
    variants: {
      layout: {
        default: '',
        floating: 'pt-4',
      },
    },
    defaultVariants: {
      layout: 'default',
    },
  }
)

function Input({ className, type, layout, ...props }: WithLabels<React.ComponentProps<'input'> & VariantProps<typeof inputVariants>>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        inputVariants({ layout }),
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className
      )}
      {...props}
    />
  )
}

export { Input }
