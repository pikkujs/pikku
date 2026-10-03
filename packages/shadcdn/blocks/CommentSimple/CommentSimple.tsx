import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { m } from '@/i18n/messages'

export function CommentSimple() {
  return (
    <div className="flex max-w-lg gap-3">
      <Avatar>
        <AvatarFallback>{m.commentsimple__initials()}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm">
          <span className="font-medium">{m.commentsimple__author()}</span> <span className="text-muted-foreground">{m.commentsimple__time()}</span>
        </p>
        <p className="mt-1 text-sm">{m.commentsimple__body()}</p>
      </div>
    </div>
  )
}
