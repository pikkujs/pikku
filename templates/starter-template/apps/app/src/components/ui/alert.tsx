import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { WithText } from '@/lib/i18n-props'

const alertVariants = cva('relative w-full rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      destructive: 'border-destructive/50 bg-card text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
})

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: WithText<React.ComponentProps<'div'>>) {
  return <div data-slot="alert-title" className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
}

function AlertDescription({ className, ...props }: WithText<React.ComponentProps<'div'>>) {
  return <div data-slot="alert-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
