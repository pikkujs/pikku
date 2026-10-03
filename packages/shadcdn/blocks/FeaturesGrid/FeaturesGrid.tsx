import { Lock, Palette, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

const icons = [Zap, Lock, Palette]

export function FeaturesGrid() {
  const items = [
    { title: m.featuresgrid__f1_title(), text: m.featuresgrid__f1_text() },
    { title: m.featuresgrid__f2_title(), text: m.featuresgrid__f2_text() },
    { title: m.featuresgrid__f3_title(), text: m.featuresgrid__f3_text() },
  ]
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">{m.featuresgrid__title()}</h2>
        <p className="mt-3 text-muted-foreground">{m.featuresgrid__description()}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {items.map((item, index) => {
          const Icon = icons[index]!
          return (
            <Card key={item.title}>
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.text}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
