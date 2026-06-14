import React from 'react'
import { Group, Stack, Text, ActionIcon } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import css from '../../ui/console.module.css'

interface CategoryRowProps {
  name: string
  childrenCount: number
  isCollapsed?: boolean
  hasChildren?: boolean
  onToggle?: () => void
}

export const CategoryRow: React.FC<CategoryRowProps> = ({
  name,
  childrenCount,
  isCollapsed = false,
  hasChildren = false,
  onToggle,
}) => {
  return (
    <Group
      gap="md"
      wrap="nowrap"
      p="md"
      style={{
        height: '100%',
      }}
    >
      {hasChildren && onToggle ? (
        <ActionIcon variant="subtle" size="sm" onClick={onToggle}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </ActionIcon>
      ) : (
        <div style={{ width: 22 }} />
      )}
      <Stack gap={0} className={css.flexGrow}>
        <Group gap="xs">
          <Text fw={600} size="md">
            {asI18n(name)}
          </Text>
          <Text size="sm" c="dimmed">
            {asI18n(`(${childrenCount})`)}
          </Text>
        </Group>
      </Stack>
    </Group>
  )
}
