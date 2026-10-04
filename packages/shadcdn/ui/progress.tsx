import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)} value={value} {...props}>
      <ProgressPrimitive.Indicator data-slot="progress-indicator" className="h-full w-(--progress) bg-primary transition-all" style={{ '--progress': `${value || 0}%` } as React.CSSProperties} />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
