import React, { useState } from 'react'
import {
  Stack,
  Box,
  Text,
  Group,
  Button,
  PasswordInput,
  Alert,
  ActionIcon,
  Tooltip,
  Anchor,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { KeyRound, ExternalLink, Copy, Check, Trash2 } from 'lucide-react'
import { useClipboard } from '@mantine/hooks'
import { useSetSecret, useSecretValue } from '../../../hooks/useSecrets'
import { SectionLabel } from './shared/SectionLabel'
import type { AuthProviderDef, AuthProviderField } from '../../../pages/AuthProvidersPage'

// ─── Single field row ─────────────────────────────────────────────────────────

const FieldRow: React.FC<{
  field: AuthProviderField
  value: string
  onChange: (v: string) => void
}> = ({ field, value, onChange }) => {
  const { data } = useSecretValue(field.key, true)
  const isSet = !!data?.exists

  return (
    <Box>
      <Group gap={6} mb={4}>
        <Text size="sm" fw={500}>
          {asI18n(field.label)}
        </Text>
        {isSet && (
          <Text size="xs" c="teal">
            {asI18n('set')}
          </Text>
        )}
      </Group>
      <PasswordInput
        placeholder={asI18n(isSet ? 'Leave blank to keep existing' : `Enter ${field.label}`)}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        ff="monospace"
        fz={13}
      />
      <Text fz={11} c="dimmed" mt={2} ff="monospace">
        {asI18n(field.key)}
      </Text>
    </Box>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export const AuthProviderPanel: React.FC<{ metadata: AuthProviderDef }> = ({ metadata }) => {
  const provider = metadata
  const callbackPath = `/api/auth/callback/${provider.callbackId}`
  const clipboard = useClipboard({ timeout: 1500 })

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.key, ''])),
  )
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const setSecretMutation = useSetSecret()

  const handleSave = async () => {
    const toSave = provider.fields.filter((f) => (values[f.key] ?? '').trim())
    if (!toSave.length) return
    setSaving(true)
    try {
      await Promise.all(
        toSave.map((f) =>
          setSecretMutation.mutateAsync({ secretId: f.key, value: (values[f.key] ?? '').trim() }),
        ),
      )
      setValues(Object.fromEntries(provider.fields.map((f) => [f.key, ''])))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await Promise.all(
        provider.fields.map((f) =>
          setSecretMutation.mutateAsync({ secretId: f.key, value: null }),
        ),
      )
    } finally {
      setRemoving(false)
    }
  }

  const hasAnyValue = provider.fields.some((f) => (values[f.key] ?? '').trim())

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <KeyRound size={20} />
          <Text size="lg" fw={600}>
            {asI18n(provider.name)}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" mt={4}>
          {asI18n(provider.description)}
        </Text>
      </Box>

      <Box>
        <SectionLabel>{asI18n('Callback URL')}</SectionLabel>
        <Group gap="xs" wrap="nowrap">
          <Text fz={13} ff="monospace" style={{ flex: 1, wordBreak: 'break-all' }}>
            {asI18n(callbackPath)}
          </Text>
          <Tooltip label={asI18n(clipboard.copied ? 'Copied!' : 'Copy')}>
            <ActionIcon
              variant="subtle"
              color={clipboard.copied ? 'teal' : 'gray'}
              size="sm"
              onClick={() => clipboard.copy(callbackPath)}
            >
              {clipboard.copied ? <Check size={13} /> : <Copy size={13} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text fz={12} c="dimmed" mt={4}>
          {asI18n('Register this as the authorized redirect URI in your OAuth app.')}
        </Text>
      </Box>

      <Box>
        <SectionLabel>{asI18n('Setup')}</SectionLabel>
        <Anchor href={provider.setupUrl} target="_blank" fz={13}>
          <Group gap={4}>
            <ExternalLink size={13} />
            {asI18n(provider.setupLabel)}
          </Group>
        </Anchor>
      </Box>

      <Box>
        <SectionLabel>{asI18n('Secrets')}</SectionLabel>
        <Stack gap="sm">
          {provider.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}
        </Stack>
      </Box>

      {setSecretMutation.isError && (
        <Alert color="red" variant="light">
          {asI18n('Failed to save secrets.')}
        </Alert>
      )}

      <Group justify="space-between">
        <Button
          variant="subtle"
          color="red"
          size="xs"
          leftSection={<Trash2 size={13} />}
          loading={removing}
          onClick={handleRemove}
        >
          {asI18n('Remove')}
        </Button>
        <Button size="sm" disabled={!hasAnyValue} loading={saving} onClick={handleSave}>
          {asI18n('Save secrets')}
        </Button>
      </Group>
    </Stack>
  )
}
