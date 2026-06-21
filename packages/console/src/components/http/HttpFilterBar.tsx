import React from 'react'
import { Group, Chip, SegmentedControl, Stack } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { httpMethodDefs } from '../ui/badge-defs'

interface HttpFilterBarProps {
  availableMethods: string[]
  selectedMethods: string[]
  onMethodsChange: (methods: string[]) => void
  authFilter: string
  onAuthFilterChange: (value: string) => void
  sseFilter: boolean
  onSseFilterChange: (value: boolean) => void
  permissionedFilter: boolean
  onPermissionedFilterChange: (value: boolean) => void
  sortBy: string
  onSortByChange: (value: string) => void
}

export const HttpFilterBar: React.FC<HttpFilterBarProps> = ({
  availableMethods,
  selectedMethods,
  onMethodsChange,
  authFilter,
  onAuthFilterChange,
  sseFilter,
  onSseFilterChange,
  permissionedFilter,
  onPermissionedFilterChange,
  sortBy,
  onSortByChange,
}) => {
  useLocale()
  return (
    <Stack gap="xs">
      <Chip.Group multiple value={selectedMethods} onChange={onMethodsChange}>
        <Group gap={6}>
          {availableMethods.map((method) => {
            const def = httpMethodDefs[method]
            return (
              <Chip
                key={method}
                value={method}
                size="sm"
                color={def?.color || 'gray'}
                variant="outline"
              >
                {asI18n(method)}
              </Chip>
            )
          })}
        </Group>
      </Chip.Group>

      <Group gap="sm">
        <SegmentedControl
          size="sm"
          value={authFilter}
          onChange={onAuthFilterChange}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Auth', value: 'auth' },
            { label: 'Sessionless', value: 'sessionless' },
          ]}
        />

        <Chip
          size="sm"
          checked={sseFilter}
          onChange={onSseFilterChange}
          color="cyan"
          variant="outline"
        >
          {m.http_filter_sse()}
        </Chip>

        <Chip
          size="sm"
          checked={permissionedFilter}
          onChange={onPermissionedFilterChange}
          color="red"
          variant="outline"
        >
          {m.http_filter_permissioned()}
        </Chip>

        <SegmentedControl
          size="sm"
          value={sortBy}
          onChange={onSortByChange}
          data={[
            { label: 'Route', value: 'route' },
            { label: 'Method', value: 'method' },
          ]}
        />
      </Group>
    </Stack>
  )
}
