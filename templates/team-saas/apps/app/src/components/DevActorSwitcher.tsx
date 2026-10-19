import type { FC } from 'react'
import { Button, Menu, Text } from '@pikku/mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { devActors, signInAsActor } from '@/lib/auth'
import { asI18n, m } from '@/i18n/messages'

// Dev-only floating "Sign in as" switcher: one click signs in as any declared
// scenario persona (no password), so you can view the app as each user kind.
// Renders nothing in production or when the sandbox exposes no actors.
export const DevActorSwitcher: FC = () => {
  const navigate = useNavigate()
  const actors = devActors()
  const signIn = useMutation({
    mutationFn: (email: string) => signInAsActor(email),
    onSuccess: () => navigate({ to: '/app' }),
  })
  if (actors.length === 0) return null
  return (
    <Menu position="top-end" withArrow>
      <Menu.Target>
        <Button
          size="xs"
          variant="light"
          style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}
        >
          {m.dev_actors__cta()}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{m.dev_actors__label()}</Menu.Label>
        {actors.map((actor) => {
          const busy = signIn.isPending && signIn.variables === actor.email
          return (
            <Menu.Item
              key={actor.key}
              disabled={signIn.isPending}
              onClick={() => signIn.mutate(actor.email)}
            >
              <Text size="sm" fw={500}>
                {asI18n(busy ? `${actor.name} …` : actor.name)}
              </Text>
              {actor.jobTitle ? (
                <Text size="xs" c="dimmed">
                  {asI18n(actor.jobTitle)}
                </Text>
              ) : null}
            </Menu.Item>
          )
        })}
        {signIn.isError ? (
          <Text size="xs" c="red" px="sm" pt={4}>
            {m.dev_actors__error()}
          </Text>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  )
}
