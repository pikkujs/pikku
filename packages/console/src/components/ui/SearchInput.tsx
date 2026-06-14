import React from 'react'
import { Box, TextInput, Group, Text } from '@pikku/mantine/core'
import type { I18nNode, I18nString } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { Search } from 'lucide-react'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: I18nString
  label?: I18nNode
  count?: number
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder,
  label,
  count,
}) => (
  <Box p="xs">
    {(label || count != null) && (
      <Group justify="space-between" mb={6}>
        {label && (
          <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-label)">
            {label}
          </Text>
        )}
        {count != null && (
          <Text size="sm" ff="monospace" c="dimmed">
            {asI18n(`${count} items`)}
          </Text>
        )}
      </Group>
    )}
    <TextInput
      placeholder={placeholder}
      leftSection={<Search size={14} />}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      size="sm"
    />
  </Box>
)
