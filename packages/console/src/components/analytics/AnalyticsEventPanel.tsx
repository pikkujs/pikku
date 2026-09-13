import { Code, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { AnalyticsEventMeta } from '@pikku/core/analytics'
import { ConsolePanel } from '../shell/ConsolePanel'
import { m } from '@/i18n/messages'

type AnalyticsEventPanelProps = {
  event: AnalyticsEventMeta | null
  opened: boolean
  onClose: () => void
}

/**
 * One declared event: its props and where it is declared.
 *
 * A prop's type is the schema's own source text, because that is what the
 * inspector can read from the declaration — rendering it as code rather than as
 * prose keeps it honest about being the literal `z.string()` and not a resolved
 * type.
 */
export const AnalyticsEventPanel: React.FC<AnalyticsEventPanelProps> = ({
  event,
  opened,
  onClose,
}) => {
  const props = Object.entries(event?.props ?? {})

  return (
    <ConsolePanel
      opened={opened}
      onClose={onClose}
      width="md"
      title={event ? asI18n(event.name) : undefined}
      testId="analytics-panel"
    >
      {event && (
        <Stack gap="md">
          <Stack gap={6}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {m.analytics_panel_props()}
            </Text>
            {props.length === 0 ? (
              <Text size="sm" c="dimmed">
                {event.props
                  ? m.analytics_props_none()
                  : m.analytics_props_unreadable()}
              </Text>
            ) : (
              <Stack gap={4}>
                {props.map(([name, schema]) => (
                  <Group
                    key={name}
                    justify="space-between"
                    wrap="nowrap"
                    data-testid="analytics-prop"
                    data-prop-name={name}
                  >
                    <Text size="sm">{asI18n(name)}</Text>
                    <Code>{schema}</Code>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>

          <Stack gap={6}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {m.analytics_panel_source()}
            </Text>
            <Code
              block
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >{`${event.variable}\n${event.file}`}</Code>
          </Stack>
        </Stack>
      )}
    </ConsolePanel>
  )
}
