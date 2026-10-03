import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/i18n/messages'

export function InputValidation() {
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Label htmlFor="validated-email">{m.inputvalidation__label()}</Label>
      <Input id="validated-email" type="email" aria-invalid aria-describedby="validated-email-error" />
      <p id="validated-email-error" className="text-sm text-destructive">{m.inputvalidation__error()}</p>
    </div>
  )
}
