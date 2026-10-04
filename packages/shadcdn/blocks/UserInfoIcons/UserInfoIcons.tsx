import { Mail, Phone } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { m } from '@/i18n/messages'

export function UserInfoIcons() {
  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        <AvatarFallback>{m.userinfoicons__initials()}</AvatarFallback>
      </Avatar>
      <div>
        <p className="font-semibold">{m.userinfoicons__name()}</p>
        <p className="text-sm text-muted-foreground">{m.userinfoicons__role()}</p>
        <p className="mt-2 flex items-center gap-2 text-sm"><Mail className="size-4" />{m.userinfoicons__email()}</p>
        <p className="flex items-center gap-2 text-sm"><Phone className="size-4" />{m.userinfoicons__phone()}</p>
      </div>
    </div>
  )
}
