import { Input } from '@/components/ui/input'
import { m } from '@/i18n/messages'

export function FloatingLabelInput() {
  return (
    <div className="relative max-w-sm">
      <Input id="floating-email" type="email" placeholder=" " layout="floating" className="peer h-12" />
      <label htmlFor="floating-email" className="pointer-events-none absolute start-3 top-1 text-xs text-muted-foreground transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs">
        {m.floatinglabelinput__label()}
      </label>
    </div>
  )
}
