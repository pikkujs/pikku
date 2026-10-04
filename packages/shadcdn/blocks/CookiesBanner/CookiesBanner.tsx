import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function CookiesBanner() {
  return (
    <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg sm:flex-row">
      <p className="flex-1 text-sm">{m.cookiesbanner__text()}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline">{m.cookiesbanner__decline()}</Button>
        <Button size="sm">{m.cookiesbanner__accept()}</Button>
      </div>
    </div>
  )
}
