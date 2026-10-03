import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { m } from '@/i18n/messages'

export function EmailBanner() {
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-xl bg-muted px-6 py-10 md:flex-row md:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{m.emailbanner__title()}</h2>
        <p className="mt-1 text-muted-foreground">{m.emailbanner__description()}</p>
      </div>
      <form className="flex w-full max-w-sm gap-2">
        <Input type="email" autoComplete="email" aria-label={m.emailbanner__label()} />
        <Button type="submit">{m.emailbanner__submit()}</Button>
      </form>
    </section>
  )
}
