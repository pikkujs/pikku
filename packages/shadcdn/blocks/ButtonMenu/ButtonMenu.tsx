import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { m } from '@/i18n/messages'

export function ButtonMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">{m.buttonmenu__label()}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{m.buttonmenu__edit()}</DropdownMenuItem>
        <DropdownMenuItem>{m.buttonmenu__duplicate()}</DropdownMenuItem>
        <DropdownMenuItem>{m.buttonmenu__archive()}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
