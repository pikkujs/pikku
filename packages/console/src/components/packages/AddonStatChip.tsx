import React from 'react'
import { Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'

type AddonStatChipProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>
  value: number
}

export const AddonStatChip: React.FC<AddonStatChipProps> = ({
  icon: Icon,
  value,
}) => (
  <Group gap={5} wrap="nowrap">
    <Icon size={13} color="var(--mantine-color-dimmed)" />
    <Text size="sm" ff="monospace" c="dimmed">
      {asI18n(String(value))}
    </Text>
  </Group>
)
