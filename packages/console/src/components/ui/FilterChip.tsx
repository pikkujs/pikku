import React from 'react'
import { Button, Menu, Text } from '@pikku/mantine/core'
import { ChevronDown } from 'lucide-react'
import {
  CONTROL_H,
  filterDisplay,
  type ShellHeaderFilter,
} from './shellHeaderShared'

type FilterChipProps = {
  filter: ShellHeaderFilter
  withinPortal?: boolean
}

export const FilterChip: React.FC<FilterChipProps> = ({
  filter,
  withinPortal = true,
}) => {
  const target = (
    <Button
      variant="default"
      size="sm"
      leftSection={filter.icon}
      rightSection={filter.options ? <ChevronDown size={13} /> : undefined}
      onClick={
        filter.options
          ? undefined
          : filter.onChange
            ? () => filter.onChange?.(filter.value)
            : undefined
      }
      styles={{
        root: { flexShrink: 0, height: CONTROL_H, minHeight: CONTROL_H },
        label: { gap: 5 },
      }}
    >
      <Text span fz={11.5} c="dimmed">
        {filter.label}
      </Text>
      <Text span fz={12.5} fw={600}>
        {filterDisplay(filter)}
      </Text>
    </Button>
  )
  if (!filter.options) return target
  return (
    <Menu position="bottom-start" withinPortal={withinPortal} shadow="md">
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>
        {filter.options.map((o) => (
          <Menu.Item
            key={o.value}
            fw={o.value === filter.value ? 600 : 400}
            onClick={() => filter.onChange?.(o.value)}
          >
            {o.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
