import React from 'react'
import { Box, TextInput, Group, Text } from '@mantine/core'
import { Search } from 'lucide-react'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  count?: number
}

export const SearchInput: React.FunctionComponent<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  label,
  count,
}) => (
  <Box p="xs">
    {(label || count != null) && (
      <Group justify="space-between" mb={6}>
        {label && (
          <Text size="xs" fw={600} ff="monospace" c="var(--app-meta-label)">
            {label}
          </Text>
        )}
        {count != null && (
          <Text size="xs" ff="monospace" c="dimmed">
            {count} items
          </Text>
        )}
      </Group>
    )}
    <TextInput
      placeholder={placeholder}
      leftSection={<Search size={14} />}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      size="xs"
    />
  </Box>
)
