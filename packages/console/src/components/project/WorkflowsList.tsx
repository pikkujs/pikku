import React, { useState, useMemo } from 'react'
import {
  Text,
  Badge,
  Button,
  Drawer,
  Stack,
  TextInput,
  Textarea,
  Alert,
} from '@mantine/core'
import { useNavigate } from '@/router'
import {
  GitBranch,
  Plus,
  CheckCircle,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import {
  useCreateWorkflow,
  useGenerateWorkflowGraph,
} from '@/hooks/useWorkflowEditor'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import type { WorkflowsMeta } from '@pikku/core/workflow'

type FilterValue = 'all' | 'dsl' | 'graph' | 'ai-agent'
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
        {w.source === 'ai-agent' && (
          <Badge size="xs" variant="light" color="violet" ml={8}>
            AI Agent
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
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [success, setSuccess] = useState<string | null>(null)
  const navigate = useNavigate()
  const generateGraph = useGenerateWorkflowGraph()

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
            source: 'ai-agent',
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
        (w) => w.dsl !== true && w.source !== 'ai-agent'
      )
    if (filter === 'ai-agent')
      return sortedWorkflows.filter((w) => w.source === 'ai-agent')
    return sortedWorkflows
  }, [sortedWorkflows, filter])

  const handleGenerate = async () => {
    if (!newName.trim() || !aiPrompt.trim()) return
    setSuccess(null)
    try {
      const result = await generateGraph.mutateAsync({
        prompt: aiPrompt.trim(),
        workflowName: newName.trim(),
      })
      const tokens = `${result.inputTokens} in / ${result.outputTokens} out`
      const cost = result.costUsd ? ` · $${result.costUsd.toFixed(4)}` : ''
      setSuccess(`${result.message} (${tokens}${cost})`)
      setTimeout(() => {
        setCreateOpen(false)
        setNewName('')
        setNewDescription('')
        setAiPrompt('')
        setSuccess(null)
        navigate(
          `/workflow?id=${encodeURIComponent(result.workflowName)}`
        )
      }, 1500)
    } catch {}
  }

  return (
    <>
      <Drawer
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Workflow"
        position="right"
        size="md"
        styles={{
          content: { backgroundColor: 'var(--mantine-color-dark-7)', height: '100%' },
          header: { backgroundColor: 'var(--mantine-color-dark-7)' },
          body: { height: 'calc(100% - 60px)' },
          inner: { height: '100%' },
        }}
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="myWorkflow"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            size="xs"
            description="camelCase, e.g. processOrder"
          />
          <Textarea
            label="Description"
            placeholder="What does this workflow do?"
            value={newDescription}
            onChange={(e) => setNewDescription(e.currentTarget.value)}
            size="xs"
            minRows={2}
          />
          <Textarea
            label="AI Prompt"
            placeholder="Describe the workflow steps, e.g. 'Fetch the user's todos, filter overdue ones, send a reminder email for each'"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.currentTarget.value)}
            size="xs"
            minRows={4}
            maxRows={10}
            autosize
          />
          {success && (
            <Alert color="green" icon={<CheckCircle size={16} />}>
              {success}
            </Alert>
          )}
          {generateGraph.error && (
            <Alert color="red" icon={<AlertTriangle size={16} />}>
              {(generateGraph.error as Error).message}
            </Alert>
          )}
          <Button
            onClick={handleGenerate}
            loading={generateGraph.isPending}
            disabled={!newName.trim() || !aiPrompt.trim()}
            leftSection={<Sparkles size={14} />}
            size="xs"
            fullWidth
          >
            Generate Workflow
          </Button>
        </Stack>
      </Drawer>
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
      headerRight={
        <Button
          size="xs"
          leftSection={<Plus size={14} />}
          onClick={() => setCreateOpen(true)}
        >
          New Workflow
        </Button>
      }
    />
    </>
  )
}
