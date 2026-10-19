import { useState } from 'react'
import { Box, Button, Group, Stack, Text, Title } from '@pikku/mantine/core'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

// Router-level error boundary (wired as the router's defaultErrorComponent). In
// dev it reveals the raw error in an expandable section — agents watch for this
// while iterating — while production stays a calm, generic message.
export function DefaultErrorPage({ error }: { error: unknown }) {
  useLocale()
  const [open, setOpen] = useState(false)
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)

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
            background: 'light-dark(rgba(249, 115, 22, 0.1), rgba(249, 115, 22, 0.15))',
            color: '#f97316',
          }}
        >
          <AlertTriangle size={28} />
        </Box>
        <Title order={2} ta="center">
          {m.error__title()}
        </Title>
        <Text c="dimmed" ta="center" size="sm">
          {m.error__hint()}
        </Text>
        <Group>
          <Button variant="light" onClick={() => window.location.reload()}>
            {m.error__retry()}
          </Button>
        </Group>
        {import.meta.env.DEV && detail ? (
          <Stack gap={6} style={{ width: '100%' }}>
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={
                <ChevronRight
                  size={14}
                  style={{
                    transform: open ? 'rotate(90deg)' : undefined,
                    transition: 'transform 120ms ease',
                  }}
                />
              }
              onClick={() => setOpen((v) => !v)}
              style={{ alignSelf: 'flex-start' }}
            >
              {m.error__details()}
            </Button>
            {open ? (
              <Box
                component="pre"
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 8,
                  background: 'light-dark(#f8f9fa, #1a1b1e)',
                  border: '1px solid light-dark(#e9ecef, #2c2e33)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 320,
                  overflow: 'auto',
                }}
              >
                {asI18n(detail)}
              </Box>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  )
}
