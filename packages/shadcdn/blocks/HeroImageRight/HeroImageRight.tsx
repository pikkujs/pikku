import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function HeroImageRight() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
      <div className="flex flex-col gap-6">
        <h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl">{m.heroimageright__title()}</h1>
        <p className="text-lg text-muted-foreground">{m.heroimageright__description()}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg">{m.heroimageright__primary()}</Button>
          <Button size="lg" variant="outline">{m.heroimageright__secondary()}</Button>
        </div>
      </div>
      <div className="aspect-square rounded-xl border bg-muted" />
    </section>
  )
}
