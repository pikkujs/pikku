import React from 'react'
import {
  Stack,
  Text,
  Group,
  Table,
  Card,
  Box,
  Code,
  Anchor,
} from '@mantine/core'
import { GitBranch } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkflowContext } from '@/context/WorkflowContext'
import { useWorkflowRunContextSafe } from '@/context/WorkflowRunContext'
import { usePanelContext } from '@/context/PanelContext'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { wiringTypeColor } from '@/components/ui/badge-defs'
import { CommonDetails } from '@/components/project/panels/shared/CommonDetails'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { EmptyState } from '@/components/project/panels/shared/EmptyState'

const TYPE_HREF: Record<string, string> = {
  http: '/apis/http',
  channel: '/apis/channels',
  mcp: '/apis/mcp',
  cli: '/apis/cli',
  rpc: '/apis/http',
  scheduler: '/jobs/schedulers',
  queue: '/jobs/queues',
  trigger: '/jobs/triggers',
  triggerSource: '/jobs/triggers',
  agent: '/apis/agents',
}

interface WorkflowPanelProps {
  workflowId: string
}

export const WorkflowHeader: React.FunctionComponent<WorkflowPanelProps> = ({
  workflowId,
}) => {
  const { workflow } = useWorkflowContext()

  return (
    <Box>
      <Group gap="xs">
        <GitBranch size={20} />
        <Text size="lg" ff="monospace" fw={600}>
          {workflow?.name || workflowId}
        </Text>
        {workflow?.graphHash && (
          <Text size="xs" ff="monospace" c="dimmed">
            #{workflow.graphHash}
          </Text>
        )}
      </Group>
      <Text size="sm" c="dimmed" mt={4}>
        {workflow?.summary || 'No summary'}
      </Text>
    </Box>
  )
}

interface WiredTo {
  transports: Array<{ type: string; id: string; name: string }>
  jobs: Array<{ type: string; id: string; name: string }>
}

