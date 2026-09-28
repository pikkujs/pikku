import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { useQueries } from '@tanstack/react-query'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
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

const WORKFLOWS_DOCS = 'https://pikku.dev/docs/wiring/workflows'

interface WorkflowEntry {
  name: string
  title: string
  description?: string
  steps: number
  functions: string[]
}

const STATUS: Record<
  string,
  { tone: StatusTone; label: typeof m.workflows_status_completed }
> = {
  completed: { tone: 'good', label: m.workflows_status_completed },
  failed: { tone: 'bad', label: m.workflows_status_failed },
  running: { tone: 'info', label: m.workflows_status_running },
  suspended: { tone: 'warn', label: m.workflows_status_suspended },
  cancelled: { tone: 'neutral', label: m.workflows_status_cancelled },
}

export const WorkflowsWorkspace: React.FC<{
  onOpen: (name: string) => void
  searchQuery: string
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({ onOpen, searchQuery, emptyHero, metricSlot, icon: Icon }) => {
  useLocale()
  const { meta, loading } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const query = searchQuery.trim().toLowerCase()

  const workflows = useMemo(
    (): WorkflowEntry[] =>
      (Object.values(meta.workflows ?? {}) as any[])
        .filter((w) => w.source !== 'scenario' && w.scenario !== true)
        .map((w) => {
          const nodes = Object.values(w.nodes ?? {}) as { rpcName?: string }[]
          return {
            name: w.name,
            title: w.displayName || toEnglishName(w.name),
            description: w.description ?? w.summary,
            steps: w.nodes ? nodes.length : (w.steps?.length ?? 0),
            functions: [
              ...new Set(nodes.map((n) => n.rpcName).filter(Boolean)),
            ] as string[],
          }
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    [meta.workflows]
  )

  const lastRuns = useQueries({
    queries: workflows.map((w) => ({
      queryKey: ['workflow-last-run', w.name],
      queryFn: async () => {
        const runs = (await rpc.invoke('console:getWorkflowRuns', {
          workflowName: w.name,
          limit: 1,
          offset: 0,
        })) as { status: string }[] | undefined
        return runs?.[0]?.status ?? null
      },
      staleTime: 30 * 1000,
    })),
  })
  const statusOf = (index: number) =>
    lastRuns[index]?.isSuccess ? lastRuns[index].data : undefined

  if (!loading && workflows.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Icon}
        hero={emptyHero}
        title={m.workflows_empty_title()}
        description={m.workflows_empty_description()}
        docsHref={WORKFLOWS_DOCS}
      />
    )
  }

  const total = workflows.length
  const steps = workflows.reduce((sum, w) => sum + w.steps, 0)
  const known = lastRuns.every((r) => r.isSuccess)
  const ran = workflows.filter((_, i) => !!statusOf(i)).length
  const failed = workflows.filter((_, i) => statusOf(i) === 'failed').length
  const shown = workflows
    .map((w, index) => ({ ...w, index }))
    .filter(
      (w) =>
        !query ||
        [w.name, w.title, w.description].some((v) =>
          v?.toLowerCase().includes(query)
        )
    )

  return (
    <CardsPage>
      {!loading && !query && (
        <SummaryCard
          testId="workflows-summary"
          title={
            total === 1
              ? m.workflows_hero_title_one()
              : m.workflows_hero_title({ count: total })
          }
          blurb={
            known && ran === 0
              ? m.workflows_hero_body_never()
              : m.workflows_hero_body()
          }
          facts={[
            {
              label: m.workflows_fact_processes(),
              value: asI18n(String(total)),
            },
            {
              label: m.workflows_fact_steps(),
              value: asI18n(String(steps)),
            },
            {
              label: m.workflows_fact_ran(),
              value: known
                ? m.workflows_fact_of({ done: ran, total })
                : asI18n('—'),
            },
            {
              label: m.workflows_fact_failed(),
              value: known ? asI18n(String(failed)) : asI18n('—'),
              tone: failed > 0 ? 'bad' : undefined,
            },
          ]}
        />
      )}
      <SectionCard
        testId="workflows-list"
        title={m.workflows_list_title()}
        subtitle={
          shown.length === 1
            ? m.workflows_count_one()
            : m.workflows_count({ count: shown.length })
        }
        blurb={m.workflows_list_blurb()}
        footer={
          <ForDevelopers
            attached
            hint={m.workflows_dev_hint()}
            testId="workflows-developers"
          >
            <DevTable
              columns={[
                m.workflows_dev_col_process(),
                m.workflows_dev_col_code(),
                m.workflows_col_steps(),
                m.workflows_dev_col_functions(),
              ]}
              rows={workflows.map((w) => ({
                key: w.name,
                cells: [
                  <Text key="process" size="sm">
                    {asI18n(w.title)}
                  </Text>,
                  <DevMono key="code" value={w.name} copy />,
                  <Text key="steps" size="sm">
                    {asI18n(String(w.steps))}
                  </Text>,
                  <DevMono
                    key="functions"
                    value={w.functions.join(', ') || '—'}
                  />,
                ],
              }))}
            />
          </ForDevelopers>
        }
      >
        <Stack gap="xs" mt="md">
          {shown.length === 0 ? (
            <Text size="sm" c="dimmed">
              {m.workflows_no_matches({ query: searchQuery.trim() })}
            </Text>
          ) : (
            shown.map((w) => {
              const status = statusOf(w.index)
              const badge =
                status === null
                  ? { tone: 'neutral' as const, label: m.workflows_status_never() }
                  : status
                    ? STATUS[status] && {
                        tone: STATUS[status].tone,
                        label: STATUS[status].label(),
                      }
                    : undefined
              return (
                <CardRow
                  key={w.name}
                  testId={`workflow-${w.name}`}
                  leading={
                    <StatusTile tone={status === 'failed' ? 'bad' : 'info'}>
                      <Icon size={18} />
                    </StatusTile>
                  }
                  title={asI18n(w.title)}
                  badges={
                    badge ? (
                      <StatusBadge tone={badge.tone} size="sm">
                        {badge.label}
                      </StatusBadge>
                    ) : undefined
                  }
                  meta={
                    <>
                      {w.description
                        ? asI18n(w.description)
                        : m.workflows_no_description()}
                      {asI18n(' · ')}
                      {w.steps === 1
                        ? m.workflows_steps_one()
                        : m.workflows_steps({ count: w.steps })}
                    </>
                  }
                  trailing={metricSlot?.(w.name)}
                  onClick={() => onOpen(w.name)}
                />
              )
            })
          )}
        </Stack>
      </SectionCard>
    </CardsPage>
  )
}
