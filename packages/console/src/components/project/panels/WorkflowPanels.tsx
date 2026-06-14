import React from 'react'
import { Stack, Text, Group, Table, Card, Box, Anchor } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { GitBranch } from 'lucide-react'
import { useLink } from '../../../router'
import { useWorkflowContext } from '../../../context/WorkflowContext'
import { useWorkflowRunContextSafe } from '../../../context/WorkflowRunContext'
import { usePanelContext } from '../../../context/PanelContext'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { wiringTypeColor } from '../../ui/badge-defs'
import { SectionLabel } from '../../ui/SectionLabel'
import { DataViewer } from '../../ui/DataViewer'
import { CommonDetails } from './shared/CommonDetails'
import { EmptyState } from './shared/EmptyState'
import classes from '../../ui/console.module.css'

const TYPE_HREF: Record<string, string> = {
  http: '/apis?tab=http',
  channel: '/apis?tab=channels',
  mcp: '/apis?tab=mcp',
  cli: '/apis?tab=cli',
  rpc: '/apis?tab=http',
  scheduler: '/jobs?tab=schedulers',
  queue: '/jobs?tab=queues',
  trigger: '/jobs?tab=triggers',
  triggerSource: '/jobs?tab=triggers',
  agent: '/apis/agents',
}

interface WorkflowPanelProps {
  workflowId: string
}

export const WorkflowHeader: React.FC<WorkflowPanelProps> = ({
  workflowId,
}) => {
  const { workflow } = useWorkflowContext()

  return (
    <Box>
      <Group gap="xs">
        <GitBranch size={20} />
        <Text size="lg" ff="monospace" fw={600}>
          {asI18n(workflow?.name || workflowId)}
        </Text>
        {workflow?.graphHash && (
          <Text size="sm" ff="monospace" c="dimmed">
            {asI18n(`#${workflow.graphHash}`)}
          </Text>
        )}
      </Group>
      <Text size="sm" c="dimmed" mt={4}>
        {asI18n(workflow?.summary || 'No summary')}
      </Text>
    </Box>
  )
}

interface WiredTo {
  transports: Array<{ type: string; id: string; name: string }>
  jobs: Array<{ type: string; id: string; name: string }>
}

