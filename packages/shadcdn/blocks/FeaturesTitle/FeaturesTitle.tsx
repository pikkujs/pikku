import { m } from '@/i18n/messages'

export function FeaturesTitle() {
  const items = [
    { title: m.featurestitle__f1(), text: m.featurestitle__f1_text() },
    { title: m.featurestitle__f2(), text: m.featurestitle__f2_text() },
    { title: m.featurestitle__f3(), text: m.featurestitle__f3_text() },
    { title: m.featurestitle__f4(), text: m.featurestitle__f4_text() },
  ]
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-3">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{m.featurestitle__title()}</h2>
        <p className="mt-3 text-muted-foreground">{m.featurestitle__description()}</p>
      </div>
      <dl className="grid gap-8 sm:grid-cols-2 md:col-span-2">
        {items.map((item) => (
          <div key={item.title}>
            <dt className="font-semibold">{item.title}</dt>
            <dd className="mt-1 text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
