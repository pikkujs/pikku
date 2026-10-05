import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { m } from '@/i18n/messages'

export function GetInTouchSimple() {
  return (
    <section className="mx-auto max-w-xl px-6 py-20">
      <h2 className="mb-8 text-3xl font-bold tracking-tight">{m.getintouchsimple__title()}</h2>
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-name">{m.getintouchsimple__name()}</Label>
          <Input id="contact-name" name="name" autoComplete="name" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-email">{m.getintouchsimple__email()}</Label>
          <Input id="contact-email" name="email" type="email" autoComplete="email" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-message">{m.getintouchsimple__message()}</Label>
          <Textarea id="contact-message" name="message" rows={5} />
        </div>
        <Button type="submit" className="self-end">{m.getintouchsimple__send()}</Button>
      </form>
    </section>
  )
}
