import type { FC } from 'react'
import { Box, Stack, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

/**
 * STARTER-HOME-DEFAULT — the marker for "this app never built its landing screen". This
 * is `/app`, where `/` forwards every visitor and where signing in lands them, and it is
 * served by the template's own `app.index.tsx` — so the LOOK gate, which scopes to routes
 * the build AUTHORED, never asks anyone to look at it. Runs hmt6lh1rq and hmt6hujbo both
 * passed showing this greeting. Replace the whole page with the screen this app's people
 * open it for; don't delete the marker to silence the gate.
 */
export const HomePage: FC = () => {
  useLocale()
  const appName = m.app__name()

  return (
    <Box mih="70vh" style={{ display: 'grid', placeItems: 'center' }}>
      <Stack maw={520} ta="center" gap="md">
        <Title order={1} fz={34} fw={650} style={{ letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {m.home__title()}
        </Title>
        <Text c="dimmed" size="md" style={{ lineHeight: 1.6 }}>
          {m.home__body({ name: appName })}
        </Text>
      </Stack>
    </Box>
  )
}
