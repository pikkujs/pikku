import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function BadgeCard() {
  const tags = [m.badgecard__t1(), m.badgecard__t2()]
  return (
    <Card className="max-w-sm overflow-hidden" variant="flush">
      <div className="aspect-video bg-muted" />
      <CardHeader>
        <CardTitle>{m.badgecard__title()}</CardTitle>
        <CardDescription>{m.badgecard__description()}</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Button className="w-full">{m.badgecard__book()}</Button>
      </CardContent>
    </Card>
  )
}
