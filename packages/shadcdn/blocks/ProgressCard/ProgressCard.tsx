import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function ProgressCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>{m.progresscard__title()}</CardTitle>
        <CardDescription>{m.progresscard__figure()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Progress value={60} aria-label={m.progresscard__title()} />
      </CardContent>
    </Card>
  )
}
