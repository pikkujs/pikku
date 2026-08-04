import React from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { DataViewer } from '../ui/DataViewer'
import { AuditDetailField } from './AuditDetailField'
import type { AuditActorDirectory, AuditRow } from './audit-row'
import { OUTCOME_COLOUR, actorIdentity, formatOccurredAt } from './audit-row'

export interface AuditEventDetailProps {
  event: AuditRow
  /** Names for the actor ids on the page this event came from. */
  actors?: AuditActorDirectory
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
  actors,
}) => {
  useLocale()
  const identity = actorIdentity(event.actor, actors)
  // The name, when one was found — an unresolved actor's label is its own id,
  // which is worth showing once rather than twice.
  const named =
    identity.kind === 'user' && identity.label !== event.actor?.userId
      ? identity.label
      : undefined
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
          {identity.kind === 'user' && identity.synthetic && (
            <Badge size="xs" variant="light" color="grape">
              {m.audit_actor_synthetic()}
            </Badge>
          )}
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
          value={identity.kind === 'system' ? undefined : identity.label}
          fallback={m.audit_actor_system()}
          monospace={!named}
        />
        {/* The id stays visible whenever a name was put in front of it: the
            name is today's, the id is what the event was recorded against, and
            an investigation needs the one that cannot have changed since. */}
        <AuditDetailField
          label={m.audit_detail_actor_id()}
          value={named ? event.actor?.userId : undefined}
        />
        <AuditDetailField
          label={m.audit_detail_actor_org()}
          value={event.actor?.orgId}
        />
        {identity.kind === 'user' && (
          <AuditDetailField
            label={m.audit_detail_actor_session()}
            value={event.actor?.pikkuUserId}
          />
        )}
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
