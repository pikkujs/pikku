import { Group, Menu, ActionIcon, SegmentedControl } from '@pikku/mantine/core'
import { Check, Tag } from 'lucide-react'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import type { WeaveType, WeaveLayout } from './types'

import { WeaveTypeFilter } from './WeaveTypeFilter'

export function WeaveFilterControls({
  types,
  tags,
  typeFilter,
  onTypeFilter,
  tagFilter,
  onTagFilter,
  layout,
  onLayout,
}: {
  types: WeaveType[]
  tags: string[]
  typeFilter: WeaveType[]
  onTypeFilter: (value: WeaveType[]) => void
  tagFilter: string[]
  onTagFilter: (value: string[]) => void
  layout: WeaveLayout
  onLayout: (value: WeaveLayout) => void
}) {
  return (
    <Group gap={8} wrap="nowrap">
      {/* Radial (everything → core) vs Graph (wires → their function). */}
      <SegmentedControl
        size="xs"
        aria-label={m.weaving_layout_label()}
        value={layout}
        onChange={(value) => onLayout(value as WeaveLayout)}
        data={[
          { value: 'radial', label: m.weaving_layout_radial() },
          { value: 'graph', label: m.weaving_layout_graph() },
        ]}
      />
      <WeaveTypeFilter types={types} value={typeFilter} onChange={onTypeFilter} />
      {tags.length ? (
        <Menu closeOnItemClick={false} position="bottom-end" width={220} withinPortal zIndex={400}>
          <Menu.Target>
            <ActionIcon
              size="lg"
              variant={tagFilter.length ? 'filled' : 'default'}
              aria-label={m.weaving_filter_tag_placeholder()}
            >
              <Tag size={15} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown style={{ maxHeight: 320, overflowY: 'auto' }}>
            <Menu.Label>{m.weaving_filter_tag_placeholder()}</Menu.Label>
            {tags.map((tag) => {
              const active = tagFilter.includes(tag)
              return (
                <Menu.Item
                  key={tag}
                  leftSection={
                    active ? (
                      <Check size={14} />
                    ) : (
                      <span style={{ width: 14, display: 'inline-block' }} />
                    )
                  }
                  onClick={() =>
                    onTagFilter(active ? tagFilter.filter((t) => t !== tag) : [...tagFilter, tag])
                  }
                >
                  {asI18n(tag)}
                </Menu.Item>
              )
            })}
          </Menu.Dropdown>
        </Menu>
      ) : null}
    </Group>
  )
}
