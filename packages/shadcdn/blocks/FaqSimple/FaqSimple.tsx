import { m } from '@/i18n/messages'

export function FaqSimple() {
  const items = [
    { q: m.faqsimple__q1(), a: m.faqsimple__a1() },
    { q: m.faqsimple__q2(), a: m.faqsimple__a2() },
    { q: m.faqsimple__q3(), a: m.faqsimple__a3() },
  ]
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">{m.faqsimple__title()}</h2>
      <dl className="flex flex-col gap-6">
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
