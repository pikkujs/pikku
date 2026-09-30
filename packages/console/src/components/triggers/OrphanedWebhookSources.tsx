import React from 'react'
import { Button, Group, Paper, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { toEnglishName } from '../../lib/strings'
import {
  useForgetTriggerSource,
  useTriggerSources,
} from '../../hooks/useTriggerSources'
import { StatusBadge } from '../ui/StatusBadge'

/** Webhooks still registered at a provider after the code that set them up was removed. */
export const OrphanedWebhookSources: React.FC = () => {
  const { data: rows } = useTriggerSources()
  const forget = useForgetTriggerSource()
  const orphans = (rows ?? []).filter((r) => !r.declared)
  if (orphans.length === 0) return null

  return (
    <Stack gap="sm" data-testid="orphaned-webhook-sources">
      {orphans.map((row) => (
        <Paper key={row.name} withBorder p="md">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={4}>
              <Group gap="xs">
                <Text fw={600}>{asI18n(toEnglishName(row.name))}</Text>
                <StatusBadge tone="warn" size="sm">
                  {m.webhook_source_orphan_badge()}
                </StatusBadge>
              </Group>
              <Text size="sm">
                {m.webhook_source_orphan_body({
                  source: toEnglishName(row.name),
                })}
              </Text>
              {row.detail && (
                <Text size="sm" c="dimmed">
                  {asI18n(row.detail)}
                </Text>
              )}
            </Stack>
            <Button
              size="xs"
              variant="default"
              loading={forget.isPending && forget.variables === row.name}
              onClick={() => forget.mutate(row.name)}
              data-testid={`orphaned-webhook-source-forget-${row.name}`}
            >
              {m.webhook_source_orphan_forget()}
            </Button>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
