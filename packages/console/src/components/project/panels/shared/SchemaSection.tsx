import React from 'react'
import { Box, Loader, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useSchema } from '../../../../hooks/useWirings'
import { SchemaViewer } from '../../../ui/SchemaViewer'
import { SectionLabel } from './SectionLabel'

export const SchemaSection: React.FC<{
  label?: I18nNode
  schemaName?: string | null
}> = ({ label, schemaName }) => {
  useLocale()
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
          {m.common_no_schema()}
        </Text>
      )}
    </Box>
  )
}
