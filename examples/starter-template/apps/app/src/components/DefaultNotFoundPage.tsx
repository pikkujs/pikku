import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function DefaultNotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{m.notfound__title()}</h1>
      <p className="text-muted-foreground">{m.notfound__hint()}</p>
      <div>
        <Button asChild>
          <Link to="/">{m.notfound__home()}</Link>
        </Button>
      </div>
    </main>
  )
}
