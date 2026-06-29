import React from 'react'
import { Box, Loader, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { useSchema } from '../../../../hooks/useWirings'
import { SchemaViewer } from '../../../ui/SchemaViewer'
import { SectionLabel } from './SectionLabel'

export const SchemaSection: React.FC<{
  label?: I18nNode
  schemaName?: string | null
}> = ({ label, schemaName }) => {
  const { t } = useI18n()
  const { data: schema, isLoading } = useSchema(schemaName)

  if (!schemaName) return null

  return (
    <Box>
      {label && <SectionLabel>{label}</SectionLabel>}
      {isLoading ? (
        <Loader size="sm" />
      ) : schema ? (
        <SchemaViewer schema={schema} />
      ) : (
        <Text size="sm" c="dimmed">
          {t('common.no_schema')}
        </Text>
      )}
    </Box>
  )
}
