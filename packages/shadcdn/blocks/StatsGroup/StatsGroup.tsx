import { Card, CardContent } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function StatsGroup() {
  const stats = [
    { value: m.statsgroup__s1_value(), label: m.statsgroup__s1_label() },
    { value: m.statsgroup__s2_value(), label: m.statsgroup__s2_label() },
    { value: m.statsgroup__s3_value(), label: m.statsgroup__s3_label() },
  ]
  return (
    <Card>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <span className="text-3xl font-bold tabular-nums">{stat.value}</span>
            <span className="text-sm text-muted-foreground">{stat.label}</span>
          </div>
        ))}
        </div>
      </CardContent>
    </Card>
  )
}
