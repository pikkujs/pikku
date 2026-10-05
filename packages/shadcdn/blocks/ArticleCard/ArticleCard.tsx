import { Dot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function ArticleCard() {
  return (
    <Card className="max-w-sm overflow-hidden" variant="flush">
      <div className="aspect-video bg-muted" />
      <CardHeader>
        <Badge variant="secondary" className="w-fit">{m.articlecard__category()}</Badge>
        <CardTitle>{m.articlecard__title()}</CardTitle>
        <CardDescription>
          <span className="flex items-center">
            {m.articlecard__author()}
            <Dot className="size-4" aria-hidden />
            {m.articlecard__date()}
          </span>
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
