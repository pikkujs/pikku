import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      },
      size: { default: 'h-10 px-5', sm: 'h-8 px-3', lg: 'h-12 px-7 text-base' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({ className, variant, size, asChild, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(variants({ variant, size }), className)} {...props} />
}
