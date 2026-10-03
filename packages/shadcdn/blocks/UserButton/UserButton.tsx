import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { m } from '@/i18n/messages'

export function UserButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="profile">
          <Avatar>
            <AvatarFallback>{m.userbutton__initials()}</AvatarFallback>
          </Avatar>
          <span className="flex flex-col items-start text-start">
            <span className="text-sm font-medium">{m.userbutton__name()}</span>
            <span className="text-xs text-muted-foreground">{m.userbutton__email()}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{m.userbutton__profile()}</DropdownMenuItem>
        <DropdownMenuItem>{m.userbutton__sign_out()}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
