import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function AcceptInvitationCard() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{m.acceptinvitationcard__title()}</CardTitle>
        <CardDescription>{m.acceptinvitationcard__description()}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button>{m.acceptinvitationcard__accept()}</Button>
          <Button variant="outline">{m.acceptinvitationcard__decline()}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
