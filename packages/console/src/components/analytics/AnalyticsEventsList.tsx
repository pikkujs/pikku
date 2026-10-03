import { useMemo } from 'react'
import { Badge, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { BarChart3 } from 'lucide-react'
import type { AnalyticsEventMeta } from '@pikku/core/analytics'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { AnalyticsEventCard } from './AnalyticsEventCard'
import { AnalyticsEventPanel } from './AnalyticsEventPanel'
import { groupEventsByFile } from './analytics-catalog'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'

const DOCS_HREF = 'https://pikku.dev/docs/console/features#analytics-events'

type AnalyticsEventsListProps = {
  search: string
  selected: AnalyticsEventMeta | null
  panelOpen: boolean
  onOpenEvent: (event: AnalyticsEventMeta) => void
  onClosePanel: () => void
}

/**
 * The event catalog, grouped by the file that declares it.
 *
 * It reads from build-time meta rather than from a store, so it is the declared
 * surface — what a client may emit — and not a volume report of what has been
 * emitted. That distinction is the only thing an operator can get wrong here,
 * so the page says it outright rather than leaving it to be inferred from the
 * absence of numbers.
 */
export const AnalyticsEventsList: React.FC<AnalyticsEventsListProps> = ({
  search,
  selected,
  panelOpen,
  onOpenEvent,
  onClosePanel,
}) => {
  const { meta, initialLoading } = usePikkuMeta()

  const declared = useMemo(
    () => Object.values(meta.analyticsEvents),
    [meta.analyticsEvents]
  )

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matching = query
      ? declared.filter(
          (event) =>
            event.name.toLowerCase().includes(query) ||
            Object.keys(event.props ?? {}).some((prop) =>
              prop.toLowerCase().includes(query)
            )
        )
      : declared
    return groupEventsByFile(matching)
  }, [declared, search])

  if (initialLoading) {
    return <ConsoleLoading />
  }

  if (declared.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={BarChart3}
        title={m.analytics_empty_title()}
        description={m.analytics_empty_body()}
        docsHref={DOCS_HREF}
      />
    )
  }

  return (
    <>
      {/* A signature is read line by line, so the catalog is capped at a
          readable measure rather than stretched to the viewport — on a wide
          screen the panel takes the space the cards would otherwise waste. */}
      <Stack
        gap="lg"
        p="md"
        maw={880}
        data-testid="analytics-catalog"
        data-help="catalog"
      >
        <Group gap={8} align="baseline" wrap="wrap">
          <Badge size="sm" variant="light" color="gray">
            {m.analytics_event_count({ count: declared.length })}
          </Badge>
          <Text size="xs" c="dimmed" style={{ maxWidth: '60ch' }}>
            {m.analytics_declared_note()}
          </Text>
        </Group>

        {groups.length === 0 ? (
          <Text size="sm" c="dimmed" data-testid="analytics-no-matches">
            {m.analytics_empty_title()}
          </Text>
        ) : (
          groups.map((group) => (
            <Stack
              key={group.file}
              gap={8}
              data-testid="analytics-group"
              data-group-file={group.relative}
            >
              <Group gap={8} align="baseline" wrap="nowrap">
                <Text
                  component="h3"
                  size="xs"
                  fw={700}
                  ff="monospace"
                  lineClamp={1}
                  title={asI18n(group.file)}
                >
                  {asI18n(group.relative)}
                </Text>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {plural(
                    group.events.length,
                    m.analytics_group_events_one,
                    m.analytics_group_events
                  )}
                </Text>
              </Group>

              <Stack gap={6}>
                {group.events.map((event) => (
                  <AnalyticsEventCard
                    key={event.name}
                    event={event}
                    selected={panelOpen && selected?.name === event.name}
                    onOpen={onOpenEvent}
                  />
                ))}
              </Stack>
            </Stack>
          ))
        )}
      </Stack>
      <AnalyticsEventPanel
        event={selected}
        opened={panelOpen}
        onClose={onClosePanel}
      />
    </>
  )
}
