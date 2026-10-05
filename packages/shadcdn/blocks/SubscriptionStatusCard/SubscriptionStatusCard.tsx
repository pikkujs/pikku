import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function SubscriptionStatusCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {m.subscriptionstatuscard__title()}
          <Badge>{m.subscriptionstatuscard__status()}</Badge>
        </CardTitle>
        <CardDescription>{m.subscriptionstatuscard__renews()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full">{m.subscriptionstatuscard__manage()}</Button>
      </CardContent>
    </Card>
  )
}
