import React, { useMemo } from 'react'
import { Text, Badge } from '@mantine/core'
import { useConsoleNavigator } from '../../context/ConsoleNavigatorContext'
import { GitBranch } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import type { WorkflowsMeta } from '@pikku/core/workflow'

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
  workflows: Workflow[]
  extraColumns?: WorkflowExtraColumn[]
}

export const WorkflowsList: React.FC<WorkflowsListProps> = ({
  workflows,
  extraColumns = [],
}) => {
  const { navigateTo } = useConsoleNavigator()

  const sorted = useMemo(
    () => [...workflows].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [workflows]
  )

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
      icon={GitBranch}
      docsHref="https://pikku.dev/docs/wiring/workflows"
      data={sorted}
      columns={allColumns}
      getKey={(w) => w.name}
      onRowClick={(w) => navigateTo('workflows', w.name)}
      emptyMessage="No workflows found."
    />
  )
}
