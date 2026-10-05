import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function PricingTable() {
  const plans = [
    { name: m.pricingtable__p1_name(), price: m.pricingtable__p1_price(), feature: m.pricingtable__p1_feature(), highlight: false },
    { name: m.pricingtable__p2_name(), price: m.pricingtable__p2_price(), feature: m.pricingtable__p2_feature(), highlight: true },
    { name: m.pricingtable__p3_name(), price: m.pricingtable__p3_price(), feature: m.pricingtable__p3_feature(), highlight: false },
  ]
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">{m.pricingtable__title()}</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} variant={plan.highlight ? 'highlight' : 'default'}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {plan.name}
                {plan.highlight && <Badge>{m.pricingtable__popular()}</Badge>}
              </CardTitle>
              <CardDescription>
                <span className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                  {m.pricingtable__per_month()}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent layout="stack">
              <p className="text-sm">{plan.feature}</p>
              <Button variant={plan.highlight ? 'default' : 'outline'}>{m.pricingtable__choose()}</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
