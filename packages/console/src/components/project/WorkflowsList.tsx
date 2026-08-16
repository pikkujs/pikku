import React, { useMemo, useState } from 'react'
import { Text, Tooltip, ActionIcon, Group } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useConsoleNavigator } from '../../context/ConsoleNavigatorContext'
import { ExternalLink, GitBranch } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import type { WorkflowsMeta } from '@pikku/core/workflow'

type FilterValue = 'all' | 'dsl' | 'graph'
type Workflow = WorkflowsMeta[string] & {
  nodes?: Record<string, unknown>
  source?: string
}

const COLUMNS = [
  {
    key: 'name',
    header: 'NAME',
    render: (w: Workflow) => <Text fw={500}>{asI18n(w.name)}</Text>,
  },
  {
    key: 'steps',
    header: 'STEPS',
    align: 'right' as const,
    render: (w: Workflow) => (
      <PikkuBadge
        type="dynamic"
        badge="steps"
        value={Object.keys(w.nodes || {}).length}
      />
    ),
  },
]

export interface WorkflowExtraColumn {
  label: string
  width?: string
  render: (workflowName: string) => React.ReactNode
}

interface WorkflowsListProps {
  workflows: WorkflowsMeta
  extraColumns?: WorkflowExtraColumn[]
  headerRight?: React.ReactNode
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export const WorkflowsList: React.FC<WorkflowsListProps> = ({
  workflows,
  extraColumns = [],
  headerRight,
  icon = GitBranch,
}) => {
  const [filter] = useState<FilterValue>('all')
  const { navigateTo } = useConsoleNavigator()

  const sortedWorkflows = useMemo(() => {
    const all: Workflow[] = workflows ? Object.values(workflows) : []

    return all.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [workflows])

  const filteredByType = useMemo(() => {
    if (filter === 'dsl') return sortedWorkflows.filter((w) => w.dsl === true)
    if (filter === 'graph') {
      return sortedWorkflows.filter((w) => w.dsl !== true)
    }
    return sortedWorkflows
  }, [sortedWorkflows, filter])

  const allColumns = [
    ...COLUMNS,
    ...extraColumns.map((col) => ({
      key: col.label,
      header: col.label.toUpperCase(),
      width: col.width,
      render: (w: Workflow) => col.render(w.name),
    })),
  ]

  return (
    <TableListPage
      title="Workflows"
      icon={icon}
      docsHref="https://pikku.dev/docs/wiring/workflows"
      data={filteredByType}
      columns={allColumns}
      getKey={(w) => w.name}
      onRowClick={(w) => navigateTo('workflows', w.name)}
      searchPlaceholder={asI18n('Search workflows...')}
      searchFilter={(w, q) =>
        (w.name?.toLowerCase().includes(q) ||
          w.pikkuFuncId?.toLowerCase().includes(q)) ??
        false
      }
      emptyMessage={asI18n('No workflows found.')}
      headerRight={
        <Group gap={4}>
          {headerRight}
          <Tooltip label={asI18n('Workflows docs')}>
            <ActionIcon
              component="a"
              href="https://pikku.dev/docs/wiring/workflows"
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              color="gray"
              size="sm"
            >
              <ExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      }
    />
  )
}
