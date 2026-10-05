import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function StatsCard() {
  return (
    <Card className="max-w-xs">
      <CardHeader>
        <CardDescription>{m.statscard__label()}</CardDescription>
        <CardTitle size="stat">{m.statscard__value()}</CardTitle>
      </CardHeader>
      <CardContent tone="muted">{m.statscard__change()}</CardContent>
    </Card>
  )
}
