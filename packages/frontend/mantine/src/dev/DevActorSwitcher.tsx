import type { FC, CSSProperties } from 'react'
import {
  asI18n,
  useDevActors,
  type DevActor,
  type I18nString,
} from '@pikku/react'
import { Button, Menu, Text } from '../core/index.js'

export type DevActorSwitcherProps = {
  /** Raw JSON actor list from the host's env, or an already-parsed list. */
  actors: string | DevActor[] | undefined
  /** The shared scenario actor secret from the host's env. Absent renders nothing. */
  secret: string | undefined
  /** API base, including the `/api` prefix if the app has one. */
  apiUrl: string
  /**
   * Where a successful sign-in lands. The app owns this — the templates go to
   * `/app`, other apps to `/` — which is also why this component takes a
   * callback rather than depending on a router.
   */
  onSignedIn?: () => void | Promise<void>
  /**
   * Menu trigger label. Defaults to "Sign in as …" — branded so an app that has
   * a catalogue can hand over `m.dev_actors__cta()` rather than being forced
   * back through `asI18n`.
   */
  label?: I18nString
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
}

const CORNERS: Record<
  NonNullable<DevActorSwitcherProps['position']>,
  CSSProperties
> = {
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
}

/**
 * Dev-only floating "Sign in as …" switcher: one click signs in as any declared
 * scenario persona, no password, so an app can be reviewed as each kind of user
 * without knowing a seed password. Without it a reviewer is locked out of their
 * own sandbox — which is why `pikku fabric validate` requires any frontend with
 * a login screen to ship one.
 *
 * Renders nothing when the host exposed no actors or no secret, which is every
 * production build.
 *
 * Strings here are passed through `asI18n` rather than a message catalogue: this
 * control never ships to an end user, so translating it would cost every
 * consuming app three keys for text only its own developers see.
 */
export const DevActorSwitcher: FC<DevActorSwitcherProps> = ({
  actors: rawActors,
  secret,
  apiUrl,
  onSignedIn,
  label = asI18n('Sign in as …'),
  position = 'bottom-right',
}) => {
  const { actors, signInAs, pendingEmail, isPending, error } = useDevActors({
    actors: rawActors,
    secret,
    apiUrl,
    onSignedIn,
  })

  if (actors.length === 0) return null

  return (
    <Menu position="top-end" withArrow>
      <Menu.Target>
        <Button
          size="xs"
          variant="light"
          style={{ position: 'fixed', zIndex: 1000, ...CORNERS[position] }}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{asI18n('Scenario personas (dev only)')}</Menu.Label>
        {actors.map((actor) => (
          <Menu.Item
            key={actor.key}
            disabled={isPending}
            onClick={() => signInAs(actor.email)}
          >
            <Text size="sm" fw={500}>
              {asI18n(
                pendingEmail === actor.email ? `${actor.name} …` : actor.name
              )}
            </Text>
            {actor.jobTitle ? (
              <Text size="xs" c="dimmed">
                {asI18n(actor.jobTitle)}
              </Text>
            ) : null}
          </Menu.Item>
        ))}
        {error ? (
          <Text size="xs" c="red" px="sm" pt={4}>
            {asI18n(error.message)}
          </Text>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  )
}
