import { Box, Button, Group, Stack, Text, Title } from '@pikku/mantine/core'
import { Compass } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

// Router-level not-found boundary (wired as the router's defaultNotFoundComponent
// and as the root route's notFoundComponent). Deliberately the same layout as
// DefaultErrorPage — the two are one page with different copy, and a user who
// hits both in a session should recognise the second.
//
// No error detail section here: an unmatched URL has nothing to inspect, and
// unlike a thrown error it is usually the user's typo rather than the app's bug.
export function DefaultNotFoundPage() {
  useLocale()

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Stack align="center" gap="md" style={{ maxWidth: 540, width: '100%' }}>
        <Box
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'light-dark(rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.15))',
            color: '#3b82f6',
          }}
        >
          <Compass size={28} />
        </Box>
        <Title order={2} ta="center">
          {m.notfound__title()}
        </Title>
        <Text c="dimmed" ta="center" size="sm">
          {m.notfound__hint()}
        </Text>
        <Group>
          {/* Link, not navigate() in an onClick: a not-found page is a plausible
              landing spot from a bad external link, and a real anchor keeps it
              usable (and crawlable) before hydration. */}
          <Button component={Link} to="/" variant="light">
            {m.notfound__home()}
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
