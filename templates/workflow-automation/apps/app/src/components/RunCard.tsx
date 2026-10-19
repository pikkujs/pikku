import type { FC } from 'react'
import { Badge, Card, Group, Stack, Text } from '@pikku/mantine/core'
import { m, asI18n } from '@/i18n/messages'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { flowRunStatus, flowTriggerKind } from '@/i18n/i18n-enum.gen'
import type { FlowRunStatusKey, FlowTriggerKindKey } from '@/i18n/i18n-enum.gen'

type Props = {
  flowName: string
  status: string
  startedBy: string
  duration: string
  error: string | null
  statusColor: string
}

/**
 * One run, for a screen too narrow to be a table.
 *
 * The table's four columns do not survive 375px: compressed, every status badge
 * clipped to two letters; scrolled, the status column — the reason anybody
 * opens this page — sits off-screen behind a scrollbar a phone does not draw.
 * A card keeps the flow and its state on the same line, which is the one pairing
 * that has to survive.
 */
export const RunCard: FC<Props> = ({
  flowName,
  status,
  startedBy,
  duration,
  error,
  statusColor,
}) => {
  const trigger =
    flowTriggerKind[startedBy as FlowTriggerKindKey]?.() ?? asI18n(startedBy)
  return (
  <Card withBorder radius="md" padding="sm">
    <Stack gap={6}>
      <Group justify="space-between" align="flex-start" gap="xs">
        <Text fw={600} size="sm">
          {asI18n(flowName)}
        </Text>
        <Badge
          size="md"
          variant="light"
          color={statusColor}
          style={{ flexShrink: 0 }}
          styles={{ label: { color: STATUS_TEXT_COLOR } }}
        >
          {flowRunStatus[status as FlowRunStatusKey]()}
        </Badge>
      </Group>
      {error && (
        <Text c="red" size="xs">
          {asI18n(error)}
        </Text>
      )}
      {/* The table's header row is what made a bare "event" and "38.0s" mean
          anything. A card has no header, so the label travels with the value.
          A run with no duration shows only its trigger: the badge beside it
          already says whether it is queued or running, and my first attempt
          here said "still running" under a QUEUED badge, which is a state the
          run had not reached. */}
      <Text size="xs" c="dimmed">
        {duration === '—' ? trigger : m.runs__card_meta({ trigger, duration })}
      </Text>
    </Stack>
  </Card>
)
}
