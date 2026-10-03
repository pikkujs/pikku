import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function HeroTitle() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-balance md:text-6xl">{m.herotitle__title()}</h1>
      <p className="text-lg text-muted-foreground text-balance">{m.herotitle__description()}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg">{m.herotitle__primary()}</Button>
        <Button size="lg" variant="outline">{m.herotitle__secondary()}</Button>
      </div>
    </section>
  )
}
