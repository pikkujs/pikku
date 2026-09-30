import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Text } from '@pikku/mantine/core'
import { GitBranch } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { TableListPage } from '../layout/TableListPage'
import { toEnglishName } from '../../lib/strings'

export interface WorkflowListPanelProps {
  onOpen: (name: string) => void
  searchQuery?: string
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

interface WorkflowRow {
  name: string
  title: string
  funcId?: string
  description?: string
  steps: number
}

export const WorkflowListPanel: React.FC<WorkflowListPanelProps> = ({
  onOpen,
  searchQuery = '',
  emptyHero,
  metricSlot,
  icon = GitBranch,
}) => {
  useLocale()
  const { meta, loading } = usePikkuMeta()

  const rows = useMemo(
    (): WorkflowRow[] =>
      (Object.values(meta.workflows ?? {}) as any[])
        .filter((w) => w.source !== 'scenario' && w.scenario !== true)
        .map((w) => ({
          name: w.name,
          title: w.displayName || toEnglishName(w.name),
          funcId: w.pikkuFuncId,
          description: w.description ?? w.summary,
          steps: w.nodes
            ? Object.keys(w.nodes).length
            : (w.steps?.length ?? 0),
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [meta.workflows]
  )

  const columns = [
    {
      key: 'name',
      header: m.workflows_col_workflow(),
      width: '100%',
      maxWidth: 0,
      render: (w: WorkflowRow) => (
        <>
          <Text size="sm" fw={600} truncate>
            {asI18n(w.title)}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {w.funcId ? (
              <Text span ff="monospace" fz="xs">
                {asI18n(w.funcId)}
              </Text>
            ) : null}
            {w.description
              ? asI18n(`${w.funcId ? ' · ' : ''}${w.description}`)
              : null}
          </Text>
        </>
      ),
    },
    {
      key: 'steps',
      header: m.workflows_col_steps(),
      width: 90,
      align: 'right' as const,
      render: (w: WorkflowRow) => (
        <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {asI18n(String(w.steps))}
        </Text>
      ),
    },
    ...(metricSlot
      ? [
          {
            key: 'last-run',
            header: m.workflows_col_last_run(),
            width: 200,
            render: (w: WorkflowRow) => metricSlot(w.name),
          },
        ]
      : []),
  ]

  return (
    <TableListPage
      title={m.workflows_title()}
      icon={icon}
      docsHref="https://pikku.dev/docs/wiring/workflows"
      data={rows}
      columns={columns}
      getKey={(w) => w.name}
      onRowClick={(w) => onOpen(w.name)}
      externalSearch={searchQuery}
      searchFilter={(w, q) =>
        w.title.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        (w.funcId?.toLowerCase().includes(q) ?? false) ||
        (w.description?.toLowerCase().includes(q) ?? false)
      }
      loading={loading}
      emptyHero={emptyHero}
      emptyTitle={m.workflows_empty_title()}
      emptyDescription={m.workflows_empty_description()}
    />
  )
}
