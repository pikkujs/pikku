import React from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { Network } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { CommonDetails } from './shared/CommonDetails'
import { PikkuBadge } from '../../ui/PikkuBadge'

interface GatewayConfigurationProps {
  wireId: string
  metadata?: any
}

export const GatewayConfiguration: React.FC<GatewayConfigurationProps> = ({
  wireId,
  metadata = {},
}) => {
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []
  const hasAuth = metadata?.auth !== false
  const type = metadata?.type || 'webhook'
  const platform = metadata?.platform

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Network size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {asI18n(metadata?.name || wireId)}
          </Text>
        </Group>
        {(platform || metadata?.route || metadata?.summary) && (
          <Text size="sm" c="dimmed" mt={4}>
            {asI18n(
              [platform, metadata?.route, metadata?.summary]
                .filter(Boolean)
                .join(' · ')
            )}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="label" color="teal">
          {asI18n(type)}
        </PikkuBadge>
        {platform && (
          <PikkuBadge type="dynamic" badge="source" value={platform} />
        )}
        {hasAuth && <PikkuBadge type="flag" flag="auth" />}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
      </Group>

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
      />
    </Stack>
  )
}
