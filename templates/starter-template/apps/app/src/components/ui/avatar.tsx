import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const avatarVariants = cva('relative flex size-8 shrink-0 overflow-hidden rounded-full', {
  variants: {
    border: {
      none: '',
      stack: 'border-2 border-background',
      cover: 'border-4 border-card',
    },
  },
  defaultVariants: {
    border: 'none',
  },
})

function Avatar({ className, border, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarVariants>) {
  return <AvatarPrimitive.Root data-slot="avatar" className={cn(avatarVariants({ border, className }))} {...props} />
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={cn('aspect-square size-full', className)} {...props} />
}

const AvatarFallbackPrimitive = AvatarPrimitive.Fallback

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return <AvatarFallbackPrimitive data-slot="avatar-fallback" className={cn('flex size-full items-center justify-center rounded-full bg-muted text-xs', className)} {...props} />
}

export { Avatar, AvatarImage, AvatarFallback }
