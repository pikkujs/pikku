import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function CardWithStats() {
  return (
    <Card className="max-w-sm overflow-hidden" variant="flush">
      <div className="aspect-video bg-muted" />
      <CardHeader>
        <CardTitle>{m.cardwithstats__title()}</CardTitle>
        <CardDescription>{m.cardwithstats__description()}</CardDescription>
      </CardHeader>
      <CardContent tone="muted">
        <div className="flex gap-6">
        <div>
          <p className="font-semibold tabular-nums">{m.cardwithstats__v1()}</p>
          <p className="text-muted-foreground">{m.cardwithstats__l1()}</p>
        </div>
        <div>
          <p className="font-semibold tabular-nums">{m.cardwithstats__v2()}</p>
          <p className="text-muted-foreground">{m.cardwithstats__l2()}</p>
        </div>
        </div>
      </CardContent>
    </Card>
  )
}
