import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { m } from '@/i18n/messages'

export function CustomSwitch() {
  return (
    <div className="flex max-w-md items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="notify-switch">{m.customswitch__label()}</Label>
        <p className="text-sm text-muted-foreground">{m.customswitch__description()}</p>
      </div>
      <Switch id="notify-switch" />
    </div>
  )
}
