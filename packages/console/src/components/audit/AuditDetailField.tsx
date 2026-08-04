import React from 'react'
import { Group, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'

export interface AuditDetailFieldProps {
  label: I18nNode
  /** A server-returned identifier, shown verbatim. */
  value?: string | null
  /** Shown when there is no value; without one the whole line is omitted. */
  fallback?: I18nNode
}

/**
 * One label/value line of an audit event.
 *
 * A field with nothing to say renders nothing rather than an empty row: an
 * event carries whichever of `functionId`, `wireType` and `traceId` its wire
 * happened to know, and a column of blanks reads as missing data rather than as
 * data that never applied.
 */
export const AuditDetailField: React.FC<AuditDetailFieldProps> = ({
  label,
  value,
  fallback,
}) => {
  if (!value && !fallback) {
    return null
  }
  return (
    <Group gap="xs" wrap="nowrap" justify="space-between">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      {value ? (
        <Text size="sm" ff="monospace" truncate>
          {asI18n(value)}
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          {fallback}
        </Text>
      )}
    </Group>
  )
}
