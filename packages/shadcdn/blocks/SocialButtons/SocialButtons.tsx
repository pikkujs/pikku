import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function SocialButtons() {
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Button variant="outline">{m.socialbuttons__google()}</Button>
      <Button variant="outline">{m.socialbuttons__github()}</Button>
    </div>
  )
}
