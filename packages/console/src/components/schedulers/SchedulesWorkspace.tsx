import React, { useMemo } from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { Clock } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useUrlHash } from '../../hooks/useUrlHash'
import { useSchedulerItems } from '../../hooks/useSchedulerItems'
import { useSchedulerRuns } from '../../hooks/useSchedulerRuns'
import { describeCron } from '../../lib/cron'
import { runAgo } from '../scenarios/runs/scenario-run-format'
import { toEnglishName } from '../../lib/strings'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard, type SummaryFact } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'

const SCHEDULER_DOCS = 'https://pikku.dev/docs/wiring/scheduled-tasks'

const plainDescription = (text: string | undefined) => {
  const trimmed = text?.replace(/^\s*cron job:\s*/i, '').trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : undefined
}

const fieldCount = (field: string, min: number, max: number) => {
  let total = 0
  for (const part of field.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) return undefined
    let from = min
    let to = max
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number)
      if (!Number.isInteger(a)) return undefined
      from = a
      to = b === undefined ? (stepText === undefined ? a : max) : b
      if (!Number.isInteger(to) || to < from) return undefined
    }
    total += Math.floor((to - from) / step) + 1
  }
  return total
}

const runsPerDay = (cron: string) => {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return undefined
  const minutes = fieldCount(minute, 0, 59)
  const hours = fieldCount(hour, 0, 23)
  return minutes && hours ? minutes * hours : undefined
}

export const SchedulesWorkspace: React.FC<{
  searchQuery: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery, emptyHero }) => {
  const { locale } = useLocale()
  const { meta } = usePikkuMeta()
  const { openScheduler } = usePanelContext()
  const { items, loading } = useSchedulerItems()
  const runs = useSchedulerRuns()
  const [hash] = useUrlHash()
  const query = searchQuery.trim().toLowerCase()

  usePanelUrl({
    type: 'scheduler',
    items,
    getId: (item) => item.name,
    open: (id, item) => openScheduler(id, item.data),
  })

  const tasks = useMemo(
    () =>
      items
        .map((item) => {
          const func = (meta.functions as any[] | undefined)?.find(
            (f) => f.pikkuFuncId === item.handler
          )
          return {
            ...item,
            title: toEnglishName(item.name),
            description: plainDescription(func?.description ?? func?.summary),
            when: item.schedule ? describeCron(item.schedule) : undefined,
            perDay: item.schedule ? runsPerDay(item.schedule) : undefined,
            lastRun: runs ? (runs[item.name]?.lastRun ?? null) : undefined,
          }
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    [items, meta.functions, runs]
  )

  if (!loading && tasks.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Clock}
        hero={emptyHero}
        title={m.schedulers_empty_message()}
        description={m.schedulers_description()}
        docsHref={SCHEDULER_DOCS}
      />
    )
  }

  const total = tasks.length
  const counted = tasks.every((t) => t.perDay !== undefined)
  const perDay = tasks.reduce((sum, t) => sum + (t.perDay ?? 0), 0)
  const busiest = tasks.reduce<(typeof tasks)[number] | undefined>(
    (best, t) =>
      t.perDay !== undefined && (!best || t.perDay > (best.perDay ?? 0))
        ? t
        : best,
    undefined
  )
  const facts: SummaryFact[] = [
    {
      label: m.scheduler_page_fact_tasks(),
      value: asI18n(String(total)),
    },
    ...(counted
      ? [
          {
            label: m.scheduler_page_fact_runs(),
            value: asI18n(perDay.toLocaleString()),
          },
        ]
      : []),
    ...(busiest?.when
      ? [
          {
            label: m.scheduler_page_fact_most_often(),
            value: asI18n(busiest.when),
          },
        ]
      : []),
  ]
  const ran = tasks.filter((t) => t.lastRun)
  if (ran.length > 0) {
    facts.push({
      label: m.scheduler_status_fact_failed(),
      value: asI18n(
        String(ran.filter((t) => t.lastRun?.status === 'failed').length)
      ),
    })
  }
  const shown = tasks.filter(
    (t) =>
      !query ||
      [t.name, t.title, t.handler, t.schedule, t.when, t.description].some(
        (v) => v?.toLowerCase().includes(query)
      )
  )

  return (
    <CardsPage>
      {!loading && !query && (
        <SummaryCard
          testId="scheduler-summary"
          title={
            total === 1
              ? m.scheduler_page_hero_title_one()
              : m.scheduler_page_hero_title({ count: total })
          }
          blurb={m.scheduler_page_hero_body()}
          facts={facts}
        />
      )}
      <SectionCard
        testId="scheduler-list"
        title={m.scheduler_page_list_title()}
        subtitle={
          shown.length === 1
            ? m.scheduler_page_count_one()
            : m.scheduler_page_count({ count: shown.length })
        }
        blurb={m.scheduler_page_list_blurb()}
        footer={
          <ForDevelopers
            attached
            hint={m.scheduler_page_dev_hint()}
            testId="scheduler-developers"
          >
            <DevTable
              columns={[
                m.scheduler_page_dev_col_task(),
                m.scheduler_page_dev_col_code(),
                m.scheduler_page_dev_col_function(),
                m.scheduler_page_dev_col_cron(),
              ]}
              rows={tasks.map((t) => ({
                key: t.name,
                cells: [
                  <Text key="task" size="sm">
                    {asI18n(t.title)}
                  </Text>,
                  <DevMono key="code" value={t.name} copy />,
                  <DevMono key="function" value={t.handler ?? '—'} />,
                  <DevMono key="cron" value={t.schedule ?? '—'} />,
                ],
              }))}
            />
          </ForDevelopers>
        }
      >
        <Stack gap="xs" mt="md">
          {shown.length === 0 ? (
            <Text size="sm" c="dimmed">
              {m.scheduler_page_no_matches({ query: searchQuery.trim() })}
            </Text>
          ) : (
            shown.map((t) => (
              <CardRow
                key={t.name}
                testId={`scheduler-row-${t.name}`}
                leading={
                  <StatusTile
                    tone={t.lastRun?.status === 'failed' ? 'bad' : 'info'}
                  >
                    <Clock size={18} />
                  </StatusTile>
                }
                title={asI18n(t.title)}
                badges={
                  <>
                    {t.when && (
                      <StatusBadge tone="info" size="sm">
                        {asI18n(t.when)}
                      </StatusBadge>
                    )}
                    {t.lastRun ? (
                      <StatusBadge
                        tone={t.lastRun.status === 'failed' ? 'bad' : 'good'}
                        size="sm"
                      >
                        {t.lastRun.status === 'failed'
                          ? m.scheduler_status_failed_ago({
                              when: runAgo(
                                new Date(t.lastRun.timestamp).toISOString(),
                                locale
                              ),
                            })
                          : m.scheduler_status_succeeded_ago({
                              when: runAgo(
                                new Date(t.lastRun.timestamp).toISOString(),
                                locale
                              ),
                            })}
                      </StatusBadge>
                    ) : t.lastRun === null ? (
                      <StatusBadge tone="neutral" size="sm">
                        {m.scheduler_status_no_runs()}
                      </StatusBadge>
                    ) : null}
                  </>
                }
                meta={
                  t.description
                    ? asI18n(t.description)
                    : m.scheduler_page_no_description()
                }
                selected={hash === t.name}
                onClick={() => openScheduler(t.name, t.data)}
              />
            ))
          )}
        </Stack>
      </SectionCard>
    </CardsPage>
  )
}
