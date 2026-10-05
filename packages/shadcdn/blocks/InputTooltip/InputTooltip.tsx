import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { m } from '@/i18n/messages'

export function InputTooltip() {
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <div className="flex items-center gap-1">
        <Label htmlFor="tooltip-username">{m.inputtooltip__label()}</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={m.inputtooltip__help_label()} className="size-6">
                <Info className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{m.inputtooltip__help()}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Input id="tooltip-username" name="username" autoComplete="username" />
    </div>
  )
}
