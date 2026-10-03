import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function StatsSegments() {
  const parts = [
    { label: m.statssegments__a(), width: 'w-1/2', className: 'bg-chart-1' },
    { label: m.statssegments__b(), width: 'w-3/10', className: 'bg-chart-2' },
    { label: m.statssegments__c(), width: 'w-1/5', className: 'bg-chart-3' },
  ]
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardDescription>{m.statssegments__title()}</CardDescription>
        <CardTitle size="stat">{m.statssegments__total()}</CardTitle>
      </CardHeader>
      <CardContent layout="stack">
        <div className="flex h-2 overflow-hidden rounded-full">
          {parts.map((part) => (
            <div key={part.label} className={`${part.width} ${part.className}`} />
          ))}
        </div>
        <ul className="flex gap-4 text-sm text-muted-foreground">
          {parts.map((part) => (
            <li key={part.label} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${part.className}`} />
              {part.label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
