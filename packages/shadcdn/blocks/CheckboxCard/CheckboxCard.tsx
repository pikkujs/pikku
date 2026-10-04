import { Checkbox } from '@/components/ui/checkbox'
import { m } from '@/i18n/messages'

export function CheckboxCard() {
  return (
    <label htmlFor="digest-card" className="flex max-w-sm cursor-pointer items-start gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary">
      <Checkbox id="digest-card" className="mt-0.5" />
      <span className="flex flex-col gap-1">
        <span className="font-medium">{m.checkboxcard__title()}</span>
        <span className="text-sm font-normal text-muted-foreground">{m.checkboxcard__description()}</span>
      </span>
    </label>
  )
}
