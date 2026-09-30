import React from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Webhook } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import {
  webhookSecretName,
  type WebhookSourcePair,
} from '../../lib/webhook-source'
import { toEnglishName } from '../../lib/strings'
import { PikkuBadge } from '../ui/PikkuBadge'
import { SectionLabel } from '../ui/SectionLabel'
import { StatusBadge } from '../ui/StatusBadge'
import { WebhookSourceRegistration } from './WebhookSourceRegistration'
import { WebhookSourceSecretStatus } from './WebhookSourceSecretStatus'

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

      <WebhookSourceRegistration source={sourceName} name={source} />

      {secretDeclared && (
        <WebhookSourceSecretStatus source={sourceName} name={secretName} />
      )}
    </Stack>
  )
}
