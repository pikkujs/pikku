import React from 'react'
import { Group, Paper, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { STATUS_TONE_COLOR, type StatusTone } from './StatusBadge'

/** One figure on a card: what it counts, the number, and a line saying what the number means. */
export const StatTile: React.FC<{
  label: I18nNode
  value: I18nNode
  unit?: I18nNode
  note?: I18nNode
  tone?: StatusTone | 'muted'
}> = ({ label, value, unit, note, tone }) => (
  <Paper variant="inset" px="md" py="sm" miw={0}>
    <Text size="xs" c="dimmed">
      {label}
    </Text>
    <Group gap={4} align="baseline">
      <Text
        fz={24}
        fw={700}
        lh={1.3}
        c={
          tone === 'muted'
            ? 'dimmed'
            : tone && tone !== 'neutral'
              ? STATUS_TONE_COLOR[tone]
              : undefined
        }
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
      {unit && (
        <Text size="xs" c="dimmed">
          {unit}
        </Text>
      )}
    </Group>
    {note && (
      <Text size="xs" c="dimmed">
        {note}
      </Text>
    )}
  </Paper>
)
