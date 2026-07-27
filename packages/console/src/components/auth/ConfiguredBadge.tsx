import React from 'react'
import { Badge, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type ConfiguredBadgeProps = {
  configured: boolean
  providerId: string
}

export const ConfiguredBadge: React.FC<ConfiguredBadgeProps> = ({
  configured,
  providerId,
}) => {
  useLocale()

  if (!configured) {
    return (
      <Text
        size="sm"
        c="dimmed"
        data-testid="auth-provider-status"
        data-provider={providerId}
        data-configured="false"
      >
        {m.auth_provider_not_configured()}
      </Text>
    )
  }

  return (
    <Badge
      size="sm"
      variant="light"
      color="teal"
      data-testid="auth-provider-status"
      data-provider={providerId}
      data-configured="true"
    >
      {m.auth_provider_configured()}
    </Badge>
  )
}
