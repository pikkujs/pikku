import React from 'react'
import { Anchor, Box, Group, Stack, Switch, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useQuery } from '@tanstack/react-query'
import { Webhook } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useNavigate } from '../../router'
import {
  webhookSecretName,
  type WebhookSourcePair,
} from '../../lib/webhook-source'
import { toEnglishName } from '../../lib/strings'
import {
  registrationState,
  useSetTriggerSourceEnabled,
  useTriggerSources,
  type RegistrationState,
} from '../../hooks/useTriggerSources'
import { PikkuBadge } from '../ui/PikkuBadge'
import { SectionLabel } from '../ui/SectionLabel'
import { StatusBadge } from '../ui/StatusBadge'

const SecretStatus: React.FC<{ source: string; name: string }> = ({
  source,
  name,
}) => {
  const rpc = usePikkuRPC()
  const navigate = useNavigate()
  const { data: stored, isLoading } = useQuery({
    queryKey: ['credential-global-status', name],
    queryFn: async () => {
      const result = await rpc.invoke('admin:credentialStatus', {
        names: [name],
      })
      return !!(result.statuses as Record<string, boolean> | undefined)?.[name]
    },
  })

  return (
    <Box>
      <SectionLabel>{m.webhook_source_secret()}</SectionLabel>
      {isLoading ? (
        <Text size="sm" c="dimmed">
          {m.webhook_source_secret_checking()}
        </Text>
      ) : (
        <Stack gap={4}>
          <Group gap="xs">
            <StatusBadge tone={stored ? 'good' : 'warn'} size="sm">
              {stored
                ? m.webhook_source_secret_badge_stored()
                : m.webhook_source_secret_badge_missing()}
            </StatusBadge>
          </Group>
          <Text size="sm">
            {stored
              ? m.webhook_source_secret_stored({ source })
              : m.webhook_source_secret_missing({ source })}
          </Text>
          {!stored && (
            <Anchor
              href="/credentials"
              size="sm"
              data-testid="webhook-source-secret-link"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                navigate('/credentials')
              }}
            >
              {m.webhook_source_secret_open()}
            </Anchor>
          )}
        </Stack>
      )}
    </Box>
  )
}

const REGISTRATION_TONE = {
  pending: 'neutral',
  off: 'neutral',
  registered: 'good',
  manual: 'warn',
  failed: 'bad',
} as const satisfies Record<RegistrationState, string>

const Registration: React.FC<{ source: string; name: string }> = ({
  source,
  name,
}) => {
  const { data: rows, isError } = useTriggerSources()
  const setEnabled = useSetTriggerSourceEnabled()
  if (isError || !rows) return null
  const row = rows.find((r) => r.name === name)
  const state = registrationState(row)
  const badge = {
    pending: m.webhook_source_registration_badge_pending,
    off: m.webhook_source_registration_badge_off,
    registered: m.webhook_source_registration_badge_registered,
    manual: m.webhook_source_registration_badge_manual,
    failed: m.webhook_source_registration_badge_failed,
  }[state]()
  const text = {
    pending: m.webhook_source_registration_pending,
    off: m.webhook_source_registration_off,
    registered: m.webhook_source_registration_registered,
    manual: m.webhook_source_registration_manual,
    failed: m.webhook_source_registration_failed,
  }[state]({ source })

  return (
    <Box data-testid={`webhook-source-registration-${state}`}>
      <SectionLabel>{m.webhook_source_registration()}</SectionLabel>
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <StatusBadge tone={REGISTRATION_TONE[state]} size="sm">
            {badge}
          </StatusBadge>
          {row && (
            <Switch
              size="md"
              label={m.webhook_source_registration_switch()}
              labelPosition="left"
              checked={row.enabled}
              disabled={setEnabled.isPending}
              data-testid="webhook-source-enabled"
              onChange={(event) =>
                setEnabled.mutate({
                  name,
                  enabled: event.currentTarget.checked,
                })
              }
            />
          )}
        </Group>
        <Text size="sm">{text}</Text>
        {row?.detail && (state === 'manual' || state === 'failed') && (
          <Text size="sm" c="dimmed">
            {asI18n(row.detail)}
          </Text>
        )}
      </Stack>
    </Box>
  )
}

/** A trigger source that arrives as an incoming webhook: where it is received, what it sends, what it does by itself. */
export const WebhookSourceConfiguration: React.FC<{
  webhook: WebhookSourcePair
}> = ({ webhook }) => {
  useLocale()
  const { meta: projectMeta } = usePikkuMeta()
  const { source, event, meta } = webhook
  const sourceName = toEnglishName(source)
  const methods = (Array.isArray(meta.method) ? meta.method : [meta.method])
    .filter(Boolean)
    .map((v) => v.toUpperCase())
  const steps = [
    meta.receive ? m.webhook_source_step_receive() : null,
    meta.check ? m.webhook_source_step_check() : null,
    meta.setup ? m.webhook_source_step_setup({ source: sourceName }) : null,
    meta.teardown
      ? m.webhook_source_step_teardown({ source: sourceName })
      : null,
  ].filter((v) => v !== null)
  const secretName = webhookSecretName(source)
  const secretDeclared = !!(
    projectMeta.credentialsMeta as Record<string, unknown> | undefined
  )?.[secretName]

  return (
    <Stack gap="lg" data-testid={`webhook-source-${source}`}>
      <Box>
        <Group gap="xs">
          <Webhook size={20} />
          <Text size="lg" fw={600}>
            {asI18n(sourceName)}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" mt={4}>
          {m.webhook_source_intro({ source: sourceName })}
        </Text>
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="triggerSource" />
        <StatusBadge tone="info" size="sm" dot={false}>
          {m.webhook_source_kind()}
        </StatusBadge>
      </Group>

      <Box>
        <SectionLabel>{m.webhook_source_address()}</SectionLabel>
        <Text size="sm" ff="monospace">
          {asI18n(meta.route)}
        </Text>
      </Box>

      <Box>
        <SectionLabel>{m.webhook_source_methods()}</SectionLabel>
        <Text size="sm" ff="monospace">
          {asI18n(methods.join(', '))}
        </Text>
      </Box>

      <Box>
        <SectionLabel>{m.webhook_source_events()}</SectionLabel>
        {meta.events.length === 0 ? (
          <Text size="sm" c="dimmed">
            {m.webhook_source_events_none()}
          </Text>
        ) : (
          <Stack gap={4}>
            {meta.events.map((name) => (
              <Group key={name} gap="xs">
                <Text size="sm" ff="monospace">
                  {asI18n(name)}
                </Text>
                {name === event && (
                  <StatusBadge tone="good" size="sm">
                    {m.webhook_source_event_this()}
                  </StatusBadge>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <SectionLabel>{m.webhook_source_steps()}</SectionLabel>
        {steps.length === 0 ? (
          <Text size="sm" c="dimmed">
            {m.webhook_source_steps_none()}
          </Text>
        ) : (
          <Stack gap={4}>
            {steps.map((text, i) => (
              <Text key={i} size="sm">
                {text}
              </Text>
            ))}
          </Stack>
        )}
      </Box>

      <Registration source={sourceName} name={source} />

      {secretDeclared && <SecretStatus source={sourceName} name={secretName} />}
    </Stack>
  )
}
