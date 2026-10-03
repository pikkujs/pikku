import React from 'react'
import { Divider, Group, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'

export type SectionHeaderProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>
  iconColor: string
  title: I18nString
  count?: number | null
  right?: React.ReactNode
}

/**
 * The band above a group of sections: an icon, what the group is, how many things
 * are in it, and a rule out to whatever the caller puts on the end.
 *
 * The count sits beside the title rather than in a badge because it is the same
 * number the sections below it add up to — a reader checks it against them, and a
 * badge reads as a status.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon: Icon,
  iconColor,
  title,
  count,
  right,
}) => {
  return (
    <Group gap={9} wrap="nowrap" mb={13}>
      <Icon size={17} color={iconColor} />
      <Text fw={700} size="sm">
        {title}
      </Text>
      {count != null && (
        <Text size="xs" c="dimmed" ff="monospace">
          {count}
        </Text>
      )}
      <Divider style={{ flex: 1 }} />
      {right}
    </Group>
  )
}
