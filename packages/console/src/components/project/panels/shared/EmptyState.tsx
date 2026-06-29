import React from 'react'
import { Text } from '@pikku/mantine/core'
import { useI18n } from '@pikku/react/i18n'

export const EmptyState: React.FC = () => {
  const { t } = useI18n()
  return (
    <Text c="dimmed" size="sm" ta="center">
      {t('common.not_available')}
    </Text>
  )
}
