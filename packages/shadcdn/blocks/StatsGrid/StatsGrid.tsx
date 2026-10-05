import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function StatsGrid() {
  const stats = [
    { label: m.statsgrid__s1(), value: m.statsgrid__s1_v(), change: m.statsgrid__s1_c() },
    { label: m.statsgrid__s2(), value: m.statsgrid__s2_v(), change: m.statsgrid__s2_c() },
    { label: m.statsgrid__s3(), value: m.statsgrid__s3_v(), change: m.statsgrid__s3_c() },
    { label: m.statsgrid__s4(), value: m.statsgrid__s4_v(), change: m.statsgrid__s4_c() },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardDescription>{stat.label}</CardDescription>
            <CardTitle size="stat">{stat.value}</CardTitle>
          </CardHeader>
          <CardContent tone="muted">{stat.change}</CardContent>
        </Card>
      ))}
    </div>
  )
}
