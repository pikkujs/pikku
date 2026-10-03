import React from 'react'
import { Box, Group, Stack, Switch, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  registrationState,
  useSetTriggerSourceEnabled,
  useTriggerSources,
  type RegistrationState,
} from '../../hooks/useTriggerSources'
import { SectionLabel } from '../ui/SectionLabel'
import { StatusBadge } from '../ui/StatusBadge'

const REGISTRATION_TONE = {
  pending: 'neutral',
  off: 'neutral',
  registered: 'good',
  manual: 'warn',
  failed: 'bad',
} as const satisfies Record<RegistrationState, string>

/** Whether a webhook source is registered with its provider, and the switch that turns it on and off. */
export const WebhookSourceRegistration: React.FC<{
  source: string
  name: string
}> = ({ source, name }) => {
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
