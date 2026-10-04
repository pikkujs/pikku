import { m } from '@/i18n/messages'

export function FaqWithHeader() {
  const items = [
    { q: m.faqwithheader__q1(), a: m.faqwithheader__a1() },
    { q: m.faqwithheader__q2(), a: m.faqwithheader__a2() },
    { q: m.faqwithheader__q3(), a: m.faqwithheader__a3() },
    { q: m.faqwithheader__q4(), a: m.faqwithheader__a4() },
  ]
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="mb-10 text-3xl font-bold tracking-tight">{m.faqwithheader__title()}</h2>
      <dl className="grid gap-8 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.q}>
            <dt className="font-semibold">{item.q}</dt>
            <dd className="mt-1 text-muted-foreground">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
