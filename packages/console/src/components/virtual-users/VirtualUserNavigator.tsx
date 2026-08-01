import React from 'react'
import { Badge, Box, Group, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { VirtualUserDoc } from './virtual-user-model'
import styles from './virtual-users.module.css'

type VirtualUserNavigatorProps = {
  users: VirtualUserDoc[]
  selectedId?: string
  onSelect: (id: string) => void
}

export const VirtualUserNavigator: React.FC<VirtualUserNavigatorProps> = ({
  users,
  selectedId,
  onSelect,
}) => (
  <ScrollArea style={{ height: '100%' }} data-testid="virtual-user-navigator">
    <Stack gap={2} p="xs">
      {users.length === 0 && (
        <Text size="sm" c="dimmed" p="sm">
          {m.virtual_users_none()}
        </Text>
      )}
      {users.map((user) => {
        const selected = user.id === selectedId
        return (
          <Box
            key={user.id}
            data-testid={`virtual-user-nav-${user.id}`}
            onClick={() => onSelect(user.id)}
            className={styles.navItem}
            data-selected={selected || undefined}
          >
            <Group gap={6} wrap="nowrap" justify="space-between">
              <Text size="sm" fw={selected ? 600 : 500} lineClamp={1}>
                {asI18n(user.name)}
              </Text>
              <Badge size="xs" variant="light" radius="sm" tt="none">
                {asI18n(user.disposition)}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
              {asI18n(user.persona.name)}
            </Text>
          </Box>
        )
      })}
    </Stack>
  </ScrollArea>
)
