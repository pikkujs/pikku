import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function HeroText() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-5 px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight text-balance">{m.herotext__title()}</h1>
      <p className="text-lg text-muted-foreground">{m.herotext__description()}</p>
      <Button size="lg">{m.herotext__cta()}</Button>
    </section>
  )
}
