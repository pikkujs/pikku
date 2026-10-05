import { m } from '@/i18n/messages'

export function ImageCard() {
  return (
    <div className="relative aspect-4/3 max-w-sm overflow-hidden rounded-xl bg-muted">
      <div className="absolute inset-x-0 bottom-0 bg-foreground/70 p-4 text-background">
        <p className="text-xs uppercase tracking-wide">{m.imagecard__category()}</p>
        <p className="text-lg font-semibold">{m.imagecard__title()}</p>
      </div>
    </div>
  )
}
