import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function ServerOverload() {
  return (
    <section className="mx-auto flex min-h-96 max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{m.serveroverload__title()}</h1>
      <p className="text-muted-foreground">{m.serveroverload__description()}</p>
      <Button onClick={() => window.location.reload()}>{m.serveroverload__retry()}</Button>
    </section>
  )
}
