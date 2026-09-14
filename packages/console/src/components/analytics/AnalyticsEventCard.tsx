import { Badge, Group, Stack, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { AnalyticsEventMeta } from '@pikku/core/analytics'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'
import { PROP_PREVIEW_LIMIT } from './analytics-catalog'

type AnalyticsEventCardProps = {
  event: AnalyticsEventMeta
  selected: boolean
  onOpen: (event: AnalyticsEventMeta) => void
}

/**
 * One declared event, as the call that emits it.
 *
 * The props are the event — two events with the same name and different shapes
 * are two different contracts — so the card spells the shape out rather than
 * listing prop names and making the reader open something to see their types.
 * The type is the schema's own source text, which is what the inspector reads
 * off the declaration.
 */
export const AnalyticsEventCard: React.FC<AnalyticsEventCardProps> = ({
  event,
  selected,
  onOpen,
}) => {
  const props = Object.entries(event.props ?? {})
  const shown = props.slice(0, PROP_PREVIEW_LIMIT)
  const hidden = props.length - shown.length

  return (
    <UnstyledButton
      onClick={() => onOpen(event)}
      data-testid="analytics-event-row"
      data-event-name={event.name}
      data-selected={selected || undefined}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--app-panel-bg)',
        border: `0.5px solid ${selected ? 'var(--mantine-primary-color-filled)' : 'var(--app-border)'}`,
        boxShadow: selected
          ? '0 0 0 1px var(--mantine-primary-color-filled)'
          : undefined,
      }}
    >
      <Stack gap={6}>
        <Group gap={8} justify="space-between" wrap="nowrap">
          <Text component="h4" size="sm" fw={600} lineClamp={1}>
            {asI18n(event.name)}
          </Text>
          {props.length > 0 && (
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {plural(
                props.length,
                m.analytics_prop_count_one,
                m.analytics_prop_count
              )}
            </Text>
          )}
        </Group>

        {!event.props ? (
          <Text size="xs" c="dimmed">
            {m.analytics_props_unreadable()}
          </Text>
        ) : props.length === 0 ? (
          <Text size="xs" c="dimmed">
            {m.analytics_props_none()}
          </Text>
        ) : (
          <Group gap={6} style={{ rowGap: 4 }}>
            {shown.map(([name, schema]) => (
              <Badge
                key={name}
                size="xs"
                variant="light"
                color="gray"
                tt="none"
                data-prop-name={name}
              >
                {asI18n(`${name}: ${schema}`)}
              </Badge>
            ))}
            {hidden > 0 && (
              <Text size="xs" c="dimmed">
                {asI18n(`+${hidden}`)}
              </Text>
            )}
          </Group>
        )}
      </Stack>
    </UnstyledButton>
  )
}