const WorkflowWiring: React.FunctionComponent<{ wiredTo: WiredTo }> = ({
  wiredTo,
}) => {
  if (wiredTo.transports.length === 0 && wiredTo.jobs.length === 0) {
    return null
  }

  return (
    <Stack gap="sm">
      {wiredTo.transports.length > 0 && (
        <Box>
          <SectionLabel>Wired To</SectionLabel>
          <Group gap={4} style={{ flexWrap: 'wrap' }}>
            {wiredTo.transports.map((t) => (
              <Anchor
                key={t.id}
                component={Link}
                to={TYPE_HREF[t.type] || '#'}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(t.type)}
                  style={{ cursor: 'pointer' }}
                >
                  {t.name}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {wiredTo.jobs.length > 0 && (
        <Box>
          <SectionLabel>Jobs</SectionLabel>
          <Group gap={4} style={{ flexWrap: 'wrap' }}>
            {wiredTo.jobs.map((j) => (
              <Anchor
                key={j.id}
                component={Link}
                to={TYPE_HREF[j.type] || '#'}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(j.type)}
                  style={{ cursor: 'pointer' }}
                >
                  {j.name}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  )
}

export const WorkflowConfiguration: React.FunctionComponent<
  WorkflowPanelProps
> = ({ workflowId }) => {
  const { workflow } = useWorkflowContext()
  const middleware = workflow?.middleware || []
  const permissions = workflow?.permissions || []
  const tags = workflow?.tags || []

  return (
    <Stack gap="lg">
      {permissions.length > 0 && (
        <Group gap="xs">
          <PikkuBadge type="flag" flag="permissioned" />
        </Group>
      )}

      {workflow?.wiredTo && <WorkflowWiring wiredTo={workflow.wiredTo} />}

      {workflow?.pikkuFuncId && (
        <Box>
          <SectionLabel>Handler Function</SectionLabel>
          <Text size="sm" ff="monospace">
            {workflow.pikkuFuncId}
          </Text>
        </Box>
      )}

      <CommonDetails
        description={workflow?.description}
        middleware={middleware}
        permissions={permissions}
        tags={tags}
      />
    </Stack>
  )
}

export const WorkflowNodes: React.FunctionComponent<WorkflowPanelProps> = ({
  workflowId,
}) => {
  const { workflow, setFocusedNode } = useWorkflowContext()
  const nodes = workflow?.nodes
  const hasNodes = nodes && Object.keys(nodes).length > 0

  return (
    <Stack gap={6}>
      <SectionLabel>Nodes</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        {hasNodes ? (
          <Card.Section>
            <Table verticalSpacing={4} horizontalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Name
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Type
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(nodes).map(([nodeId, node]: [string, any]) => (
                  <Table.Tr
                    key={nodeId}
                    onMouseEnter={() => setFocusedNode(nodeId)}
                    onMouseLeave={() => setFocusedNode(null)}
                  >
                    <Table.Td>
                      <Text fw={500} ff="monospace" size="sm">
                        {node.stepName || nodeId}
                      </Text>
                      {node.stepName && node.stepName !== nodeId && (
                        <Text size="xs" c="dimmed">
                          {nodeId}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {node.flow && (
                        <PikkuBadge type="label">{node.flow}</PikkuBadge>
                      )}
                      {node.rpcName && (
                        <PikkuBadge type="label" color="green">
                          RPC
                        </PikkuBadge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card.Section>
        ) : (
          <Card.Section p="md">
            <EmptyState />
          </Card.Section>
        )}
      </Card>
    </Stack>
  )
}

const WorkflowRunNodes: React.FunctionComponent<WorkflowPanelProps> = ({
  workflowId,
}) => {
  const { workflow, setFocusedNode } = useWorkflowContext()
  const runContext = useWorkflowRunContextSafe()
  const { openWorkflowStep } = usePanelContext()
  const nodes = workflow?.nodes
  const stepStates = runContext?.stepStates
  const executedNodes = nodes
    ? Object.entries(nodes).filter(([nodeId]) => stepStates?.has(nodeId))
    : []

  if (executedNodes.length === 0) {
    return null
  }

  return (
    <Stack gap={6}>
      <SectionLabel>Nodes</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        <Card.Section>
          <Table verticalSpacing={4} horizontalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th c="dimmed" fw={500} fz="xs">
                  Name
                </Table.Th>
                <Table.Th c="dimmed" fw={500} fz="xs">
                  Type
                </Table.Th>
                <Table.Th c="dimmed" fw={500} fz="xs">
                  Status
                </Table.Th>
                <Table.Th c="dimmed" fw={500} fz="xs">
                  Runs
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {executedNodes.map(([nodeId, node]: [string, any]) => {
                const step = stepStates!.get(nodeId)
                return (
                  <Table.Tr
                    key={nodeId}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setFocusedNode(nodeId)}
                    onMouseLeave={() => setFocusedNode(null)}
                    onClick={() => openWorkflowStep(nodeId, node.flow || 'rpc')}
                  >
                    <Table.Td>
                      <Text fw={500} ff="monospace" size="sm">
                        {node.stepName || nodeId}
                      </Text>
                      {node.stepName && node.stepName !== nodeId && (
                        <Text size="xs" c="dimmed">
                          {nodeId}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {node.flow && (
                        <PikkuBadge type="label">{node.flow}</PikkuBadge>
                      )}
                      {node.rpcName && (
                        <PikkuBadge type="label" color="green">
                          {node.rpcName}
                        </PikkuBadge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <PikkuBadge type="status" value={step.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {step.attemptCount}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Card.Section>
      </Card>
    </Stack>
  )
}

export const WorkflowState: React.FunctionComponent<WorkflowPanelProps> = ({
  workflowId,
}) => {
  const { workflow } = useWorkflowContext()
  const context = workflow?.context
  const hasContext = context && Object.keys(context).length > 0

  return (
    <Stack gap={6}>
      <SectionLabel>State Variables</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        {hasContext ? (
          <Card.Section>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Variable
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Type
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Default
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(context).map(
                  ([varName, varDef]: [string, any]) => (
                    <Table.Tr key={varName}>
                      <Table.Td>
                        <Text fw={500} ff="monospace" size="sm">
                          {varName}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <PikkuBadge type="label">
                          {varDef.type || 'unknown'}
                        </PikkuBadge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace" c="dimmed">
                          {varDef.default !== undefined
                            ? String(varDef.default)
                            : '\u2014'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )
                )}
              </Table.Tbody>
            </Table>
          </Card.Section>
        ) : (
          <Card.Section p="md">
            <EmptyState />
          </Card.Section>
        )}
      </Card>
    </Stack>
  )
}

const formatTimestamp = (ts: string | undefined) => {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString()
}

const formatDuration = (start: string | undefined, end: string | undefined) => {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export const WorkflowRunOverview: React.FunctionComponent<
  WorkflowPanelProps
> = ({ workflowId }) => {
  const runContext = useWorkflowRunContextSafe()
  const runData = runContext?.runData

  if (!runData) {
    return (
      <Stack gap={6}>
        <SectionLabel>Run</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section p="md">
            <EmptyState />
          </Card.Section>
        </Card>
      </Stack>
    )
  }

  const endTime =
    runData.status === 'completed' ||
    runData.status === 'failed' ||
    runData.status === 'cancelled'
      ? runData.updatedAt
      : undefined
  const duration = formatDuration(runData.createdAt, endTime)

  return (
    <Stack gap="md">
      <Group gap="xs">
        <SectionLabel>Run</SectionLabel>
        <PikkuBadge type="status" value={runData.status} variant="filled" />
      </Group>

      <Stack gap={6}>
        <SectionLabel>Details</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      Run ID
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {runData.id}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      Started
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {formatTimestamp(runData.createdAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {endTime && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        Ended
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {formatTimestamp(endTime)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {duration && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        Duration
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace" fw={500}>
                        {duration}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {runData.wire && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        Wire
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <PikkuBadge
                          type="label"
                          size="sm"
                          color={wiringTypeColor(runData.wire.type)}
                        >
                          {runData.wire.type}
                        </PikkuBadge>
                        {runData.wire.id && (
                          <Text size="sm" ff="monospace">
                            {runData.wire.id}
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )}
                {runData.graphHash && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        Graph Hash
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {runData.graphHash}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Card.Section>
        </Card>
      </Stack>

      <WorkflowRunNodes workflowId={workflowId} />

      {runData.input && (
        <Stack gap={6}>
          <SectionLabel>Input</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <Code block>{JSON.stringify(runData.input, null, 2)}</Code>
            </Card.Section>
          </Card>
        </Stack>
      )}

      {runData.output && (
        <Stack gap={6}>
          <SectionLabel>Output</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <Code block>{JSON.stringify(runData.output, null, 2)}</Code>
            </Card.Section>
          </Card>
        </Stack>
      )}

      {runData.error && (
        <Stack gap={6}>
          <SectionLabel>Error</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <Text size="sm" ff="monospace" c="red">
                {typeof runData.error.message === 'string'
                  ? runData.error.message
                  : JSON.stringify(
                      runData.error.message ?? runData.error,
                      null,
                      2
                    )}
              </Text>
            </Card.Section>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
