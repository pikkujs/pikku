import React from 'react'
import { Group, Text, Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import type { AuthPluginEntry } from '../../hooks/useAuthProviders'

type AuthPluginsBarProps = {
  plugins: AuthPluginEntry[]
}

export const AuthPluginsBar: React.FC<AuthPluginsBarProps> = ({ plugins }) => {
  useLocale()

  if (plugins.length === 0) {
    return null
  }

  return (
    <Group gap="xs">
      <Text size="sm" fw={500}>
        {m.auth_plugins_label()}
      </Text>
      {plugins.map((plugin) => (
        <Badge
          key={plugin.id}
          size="sm"
          variant="light"
          color="grape"
          data-testid={`auth-plugin-${plugin.id}`}
        >
          {asI18n(plugin.displayName)}
        </Badge>
      ))}
    </Group>
  )
}
