import React from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { DataViewer } from '../ui/DataViewer'
import { AuditDetailField } from './AuditDetailField'
import type { AuditRow } from './audit-row'
import { OUTCOME_COLOUR, formatOccurredAt } from './audit-row'

export interface AuditEventDetailProps {
  event: AuditRow
}

/**
 * One audit event in full.
 *
 * The table summarises `metadata` to a single line because a cell has no room
 * for a payload; here it gets {@link DataViewer}, the same tree the workflow
 * panels use — reading what actually changed is the whole reason to open a row.
 */
export const AuditEventDetail: React.FC<AuditEventDetailProps> = ({
  event,
}) => {
  useLocale()
  return (
    <Stack gap="md" data-testid="audit-detail">
      <Stack gap={4}>
        <Group gap="xs" wrap="nowrap">
          <Text fw={600}>{asI18n(event.type)}</Text>
          <Badge size="xs" variant="light" color="gray">
            {event.source === 'explicit'
              ? m.audit_source_explicit()
              : m.audit_source_auto()}
          </Badge>
          {event.outcome && (
            <Badge
              size="sm"
              variant="light"
              color={OUTCOME_COLOUR[event.outcome] ?? 'gray'}
            >
              {asI18n(event.outcome)}
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {asI18n(formatOccurredAt(event.occurredAt))}
        </Text>
      </Stack>

      <Stack gap={4}>
        <AuditDetailField
          label={m.audit_col_actor()}
          value={event.actor?.userId}
          fallback={m.audit_actor_system()}
        />
        <AuditDetailField
          label={m.audit_detail_function()}
          value={event.functionId}
        />
        <AuditDetailField
          label={m.audit_detail_wire()}
          value={event.wireType}
        />
        <AuditDetailField
          label={m.audit_detail_trace()}
          value={event.traceId}
        />
        <AuditDetailField
          label={m.audit_detail_event_id()}
          value={event.eventId}
        />
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600} c="dimmed" tt="uppercase">
          {m.audit_detail_metadata()}
        </Text>
        {event.metadata == null ? (
          <Text size="sm" c="dimmed" fs="italic">
            {m.audit_detail_no_metadata()}
          </Text>
        ) : (
          <DataViewer data={event.metadata} />
        )}
      </Stack>
    </Stack>
  )
}
