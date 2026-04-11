import React, { useState, useMemo } from 'react'
import { Text, Badge, Button } from '@mantine/core'
import { useNavigate } from '@/router'
import { GitBranch, Plus } from 'lucide-react'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
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
          <Badge size="xs" variant="light" color="violet" ml={8}>
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

interface WorkflowsListProps {
  workflows: WorkflowsMeta
  aiWorkflows?: Array<{
    workflowName: string
    graphHash: string
    graph: any
  }>
}

export const WorkflowsList: React.FunctionComponent<WorkflowsListProps> = ({
  workflows,
  aiWorkflows,
}) => {
  const [filter, setFilter] = useState<FilterValue>('all')
  const navigate = useNavigate()

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

  return (
    <TableListPage
      title="Workflows"
      icon={GitBranch}
      docsHref="https://pikku.dev/docs/wiring/workflows"
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
      headerRight={null}
    />
  )
}
