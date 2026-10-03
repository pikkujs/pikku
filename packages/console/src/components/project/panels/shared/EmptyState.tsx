import React from 'react'
import { Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const EmptyState: React.FC = () => {
  useLocale()
  return (
    <Text c="dimmed" size="sm" ta="center">
      {m.common_not_available()}
    </Text>
  )
}
