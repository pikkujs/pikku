import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { m } from '@/i18n/messages'

export function ContactUs() {
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-2">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{m.contactus__title()}</h2>
        <p className="mt-3 text-muted-foreground">{m.contactus__description()}</p>
        <p className="mt-6 text-sm">
          <span className="text-muted-foreground">{m.contactus__email_label()}</span> {m.contactus__email_value()}
        </p>
      </div>
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactus-name">{m.contactus__name()}</Label>
          <Input id="contactus-name" name="name" autoComplete="name" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactus-message">{m.contactus__message()}</Label>
          <Textarea id="contactus-message" name="message" rows={4} />
        </div>
        <Button type="submit" className="self-end">{m.contactus__send()}</Button>
      </form>
    </section>
  )
}
