import React, { useMemo } from 'react'
import { Box, Center, Loader, Alert, Text } from '@pikku/mantine/core'
import { AlertTriangle } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useRenderEmailPreview } from '../../../hooks/useWirings'

/**
 * Read-only rendered preview of an email template — the viewer half of the
 * EmailsPage, with no locale/variable/source editing. Renders the template's
 * default locale with empty variables so it works from a detail panel opened by
 * just the template name.
 */
export const EmailPreviewPanel: React.FC<{
  templateName: string
  metadata?: any
}> = ({ templateName, metadata }) => {
  const locale = useMemo(() => {
    const locales = metadata?.locales
      ? Object.keys(metadata.locales)
      : undefined
    return metadata?.defaultLocale || locales?.[0] || undefined
  }, [metadata])

  const preview = useRenderEmailPreview(templateName, locale, {}, !!templateName)

  return (
    <Box>
      {preview.isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : null}
      {preview.error ? (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {asI18n(
            preview.error instanceof Error
              ? preview.error.message
              : 'Failed to render email preview'
          )}
        </Alert>
      ) : null}
      {preview.data?.subject ? (
        <Text fw={600} mb="sm">
          {asI18n(preview.data.subject)}
        </Text>
      ) : null}
      {preview.data?.html ? (
        <Box
          style={{
            border: '1px solid var(--app-row-border)',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <iframe
            title={templateName}
            srcDoc={preview.data.html}
            style={{ width: '100%', height: 560, border: 'none' }}
          />
        </Box>
      ) : null}
    </Box>
  )
}
