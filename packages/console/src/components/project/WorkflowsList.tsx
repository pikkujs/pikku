import React, { useState, useMemo } from 'react'
import { Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { GitBranch } from 'lucide-react'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import type { WorkflowsMeta } from '@pikku/core/workflow'

type FilterValue = 'all' | 'dsl' | 'graph'
type Workflow = WorkflowsMeta[string] & { nodes?: Record<string, unknown> }

const COLUMNS = [
  {
    key: 'name',
    header: 'NAME',
    render: (w: Workflow) => <Text fw={500}>{w.name}</Text>,
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

interface WorkflowsListProps {
  workflows: WorkflowsMeta
}

export const WorkflowsList: React.FunctionComponent<WorkflowsListProps> = ({
  workflows,
}) => {
  const [filter, setFilter] = useState<FilterValue>('all')
  const navigate = useNavigate()

  const sortedWorkflows = useMemo(() => {
    if (!workflows) return []
    return Object.values(workflows).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [workflows])

  const filteredByType = useMemo(() => {
    if (filter === 'dsl') return sortedWorkflows.filter((w) => w.dsl === true)
    if (filter === 'graph') return sortedWorkflows.filter((w) => w.dsl !== true)
    return sortedWorkflows
  }, [sortedWorkflows, filter])

  return (
    <TableListPage
      title="Workflows"
      icon={GitBranch}
      docsHref="https://pikkujs.com/docs/workflows"
      data={filteredByType}
      columns={COLUMNS}
      getKey={(w) => w.name}
      onRowClick={(w) => navigate(`/workflow?id=${encodeURIComponent(w.name)}`)}
      searchPlaceholder="Search workflows..."
      searchFilter={(w, q) =>
        (w.name?.toLowerCase().includes(q) ||
          w.pikkuFuncId?.toLowerCase().includes(q)) ??
        false
      }
      emptyMessage="No workflows found."
    />
  )
}
