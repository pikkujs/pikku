import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function NotFoundTitle() {
  return (
    <section className="mx-auto flex min-h-96 max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-7xl font-extrabold text-muted-foreground/40">{m.notfoundtitle__code()}</span>
      <h1 className="text-3xl font-bold tracking-tight">{m.notfoundtitle__title()}</h1>
      <p className="text-muted-foreground">{m.notfoundtitle__description()}</p>
      <Button asChild>
        <a href="/">{m.notfoundtitle__home()}</a>
      </Button>
    </section>
  )
}
