import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function TaskCard() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">{m.taskcard__status()}</Badge>
        <CardTitle>{m.taskcard__title()}</CardTitle>
        <CardDescription>{m.taskcard__due()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Avatar>
          <AvatarFallback>{m.taskcard__initials()}</AvatarFallback>
        </Avatar>
      </CardContent>
    </Card>
  )
}
