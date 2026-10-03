import React from 'react'
import { Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'

export const SectionLabel: React.FC<{
  children: I18nNode
}> = ({ children }) => (
  <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb={4}>
    {children}
  </Text>
)
