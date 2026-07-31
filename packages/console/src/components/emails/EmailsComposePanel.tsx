import React from 'react'
import {
  Badge,
  Box,
  Code,
  Divider,
  Group,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { SchemaForm } from '../ui/SchemaForm'
import type { EmailsCompose } from '../../hooks/useEmailsCompose'

export interface EmailsComposePanelProps {
  compose: EmailsCompose
}

/**
 * The variables form that renders an email preview, plus what the selected
 * template is made of. `EmailsPage` renders this beside the preview unless it is
 * given the same `useEmailsCompose()` state, in which case the host owns where
 * it lives — an end-edge panel, a phone sheet — and the page drops its copy.
 *
 * Carries no surface of its own so the host can put it in one.
 */
export const EmailsComposePanel: React.FC<EmailsComposePanelProps> = ({
  compose,
}) => {
  useLocale()
  const { schema, selectedTemplate, selectedLocale, selectedMeta, preview } =
    compose

  if (!selectedMeta) return null

  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
      <Stack gap="lg">
        <SchemaForm
          key={`${selectedTemplate}:${selectedLocale}`}
          schema={schema}
          submitLabel={m.emails_render_preview()}
          onSubmit={(formData) => compose.setPreviewInput(formData ?? {})}
        />
        <Divider />
        <Stack gap="xs">
          <Text fw={600}>{m.emails_template_details()}</Text>
          <Group gap="xs">
            <Badge variant="light">
              {asI18n(`${selectedMeta.variables.length} variables`)}
            </Badge>
            <Badge variant="light">
              {asI18n(`${Object.keys(selectedMeta.locales).length} locales`)}
            </Badge>
          </Group>
          {preview.data?.hash ? <Code block>{preview.data.hash}</Code> : null}
        </Stack>
      </Stack>
    </Box>
  )
}
