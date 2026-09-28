import React from 'react'
import { Group, Paper, Stack, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'

/** One item in a card's list: something on the left, its name and a line about it, and actions on the right. */
export const CardRow: React.FC<{
  leading?: React.ReactNode
  title: I18nNode
  badges?: React.ReactNode
  meta?: React.ReactNode
  middle?: React.ReactNode
  trailing?: React.ReactNode
  children?: React.ReactNode
  onClick?: () => void
  selected?: boolean
  testId?: string
}> = ({
  leading,
  title,
  badges,
  meta,
  middle,
  trailing,
  children,
  onClick,
  selected,
  testId,
}) => (
  <Paper
    variant="inset"
    px="md"
    py="sm"
    data-testid={testId}
    onClick={onClick}
    aria-current={selected || undefined}
    style={{
      cursor: onClick ? 'pointer' : undefined,
      boxShadow: selected
        ? 'inset 0 0 0 1px var(--mantine-primary-color-filled)'
        : undefined,
    }}
  >
    <Group gap="md" wrap="nowrap" align="center">
      {leading}
      <Stack
        gap={3}
        miw={0}
        w={middle ? 340 : undefined}
        style={{ flex: middle ? 'none' : 1 }}
      >
        <Group gap={8} wrap="wrap">
          <Text fw={600} fz={15} lineClamp={2}>
            {title}
          </Text>
          {badges}
        </Group>
        {meta && (
          <Text fz={13.5} c="dimmed" component="div">
            {meta}
          </Text>
        )}
      </Stack>
      {middle && (
        <Stack gap={6} miw={0} style={{ flex: 1 }}>
          {middle}
        </Stack>
      )}
      {trailing && (
        <Group gap={8} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
          {trailing}
        </Group>
      )}
    </Group>
    {children}
  </Paper>
)
