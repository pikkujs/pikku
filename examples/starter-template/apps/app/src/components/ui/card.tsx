import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', {
  variants: {
    variant: {
      default: '',
      flush: 'pt-0',
      highlight: 'border-primary',
      interactive: 'cursor-pointer transition-colors hover:bg-accent/50',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function Card({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1.5 px-6', className)} {...props} />
}

const cardTitleVariants = cva('leading-none font-semibold', {
  variants: {
    size: {
      default: '',
      lg: 'text-2xl',
      heading: 'font-heading text-xl',
      display: 'font-heading text-3xl tracking-tight',
      hero: 'font-heading text-5xl tracking-tight',
      stat: 'text-3xl tabular-nums',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

function CardTitle({ className, size, ...props }: React.ComponentProps<'div'> & VariantProps<typeof cardTitleVariants>) {
  return <div data-slot="card-title" className={cn(cardTitleVariants({ size, className }))} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

const cardContentVariants = cva('px-6', {
  variants: {
    layout: {
      default: '',
      stack: 'flex flex-col gap-4',
      chips: 'flex flex-wrap items-center gap-2',
    },
    tone: {
      default: '',
      muted: 'text-sm text-muted-foreground',
    },
  },
  defaultVariants: {
    layout: 'default',
    tone: 'default',
  },
})

function CardContent({ className, layout, tone, ...props }: React.ComponentProps<'div'> & VariantProps<typeof cardContentVariants>) {
  return <div data-slot="card-content" className={cn(cardContentVariants({ layout, tone, className }))} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center px-6', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
