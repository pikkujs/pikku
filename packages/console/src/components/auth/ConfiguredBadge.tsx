import React from 'react'
import { Badge, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'

type ConfiguredBadgeProps = {
  configured: boolean
  testId: string
}

export const ConfiguredBadge: React.FC<ConfiguredBadgeProps> = ({
  configured,
  testId,
}) => {
  if (!configured) {
    return (
      <Text size="sm" c="dimmed">
        {asI18n('Not configured')}
      </Text>
    )
  }

  return (
    <Badge size="sm" variant="light" color="teal" data-testid={testId}>
      {asI18n('Configured')}
    </Badge>
  )
}
