import React from 'react'
import { Group, Stack, Text, ThemeIcon, Paper } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'

interface SurfaceTileProps {
  icon: React.ComponentType<{ size?: number }>
  label: I18nNode
  value: number
}

export const SurfaceTile: React.FC<SurfaceTileProps> = ({
  icon: Icon,
  label,
  value,
}) => (
  <Paper withBorder radius="md" p="sm">
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size={34} radius="md" variant="default" color="gray">
        <Icon size={16} />
      </ThemeIcon>
      <Stack gap={0}>
        <Text size="lg" fw={700} ff="monospace" lh={1}>
          {asI18n(String(value))}
        </Text>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Group>
  </Paper>
)
