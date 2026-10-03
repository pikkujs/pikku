import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function UserCardImage() {
  return (
    <Card className="max-w-xs overflow-hidden text-center" variant="flush">
      <div className="h-24 bg-muted" />
      <Avatar className="-mt-8 size-16 self-center" border="cover">
        <AvatarFallback>{m.usercardimage__initials()}</AvatarFallback>
      </Avatar>
      <CardHeader>
        <CardTitle>{m.usercardimage__name()}</CardTitle>
        <CardDescription>{m.usercardimage__role()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full">{m.usercardimage__follow()}</Button>
      </CardContent>
    </Card>
  )
}