const WorkflowWiring: React.FC<{ wiredTo: WiredTo }> = ({ wiredTo }) => {
  const Link = useLink()
  if (wiredTo.transports.length === 0 && wiredTo.jobs.length === 0) {
    return null
  }

  return (
    <Stack gap="sm">
      {wiredTo.transports.length > 0 && (
        <Box>
          <SectionLabel>{asI18n('Wired To')}</SectionLabel>
          <Group gap={4} wrap="wrap">
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
                  className={classes.clickableText}
                >
                  {asI18n(t.name)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {wiredTo.jobs.length > 0 && (
        <Box>
          <SectionLabel>{asI18n('Jobs')}</SectionLabel>
          <Group gap={4} wrap="wrap">
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
                  className={classes.clickableText}
                >
                  {asI18n(j.name)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  )
}

export const WorkflowConfiguration: React.FC<WorkflowPanelProps> = ({
  workflowId,
}) => {
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
          <SectionLabel>{asI18n('Handler Function')}</SectionLabel>
          <Text size="sm" ff="monospace">
            {asI18n(workflow.pikkuFuncId)}
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

export const WorkflowNodes: React.FC<WorkflowPanelProps> = ({ workflowId }) => {
  const { workflow, setFocusedNode } = useWorkflowContext()
  const nodes = workflow?.nodes
  const hasNodes = nodes && Object.keys(nodes).length > 0

  return (
    <Stack gap={6}>
      <SectionLabel>{asI18n('Nodes')}</SectionLabel>
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
                        {asI18n(node.stepName || nodeId)}
                      </Text>
                      {node.stepName && node.stepName !== nodeId && (
                        <Text size="sm" c="dimmed">
                          {asI18n(nodeId)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {node.flow && (
                        <PikkuBadge type="label">{asI18n(node.flow)}</PikkuBadge>
                      )}
                      {node.rpcName && (
                        <PikkuBadge type="label" color="green">
                          {asI18n('RPC')}
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

const WorkflowRunNodes: React.FC<WorkflowPanelProps> = ({ workflowId }) => {
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
      <SectionLabel>{asI18n('Nodes')}</SectionLabel>
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
                    className={classes.clickableText}
                    onMouseEnter={() => setFocusedNode(nodeId)}
                    onMouseLeave={() => setFocusedNode(null)}
                    onClick={() => openWorkflowStep(nodeId, node.flow || 'rpc')}
                  >
                    <Table.Td>
                      <Text fw={500} ff="monospace" size="sm">
                        {asI18n(node.stepName || nodeId)}
                      </Text>
                      {node.stepName && node.stepName !== nodeId && (
                        <Text size="sm" c="dimmed">
                          {asI18n(nodeId)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {node.flow && (
                        <PikkuBadge type="label">{asI18n(node.flow)}</PikkuBadge>
                      )}
                      {node.rpcName && (
                        <PikkuBadge type="label" color="green">
                          {asI18n(node.rpcName)}
                        </PikkuBadge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <PikkuBadge type="status" value={step.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(String(step.attemptCount))}
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

export const WorkflowState: React.FC<WorkflowPanelProps> = ({ workflowId }) => {
  const { workflow } = useWorkflowContext()
  const context = workflow?.context
  const hasContext = context && Object.keys(context).length > 0

  return (
    <Stack gap={6}>
      <SectionLabel>{asI18n('State Variables')}</SectionLabel>
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
                          {asI18n(varName)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <PikkuBadge type="label">
                          {asI18n(varDef.type || 'unknown')}
                        </PikkuBadge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace" c="dimmed">
                          {asI18n(varDef.default !== undefined
                            ? String(varDef.default)
                            : '\u2014')}
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

const RunInput: React.FC<{ input: unknown }> = ({ input }) => {
  return (
    <Stack gap={6}>
      <SectionLabel>{asI18n('Input')}</SectionLabel>
      <Card withBorder radius="md" padding={0}>
        <Card.Section p="md">
          <DataViewer data={input} />
        </Card.Section>
      </Card>
    </Stack>
  )
}

export const WorkflowRunOverview: React.FC<WorkflowPanelProps> = ({
  workflowId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const runData = runContext?.runData

  if (!runData) {
    return (
      <Stack gap={6}>
        <SectionLabel>{asI18n('Run')}</SectionLabel>
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
        <SectionLabel>{asI18n('Run')}</SectionLabel>
        <PikkuBadge type="status" value={runData.status} variant="filled" />
      </Group>

      <Stack gap={6}>
        <SectionLabel>{asI18n('Details')}</SectionLabel>
        <Card withBorder radius="md" padding={0}>
          <Card.Section>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {asI18n('Run ID')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {asI18n(runData.id)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {asI18n('Started')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {asI18n(formatTimestamp(runData.createdAt))}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {endTime && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Ended')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(formatTimestamp(endTime))}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {duration && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Duration')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace" fw={500}>
                        {asI18n(duration)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {runData.wire && (
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {asI18n('Wire')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <PikkuBadge
                          type="label"
                          size="sm"
                          color={wiringTypeColor(runData.wire.type)}
                        >
                          {asI18n(runData.wire.type)}
                        </PikkuBadge>
                        {runData.wire.id && (
                          <Text size="sm" ff="monospace">
                            {asI18n(runData.wire.id)}
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
                        {asI18n('Graph Hash')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(runData.graphHash)}
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

      {runData.input && <RunInput input={runData.input} />}

      {runData.output && (
        <Stack gap={6}>
          <SectionLabel>{asI18n('Output')}</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <DataViewer data={runData.output} />
            </Card.Section>
          </Card>
        </Stack>
      )}

      {runData.error && (
        <Stack gap={6}>
          <SectionLabel>{asI18n('Error')}</SectionLabel>
          <Card withBorder radius="md" padding={0}>
            <Card.Section p="md">
              <Text size="sm" ff="monospace" c="red">
                {asI18n(typeof runData.error.message === 'string'
                  ? runData.error.message
                  : JSON.stringify(
                      runData.error.message ?? runData.error,
                      null,
                      2
                    ))}
              </Text>
            </Card.Section>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
