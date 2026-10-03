import React from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { Check, Circle } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { PlanChecklistItem } from '../../lib/plan'

type PlanChecklistRowProps = { item: PlanChecklistItem }

/**
 * One row of the reconcile.
 *
 * Ticked from the generated meta rather than from anything the build reported, so
 * an unticked row is a thing that does not exist — not a step somebody forgot to
 * mark done.
 */
export const PlanChecklistRow: React.FC<PlanChecklistRowProps> = ({ item }) => {
  const pending = item.deferred && !item.done
  return (
    <Group gap={8} wrap="nowrap" align="flex-start">
      {item.done ? (
        <Check
          size={13}
          style={{ marginTop: 3, flexShrink: 0, color: 'var(--app-green)' }}
        />
      ) : (
        <Circle
          size={13}
          style={{
            marginTop: 3,
            flexShrink: 0,
            color: 'var(--app-text-faint)',
          }}
        />
      )}
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text
          size="xs"
          c={pending ? 'dimmed' : undefined}
          style={{ lineHeight: 1.5 }}
        >
          {asI18n(item.label)}
        </Text>
        {pending && (
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
            {m.knowledge_plan_item_deferred_why()}
          </Text>
        )}
      </Stack>
      {pending && (
        <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
          {m.knowledge_plan_item_deferred()}
        </Badge>
      )}
      <Badge size="xs" variant="default" style={{ flexShrink: 0 }}>
        {asI18n(item.kind)}
      </Badge>
    </Group>
  )
}
