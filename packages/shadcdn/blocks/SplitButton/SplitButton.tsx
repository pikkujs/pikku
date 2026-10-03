import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { m } from '@/i18n/messages'

export function SplitButton() {
  return (
    <div className="inline-flex">
      <Button join="start">{m.splitbutton__primary()}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={m.splitbutton__more()} size="icon" join="end">
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>{m.splitbutton__schedule()}</DropdownMenuItem>
          <DropdownMenuItem>{m.splitbutton__draft()}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
