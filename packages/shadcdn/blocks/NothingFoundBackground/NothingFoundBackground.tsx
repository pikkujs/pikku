import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function NothingFoundBackground() {
  return (
    <section className="mx-auto flex min-h-80 max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{m.nothingfoundbackground__title()}</h1>
      <p className="text-muted-foreground">{m.nothingfoundbackground__description()}</p>
      <Button variant="outline" onClick={() => window.history.back()}>{m.nothingfoundbackground__back()}</Button>
    </section>
  )
}
