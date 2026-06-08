import React, { useState, useMemo } from 'react'
import { Text, Badge, Tooltip, ActionIcon, Group } from '@mantine/core'
import { useConsoleNavigator } from '../../context/ConsoleNavigatorContext'
import { GitBranch, ExternalLink } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import type { WorkflowsMeta } from '@pikku/core/workflow'

type FilterValue = 'all' | 'dsl' | 'graph' | 'dynamic-workflow'
type Workflow = WorkflowsMeta[string] & {
  nodes?: Record<string, unknown>
  source?: string
}

const COLUMNS = [
  {
    key: 'name',
    header: 'NAME',
    render: (w: Workflow) => (
      <Text fw={500}>
        {w.name}
        {w.source === 'dynamic-workflow' && (
          <Badge size="sm" variant="light" color="violet" ml={8}>
            Dynamic
          </Badge>
        )}
      </Text>
    ),
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
  aiWorkflows?: Array<{
    workflowName: string
    graphHash: string
    graph: any
  }>
  extraColumns?: WorkflowExtraColumn[]
  headerRight?: React.ReactNode
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

export const WorkflowsList: React.FC<WorkflowsListProps> = ({
  workflows,
  aiWorkflows,
  extraColumns = [],
  headerRight,
  icon = GitBranch,
}) => {
  const [filter, setFilter] = useState<FilterValue>('all')
  const { navigateTo } = useConsoleNavigator()

  const sortedWorkflows = useMemo(() => {
    const all: Workflow[] = workflows ? Object.values(workflows) : []

    if (aiWorkflows) {
      const existingNames = new Set(all.map((w) => w.name))
      for (const ai of aiWorkflows) {
        if (!existingNames.has(ai.workflowName)) {
          all.push({
            name: ai.workflowName,
            pikkuFuncId: ai.workflowName,
            steps: [],
            source: 'dynamic-workflow',
            nodes: ai.graph?.nodes,
          })
        }
      }
    }

    return all.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [workflows, aiWorkflows])

  const filteredByType = useMemo(() => {
    if (filter === 'dsl') return sortedWorkflows.filter((w) => w.dsl === true)
    if (filter === 'graph')
      return sortedWorkflows.filter(
        (w) => w.dsl !== true && w.source !== 'dynamic-workflow'
      )
    if (filter === 'dynamic-workflow')
      return sortedWorkflows.filter((w) => w.source === 'dynamic-workflow')
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
      searchPlaceholder="Search workflows..."
      searchFilter={(w, q) =>
        (w.name?.toLowerCase().includes(q) ||
          w.pikkuFuncId?.toLowerCase().includes(q)) ??
        false
      }
      emptyMessage="No workflows found."
      headerRight={
        <Group gap={4}>
          {headerRight}
          <Tooltip label="Workflows docs">
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
