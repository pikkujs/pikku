import React from 'react'
import { ActionIcon, Anchor, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ChevronRight, Webhook, Zap } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useTriggerItems } from '../../hooks/useTriggerItems'
import {
  hasSource,
  matchesTriggerQuery,
  sourcePanelMetadata,
  triggerCounts,
  type TriggerPair,
} from '../../lib/trigger-pairs'
import { toEnglishName } from '../../lib/strings'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'

const TRIGGERS_DOCS = 'https://pikku.dev/docs/wiring/triggers'

export interface TriggersListPanelProps {
  /** Filters the rows from outside; the screen above owns the search box. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

const funcName = (pair: TriggerPair, side: 'source' | 'trigger') => {
  if (side === 'source' && pair.webhook)
    return toEnglishName(pair.webhook.source)
  const id = pair[side]?.pikkuFuncId as string | undefined
  return id ? toEnglishName(id) : undefined
}

/**
 * Every trigger in the project as a card of rows, each paired with its source.
 * Mount anywhere under a `ConsoleSurface` — it reads its own meta and opens the
 * source or trigger inspector.
 */
export const TriggersListPanel: React.FC<TriggersListPanelProps> = ({
  externalSearch = '',
  emptyHero,
}) => {
  const { openTriggerSource, openTrigger } = usePanelContext()
  useLocale()
  const { items: pairs, loading } = useTriggerItems()

  usePanelUrl({
    type: 'trigger',
    items: pairs,
    getId: (pair) => pair.name,
    open: (id, pair) => openTrigger(id, pair.trigger),
  })
  usePanelUrl({
    type: 'triggerSource',
    items: pairs,
    getId: (pair) => pair.name,
    open: (id, pair) => openTriggerSource(id, sourcePanelMetadata(pair)),
  })

  if (!loading && pairs.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Zap}
        hero={emptyHero}
        title={m.trigger_page_empty_title()}
        description={m.trigger_page_empty_description()}
        docsHref={TRIGGERS_DOCS}
      />
    )
  }

  const query = externalSearch.trim().toLowerCase()
  const open = (pair: TriggerPair) => {
    if (pair.source || pair.webhook)
      openTriggerSource(pair.name, sourcePanelMetadata(pair))
    else if (pair.trigger) openTrigger(pair.name, pair.trigger)
  }
  const { total, listening, running, incomplete } = triggerCounts(pairs)
  const shown = pairs.filter((pair) => matchesTriggerQuery(pair, query))

  return (
    <CardsPage>
      {!loading && !query && (
        <SummaryCard
          testId="triggers-summary"
          title={
            incomplete > 0
              ? incomplete === 1
                ? m.trigger_page_hero_incomplete_one()
                : m.trigger_page_hero_incomplete({ count: incomplete })
              : total === 1
                ? m.trigger_page_hero_title_one()
                : m.trigger_page_hero_title({ count: total })
          }
          blurb={m.trigger_page_hero_body()}
          facts={[
            {
              label: m.trigger_page_fact_triggers(),
              value: asI18n(String(total)),
            },
            {
              label: m.trigger_page_fact_listening(),
              value: m.trigger_page_fact_of({ done: listening, total }),
              tone: listening < total ? 'warn' : undefined,
            },
            {
              label: m.trigger_page_fact_running(),
              value: m.trigger_page_fact_of({ done: running, total }),
              tone: running < total ? 'warn' : undefined,
            },
          ]}
        />
      )}
      <SectionCard
        testId="triggers-list"
        title={m.trigger_page_list_title()}
        subtitle={
          shown.length === 1
            ? m.trigger_page_count_one()
            : m.trigger_page_count({ count: shown.length })
        }
        blurb={m.trigger_page_list_blurb()}
        footer={
          <ForDevelopers
            attached
            hint={m.trigger_page_dev_hint()}
            testId="triggers-developers"
          >
            <DevTable
              columns={[
                m.trigger_page_dev_col_name(),
                m.trigger_page_dev_col_source(),
                m.trigger_page_dev_col_handler(),
              ]}
              rows={pairs.map((pair) => ({
                key: pair.name,
                cells: [
                  <DevMono key="name" value={pair.name} copy />,
                  hasSource(pair) ? (
                    <Anchor
                      key="source"
                      component="button"
                      size="sm"
                      ff="monospace"
                      onClick={() =>
                        openTriggerSource(pair.name, sourcePanelMetadata(pair))
                      }
                    >
                      {asI18n(
                        pair.webhook
                          ? `${pair.webhook.source} (${pair.webhook.meta.route})`
                          : pair.source.pikkuFuncId || pair.name
                      )}
                    </Anchor>
                  ) : (
                    <Text key="source" size="sm" c="dimmed">
                      {m.trigger_page_dev_missing()}
                    </Text>
                  ),
                  pair.trigger ? (
                    <Anchor
                      key="handler"
                      component="button"
                      size="sm"
                      ff="monospace"
                      onClick={() => openTrigger(pair.name, pair.trigger)}
                    >
                      {asI18n(pair.trigger.pikkuFuncId || pair.name)}
                    </Anchor>
                  ) : (
                    <Text key="handler" size="sm" c="dimmed">
                      {m.trigger_page_dev_missing()}
                    </Text>
                  ),
                ],
              }))}
            />
          </ForDevelopers>
        }
      >
        <Stack gap="xs" mt="md">
          {shown.length === 0 ? (
            <Text size="sm" c="dimmed">
              {m.trigger_page_no_matches({ query: externalSearch.trim() })}
            </Text>
          ) : (
            shown.map((pair) => {
              const source = funcName(pair, 'source')
              const handler = funcName(pair, 'trigger')
              const ready = !!source && !!handler
              return (
                <CardRow
                  key={pair.name}
                  testId={`trigger-row-${pair.name}`}
                  leading={
                    <StatusTile tone={ready ? 'info' : 'warn'}>
                      {pair.webhook ? <Webhook size={18} /> : <Zap size={18} />}
                    </StatusTile>
                  }
                  title={asI18n(
                    toEnglishName(pair.name.replace(/[-_]+/g, ' '))
                  )}
                  badges={
                    <StatusBadge tone={ready ? 'good' : 'warn'} size="sm">
                      {ready
                        ? m.trigger_page_status_ready()
                        : !source
                          ? m.trigger_page_status_no_source()
                          : m.trigger_page_status_no_handler()}
                    </StatusBadge>
                  }
                  meta={
                    <>
                      {pair.webhook && source
                        ? pair.webhook.event
                          ? m.trigger_page_row_listens_webhook({
                              source,
                              event: pair.webhook.event,
                              route: pair.webhook.meta.route,
                            })
                          : m.trigger_page_row_listens_webhook_any({
                              source,
                              route: pair.webhook.meta.route,
                            })
                        : source
                          ? m.trigger_page_row_listens({ source })
                          : m.trigger_page_row_listens_none()}
                      {asI18n(' · ')}
                      {handler
                        ? m.trigger_page_row_runs({ handler })
                        : m.trigger_page_row_runs_none()}
                    </>
                  }
                  trailing={
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={m.trigger_page_row_show()}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation()
                        open(pair)
                      }}
                    >
                      <ChevronRight size={16} />
                    </ActionIcon>
                  }
                  onClick={() => open(pair)}
                />
              )
            })
          )}
        </Stack>
      </SectionCard>
    </CardsPage>
  )
}
