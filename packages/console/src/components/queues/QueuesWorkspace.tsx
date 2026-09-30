import React, { useMemo } from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { ChevronRight, ListOrdered, Workflow, Boxes } from 'lucide-react'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useQueueItems, type QueueItem } from '../../hooks/useQueueItems'
import { useQueueHistory } from '../../hooks/useQueueHistory'
import { toEnglishName } from '../../lib/strings'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'

const QUEUES_DOCS = 'https://pikku.dev/docs/wiring/queue'
const WORKFLOW_PREFIX = 'pikkuWorkflowOrchestrator:'

type QueueKind = 'yours' | 'workflow' | 'builtin'

interface QueueEntry {
  item: QueueItem
  kind: QueueKind
  title: string
  meta: I18nNode
  settings: string
}

const kebabToWords = (name: string) => {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const plainDescription = (text: string) => {
  const stripped = text.replace(/^queue (consumer|worker):\s*/i, '')
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

const kindOf = (item: QueueItem): QueueKind => {
  if (item.handler?.startsWith(WORKFLOW_PREFIX)) return 'workflow'
  const tags: string[] = item.data?.tags ?? []
  if (
    tags.includes('pikku') ||
    item.name.startsWith('pikku-') ||
    item.name.startsWith('fabric-')
  )
    return 'builtin'
  return 'yours'
}

const settingsOf = (item: QueueItem) => {
  const config = (item.data?.config ?? {}) as Record<string, unknown>
  const pairs = Object.entries(config).map(
    ([key, value]) => `${key}=${String(value)}`
  )
  if (item.concurrency) pairs.unshift(`concurrency=${item.concurrency}`)
  return pairs.join(', ')
}

const TONE: Record<QueueKind, StatusTone> = {
  yours: 'info',
  workflow: 'info',
  builtin: 'neutral',
}

export const QueuesWorkspace: React.FC<{
  searchQuery: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery, emptyHero }) => {
  useLocale()
  const { meta } = usePikkuMeta()
  const { openQueue } = usePanelContext()
  const { items, loading } = useQueueItems()
  const history = useQueueHistory()
  const query = searchQuery.trim().toLowerCase()

  usePanelUrl({
    type: 'queue',
    items,
    getId: (item) => item.name,
    open: (id, item) => openQueue(id, item.data),
  })

  const entries = useMemo((): QueueEntry[] => {
    const workflows = Object.values(meta.workflows ?? {}) as any[]
    return items.map((item) => {
      const kind = kindOf(item)
      const funcMeta = meta.functions?.find(
        (f: any) => f.pikkuFuncId === item.handler
      )
      const description: string | undefined =
        item.data?.description ?? funcMeta?.description
      if (kind === 'workflow') {
        const workflowName = item.handler!.slice(WORKFLOW_PREFIX.length)
        const workflow = workflows.find((w) => w.name === workflowName)
        const title = workflow?.displayName || toEnglishName(workflowName)
        return {
          item,
          kind,
          title,
          meta: m.queue_page_workflow_meta(),
          settings: settingsOf(item),
        }
      }
      return {
        item,
        kind,
        title: kebabToWords(
          kind === 'builtin'
            ? item.name.replace(/^(pikku|fabric)-/, '')
            : item.name
        ),
        meta: description
          ? asI18n(plainDescription(description))
          : kind === 'builtin'
            ? m.queue_page_builtin_meta()
            : m.queue_page_no_description(),
        settings: settingsOf(item),
      }
    })
  }, [items, meta.workflows, meta.functions])

  if (!loading && items.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={ListOrdered}
        hero={emptyHero}
        title={m.queue_page_empty_title()}
        description={m.queue_page_empty_description()}
        docsHref={QUEUES_DOCS}
      />
    )
  }

  const count = (kind: QueueKind) =>
    entries.filter((e) => e.kind === kind).length
  const visible = entries.filter((e) => e.kind !== 'workflow')
  const total = visible.length
  const shown = visible.filter(
    (e) =>
      !query ||
      [e.item.name, e.item.handler, e.title].some((v) =>
        v?.toLowerCase().includes(query)
      )
  )
  const yours = shown.filter((e) => e.kind === 'yours')
  const statsOf = (e: QueueEntry) => history?.queues[e.item.name]
  const weekTotal = (field: 'completed' | 'failed') =>
    visible.reduce((sum, e) => sum + (statsOf(e)?.[field] ?? 0), 0)
  const system = shown.filter((e) => e.kind !== 'yours')

  const renderRow = (e: QueueEntry) => (
    <CardRow
      key={e.item.name}
      testId={`queue-${e.item.name}`}
      leading={
        <StatusTile tone={TONE[e.kind]}>
          {e.kind === 'workflow' ? (
            <Workflow size={18} />
          ) : e.kind === 'builtin' ? (
            <Boxes size={18} />
          ) : (
            <ListOrdered size={18} />
          )}
        </StatusTile>
      }
      title={asI18n(e.title)}
      badges={
        <>
          {e.kind === 'workflow' && (
            <StatusBadge tone="info" size="sm">
              {m.queue_page_badge_workflow()}
            </StatusBadge>
          )}
          {e.kind === 'builtin' && (
            <StatusBadge tone="neutral" size="sm">
              {m.queue_page_badge_builtin()}
            </StatusBadge>
          )}
          {history &&
            (() => {
              const stats = statsOf(e)
              if (!stats || stats.completed + stats.failed === 0)
                return (
                  <StatusBadge tone="neutral" size="sm" dot={false}>
                    {m.queue_status_no_jobs()}
                  </StatusBadge>
                )
              return (
                <>
                  {stats.failed > 0 && (
                    <StatusBadge tone="bad" size="sm">
                      {m.queue_status_failed({ count: stats.failed })}
                    </StatusBadge>
                  )}
                  {stats.completed > 0 && (
                    <StatusBadge tone="good" size="sm">
                      {m.queue_status_done({ count: stats.completed })}
                    </StatusBadge>
                  )}
                </>
              )
            })()}
          {e.item.concurrency ? (
            <StatusBadge tone="neutral" size="sm">
              {m.queue_page_parallel({ count: e.item.concurrency })}
            </StatusBadge>
          ) : null}
        </>
      }
      meta={e.meta}
      trailing={
        <ChevronRight size={18} color="var(--mantine-color-dimmed)" />
      }
      onClick={() => openQueue(e.item.name, e.item.data)}
    />
  )

  const developers = (rows: QueueEntry[], testId: string) => (
    <ForDevelopers attached hint={m.queue_page_dev_hint()} testId={testId}>
      <DevTable
        columns={[
          m.queue_page_dev_col_queue(),
          m.queue_page_dev_col_function(),
          m.queue_page_dev_col_settings(),
        ]}
        rows={rows.map((e) => ({
          key: e.item.name,
          cells: [
            <DevMono key="queue" value={e.item.name} copy />,
            <DevMono key="function" value={e.item.handler ?? '—'} />,
            <DevMono key="settings" value={e.settings || '—'} />,
          ],
        }))}
      />
    </ForDevelopers>
  )

  return (
    <CardsPage>
      {!loading && !query && (
        <SummaryCard
          testId="queues-summary"
          title={
            total === 1
              ? m.queue_page_hero_title_one()
              : m.queue_page_hero_title({ count: total })
          }
          blurb={m.queue_page_hero_body()}
          facts={[
            { label: m.queue_page_fact_total(), value: asI18n(String(total)) },
            {
              label: m.queue_page_fact_yours(),
              value: asI18n(String(count('yours'))),
            },
            {
              label: m.queue_page_fact_builtin(),
              value: asI18n(String(count('builtin'))),
            },
            ...(history
              ? [
                  {
                    label: m.queue_status_fact_done(),
                    value: asI18n(String(weekTotal('completed'))),
                  },
                  {
                    label: m.queue_status_fact_failed(),
                    value: asI18n(String(weekTotal('failed'))),
                    tone: (weekTotal('failed') > 0
                      ? 'bad'
                      : 'neutral') as StatusTone,
                  },
                ]
              : []),
          ]}
        />
      )}
      {shown.length === 0 && (
        <SectionCard testId="queues-list" title={m.queue_page_yours_title()}>
          <Text size="sm" c="dimmed" mt="md">
            {m.queue_page_no_matches({ query: searchQuery.trim() })}
          </Text>
        </SectionCard>
      )}
      {yours.length > 0 && (
        <SectionCard
          testId="queues-yours"
          title={m.queue_page_yours_title()}
          subtitle={
            yours.length === 1
              ? m.queue_page_count_one()
              : m.queue_page_count({ count: yours.length })
          }
          blurb={m.queue_page_yours_blurb()}
          footer={developers(yours, 'queues-yours-developers')}
        >
          <Stack gap="xs" mt="md">
            {yours.map(renderRow)}
          </Stack>
        </SectionCard>
      )}
      {system.length > 0 && (
        <SectionCard
          testId="queues-system"
          title={m.queue_page_system_title()}
          subtitle={
            system.length === 1
              ? m.queue_page_count_one()
              : m.queue_page_count({ count: system.length })
          }
          blurb={m.queue_page_system_blurb()}
          footer={developers(system, 'queues-system-developers')}
        >
          <Stack gap="xs" mt="md">
            {system.map(renderRow)}
          </Stack>
        </SectionCard>
      )}
    </CardsPage>
  )
}
