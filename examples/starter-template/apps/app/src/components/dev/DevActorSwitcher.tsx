import type { FC } from 'react'
import { useDevActors } from '@pikku/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type DevActorSwitcherProps = {
  apiUrl: string
  app?: string
  onSignedIn?: () => void | Promise<void>
  label?: string
}

/**
 * Dev-only floating "Sign in as …" switcher: one click signs in as any declared
 * scenario persona, no password. Renders nothing when the server offers none,
 * which is every production deployment. Not translated: only developers see it.
 */
export const DevActorSwitcher: FC<DevActorSwitcherProps> = ({ apiUrl, app, onSignedIn, label = 'Sign in as …' }) => {
  const { actors, signInAs, pendingId, isPending, error } = useDevActors({ apiUrl, app, onSignedIn })

  if (actors.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className="fixed end-4 bottom-4 z-50">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuLabel>Scenario personas (dev only)</DropdownMenuLabel>
        {actors.map((actor) => (
          <DropdownMenuItem key={actor.id} disabled={isPending} onSelect={() => signInAs(actor.id)}>
            <span className="flex flex-col">
              <span className="font-medium">{pendingId === actor.id ? `${actor.name} …` : actor.name}</span>
              {actor.jobTitle ? <span className="text-xs text-muted-foreground">{actor.jobTitle}</span> : null}
            </span>
          </DropdownMenuItem>
        ))}
        {error ? <p className="px-2 pt-1 text-xs text-destructive">{error.message}</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
