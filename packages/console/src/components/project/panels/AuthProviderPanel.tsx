import React, { useState } from 'react'
import {
  Stack,
  Text,
  Group,
  Button,
  PasswordInput,
  Alert,
  ThemeIcon,
  Title,
  Code,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ExternalLink, Copy, Check, Trash2 } from 'lucide-react'
import { useClipboard } from '@mantine/hooks'
import { useSetSecret, useSecretValue } from '../../../hooks/useSecrets'
import { useAuthProviders } from '../../../hooks/useAuthProviders'
import { StatusTile } from '../../ui/StatusTile'
import { StatusBadge } from '../../ui/StatusBadge'
import { ForDevelopers } from '../../ui/ForDevelopers'
import { DevField, DevFields, DevNote } from '../../ui/DevDetail'
import {
  isCredentials,
  providerDescription,
  providerName,
  ProviderIcon,
} from '../../auth/AuthProvidersListPanel'
import type {
  AuthProviderDef,
  AuthProviderField,
} from '../../../pages/AuthProvidersPage'

const Step: React.FC<{
  number: number
  title: I18nNode
  body?: I18nNode
  children?: React.ReactNode
}> = ({ number, title, body, children }) => (
  <Group align="flex-start" gap="sm" wrap="nowrap">
    <ThemeIcon variant="light" radius="xl" size={26}>
      <Text size="xs" fw={700}>
        {asI18n(String(number))}
      </Text>
    </ThemeIcon>
    <Stack gap={6} miw={0} style={{ flex: 1 }}>
      <Text fw={600}>{title}</Text>
      {body && (
        <Text size="sm" c="dimmed">
          {body}
        </Text>
      )}
      {children}
    </Stack>
  </Group>
)

const FieldRow: React.FC<{
  field: AuthProviderField
  value: string
  onChange: (v: string) => void
}> = ({ field, value, onChange }) => {
  const { data } = useSecretValue(field.key, true)
  const isSet = !!data?.exists

  return (
    <PasswordInput
      label={
        <Group gap={6} component="span">
          {asI18n(field.label)}
          {isSet && (
            <StatusBadge tone="good" size="sm">
              {m.authproviders_key_saved()}
            </StatusBadge>
          )}
        </Group>
      }
      placeholder={
        isSet
          ? m.authproviders_key_keep()
          : m.authproviders_key_enter({ label: field.label })
      }
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  )
}

export const AuthProviderPanel: React.FC<{ metadata: AuthProviderDef }> = ({
  metadata,
}) => {
  const provider = metadata
  useLocale()
  const { meta } = useAuthProviders()
  const callbackPath = `/api/auth/callback/${provider.callbackId}`
  const clipboard = useClipboard({ timeout: 1500 })
  const credentials = isCredentials(provider)
  const on = credentials
    ? meta.hasCredentials
    : meta.providers.some((entry) => entry.id === provider.callbackId)

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((f) => [f.key, '']))
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
          setSecretMutation.mutateAsync({
            secretId: f.key,
            value: (values[f.key] ?? '').trim(),
          })
        )
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
          setSecretMutation.mutateAsync({ secretId: f.key, value: null })
        )
      )
    } finally {
      setRemoving(false)
    }
  }

  const hasAnyValue = provider.fields.some((f) => (values[f.key] ?? '').trim())
  const name = provider.name

  return (
    <Stack gap="lg" data-testid="auth-provider-panel">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <StatusTile tone={on ? 'good' : 'neutral'}>
          <ProviderIcon provider={provider} />
        </StatusTile>
        <Stack gap={4} miw={0}>
          <Group gap={8}>
            <Title order={3}>{asI18n(providerName(provider))}</Title>
            <StatusBadge tone={on ? 'good' : 'neutral'} size="sm">
              {on ? m.authproviders_panel_on() : m.authproviders_panel_off()}
            </StatusBadge>
          </Group>
          <Text size="sm" c="dimmed">
            {providerDescription(provider)}
          </Text>
        </Stack>
      </Group>

      {credentials ? (
        <Text size="sm">
          {on
            ? m.authproviders_builtin_body()
            : m.authproviders_email_off_body()}
        </Text>
      ) : (
        <>
          <Step
            number={1}
            title={m.authproviders_step_create_title({ name })}
            body={m.authproviders_step_create_body({ name })}
          >
            <Button
              component="a"
              href={provider.setupUrl}
              target="_blank"
              variant="default"
              size="xs"
              w="fit-content"
              rightSection={<ExternalLink size={13} />}
            >
              {asI18n(provider.setupLabel)}
            </Button>
          </Step>

          <Step
            number={2}
            title={m.authproviders_step_return_title({ name })}
            body={m.authproviders_step_return_body({ name })}
          >
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: 'break-all' }}>
                {asI18n(callbackPath)}
              </Code>
              <Button
                variant="subtle"
                size="xs"
                color={clipboard.copied ? 'teal' : 'gray'}
                leftSection={
                  clipboard.copied ? <Check size={13} /> : <Copy size={13} />
                }
                onClick={() => clipboard.copy(callbackPath)}
              >
                {clipboard.copied
                  ? m.authproviders_copied()
                  : m.authproviders_copy()}
              </Button>
            </Group>
          </Step>

          <Step number={3} title={m.authproviders_step_keys_title({ name })}>
            <Stack gap="sm">
              {provider.fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ''}
                  onChange={(v) =>
                    setValues((prev) => ({ ...prev, [field.key]: v }))
                  }
                />
              ))}
            </Stack>
          </Step>

          {setSecretMutation.isError && (
            <Alert color="red" variant="light">
              {m.authproviders_save_failed()}
            </Alert>
          )}

          <Group justify="space-between">
            {on ? (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                leftSection={<Trash2 size={13} />}
                loading={removing}
                onClick={handleRemove}
              >
                {m.authproviders_remove()}
              </Button>
            ) : (
              <span />
            )}
            <Button
              disabled={!hasAnyValue}
              loading={saving}
              onClick={handleSave}
            >
              {m.authproviders_save()}
            </Button>
          </Group>
        </>
      )}

      {!credentials && (
        <ForDevelopers
          label={m.authproviders_dev_label()}
          testId="auth-provider-developers"
        >
          <DevFields>
            <DevField label={m.dev_provider_id()} value={provider.callbackId} />
            <DevField label={m.dev_callback_path()} value={callbackPath} />
          </DevFields>
          {provider.fields.length > 0 && (
            <>
              <DevNote>{m.authproviders_dev_secrets()}</DevNote>
              <DevFields>
                {provider.fields.map((field) => (
                  <DevField
                    key={field.key}
                    label={asI18n(field.label)}
                    value={field.key}
                  />
                ))}
              </DevFields>
            </>
          )}
        </ForDevelopers>
      )}
    </Stack>
  )
}
