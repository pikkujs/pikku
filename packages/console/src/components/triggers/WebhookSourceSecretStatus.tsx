import React from 'react'
import { Anchor, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { useQuery } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useNavigate } from '../../router'
import { SectionLabel } from '../ui/SectionLabel'
import { StatusBadge } from '../ui/StatusBadge'

/** Whether the signing secret a webhook source verifies with has been stored. */
export const WebhookSourceSecretStatus: React.FC<{
  source: string
  name: string
}> = ({ source, name }) => {
  const rpc = usePikkuRPC()
  const navigate = useNavigate()
  const { data: stored, isLoading } = useQuery({
    queryKey: ['credential-global-status', name],
    queryFn: async () => {
      const result = await rpc.invoke('admin:credentialStatus', {
        names: [name],
      })
      return !!(result.statuses as Record<string, boolean> | undefined)?.[name]
    },
  })

  return (
    <Box>
      <SectionLabel>{m.webhook_source_secret()}</SectionLabel>
      {isLoading ? (
        <Text size="sm" c="dimmed">
          {m.webhook_source_secret_checking()}
        </Text>
      ) : (
        <Stack gap={4}>
          <Group gap="xs">
            <StatusBadge tone={stored ? 'good' : 'warn'} size="sm">
              {stored
                ? m.webhook_source_secret_badge_stored()
                : m.webhook_source_secret_badge_missing()}
            </StatusBadge>
          </Group>
          <Text size="sm">
            {stored
              ? m.webhook_source_secret_stored({ source })
              : m.webhook_source_secret_missing({ source })}
          </Text>
          {!stored && (
            <Anchor
              href="/credentials"
              size="sm"
              data-testid="webhook-source-secret-link"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                navigate('/credentials')
              }}
            >
              {m.webhook_source_secret_open()}
            </Anchor>
          )}
        </Stack>
      )}
    </Box>
  )
}
