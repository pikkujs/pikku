import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function DefaultErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{m.error__title()}</h1>
      <p className="text-muted-foreground">{m.error__hint()}</p>
      <div>
        <Button onClick={reset}>{m.error__retry()}</Button>
      </div>
      <details className="text-sm text-muted-foreground">
        <summary>{m.error__details()}</summary>
        <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{error instanceof Error ? error.message : String(error)}</pre>
      </details>
    </main>
  )
}
