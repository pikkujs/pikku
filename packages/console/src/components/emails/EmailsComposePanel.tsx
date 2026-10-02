import React, { useEffect, useMemo, useState } from 'react'
import { Box, Button, Stack, Text, TextInput, Title } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import type { EmailsCompose } from '../../hooks/useEmailsCompose'

export interface EmailsComposePanelProps {
  compose: EmailsCompose
}

const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()

const label = (name: string) => {
  const text = words(name).replace(/\burl\b/g, 'link')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const sample = (name: string): string => {
  const n = words(name)
  if (/\b(url|link|href)\b/.test(n)) return 'https://example.com'
  if (/\bemail\b/.test(n)) return 'sam@example.com'
  if (/\b(app|product|company|site)\b/.test(n)) return 'Acme'
  if (/\bname\b/.test(n)) return 'Sam'
  if (/\b(code|otp|token)\b/.test(n)) return '123456'
  if (/\b(count|amount|total|number)\b/.test(n)) return '3'
  if (/\b(date|time)\b/.test(n)) return new Date().toLocaleDateString()
  return label(name)
}

const samplesFor = (variables: string[]) =>
  Object.fromEntries(variables.map((v) => [v, sample(v)]))

/**
 * Sample values for the selected email's fill-ins, each one updating the
 * preview as it is typed. `EmailsPage` renders this beside the preview unless it
 * is given the same `useEmailsCompose()` state, in which case the host owns where
 * it lives — an end-edge panel, a phone sheet — and the page drops its copy.
 *
 * Carries no surface of its own so the host can put it in one.
 */
export const EmailsComposePanel: React.FC<EmailsComposePanelProps> = ({
  compose,
}) => {
  useLocale()
  const { selectedTemplate, selectedLocale, selectedMeta, setPreviewInput } =
    compose
  const variables = useMemo(() => selectedMeta?.variables ?? [], [selectedMeta])
  const [values, setValues] = useState<Record<string, string>>(() =>
    samplesFor(variables)
  )

  useEffect(() => {
    const seeded = samplesFor(variables)
    setValues(seeded)
    setPreviewInput(seeded)
  }, [selectedTemplate, selectedLocale, variables, setPreviewInput])

  useEffect(() => {
    const timer = setTimeout(() => setPreviewInput(values), 400)
    return () => clearTimeout(timer)
  }, [values, setPreviewInput])

  if (!selectedMeta) return null

  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={3}>{m.emails_samples_title()}</Title>
          <Text size="sm" c="dimmed">
            {variables.length
              ? m.emails_samples_blurb()
              : m.emails_samples_none()}
          </Text>
        </Stack>
        {variables.map((name) => (
          <TextInput
            key={name}
            label={asI18n(label(name))}
            value={values[name] ?? ''}
            onChange={(e) => {
              const value = e.currentTarget.value
              setValues((current) => ({ ...current, [name]: value }))
            }}
          />
        ))}
        {variables.length > 0 && (
          <Button
            variant="subtle"
            size="xs"
            color="gray"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setValues(samplesFor(variables))}
          >
            {m.emails_samples_reset()}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
