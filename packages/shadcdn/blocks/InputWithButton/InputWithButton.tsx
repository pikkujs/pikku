import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/i18n/messages'

export function InputWithButton() {
  return (
    <form className="flex max-w-sm items-end gap-2">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="subscribe-email">{m.inputwithbutton__label()}</Label>
        <Input id="subscribe-email" type="email" autoComplete="email" />
      </div>
      <Button type="submit">{m.inputwithbutton__submit()}</Button>
    </form>
  )
}
