import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function HeroBullets() {
  const bullets = [
    { bold: m.herobullets__bullet1_bold(), text: m.herobullets__bullet1_text() },
    { bold: m.herobullets__bullet2_bold(), text: m.herobullets__bullet2_text() },
    { bold: m.herobullets__bullet3_bold(), text: m.herobullets__bullet3_text() },
  ]
  return (
    <section className="mx-auto grid max-w-5xl items-center gap-12 px-6 py-20 md:grid-cols-2">
      <div className="flex flex-col gap-6">
        <h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl">{m.herobullets__title()}</h1>
        <p className="text-lg text-muted-foreground">{m.herobullets__description()}</p>
        <ul className="flex flex-col gap-3">
          {bullets.map((bullet) => (
            <li key={bullet.bold} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
              <span>
                <strong className="font-semibold">{bullet.bold}</strong>
                {bullet.text}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button size="lg">{m.herobullets__get_started()}</Button>
          <Button size="lg" variant="outline">
            {m.herobullets__source_code()}
          </Button>
        </div>
      </div>
      <div className="aspect-4/3 rounded-xl border bg-muted" />
    </section>
  )
}
