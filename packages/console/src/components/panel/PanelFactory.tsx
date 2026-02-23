import React, { useCallback, useMemo } from 'react'
import { Tabs, Stack, Group, Text, Box, Button, Loader } from '@mantine/core'
import { GitBranch, Play } from 'lucide-react'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { SchemaForm } from '@/components/ui/SchemaForm'
import type { PanelData } from '@/context/PanelContext'
import { useWorkflowRunContextSafe } from '@/context/WorkflowRunContext'
import { useStartWorkflowRun } from '@/hooks/useWorkflowRuns'
import { useWorkflowContext, useWorkflowNode } from '@/context/WorkflowContext'
import { useFunctionMeta, useSchema } from '@/hooks/useWirings'
import { FunctionConfiguration } from '../project/panels/FunctionDetailsForm'
import {
  WorkflowStepConfiguration,
  WorkflowStepInput,
  WorkflowStepOutput,
  WorkflowStepBranches,
} from '../project/panels/WorkflowStepPanels'
import {
  WorkflowStepExecution,
  WorkflowStepInputData,
  WorkflowStepOutputData,
  WorkflowStepError,
  WorkflowStepRetryHistory,
} from '../project/panels/WorkflowStepRunPanels'
import {
  WorkflowHeader,
  WorkflowConfiguration,
  WorkflowNodes,
  WorkflowState,
  WorkflowRunOverview,
} from '../project/panels/WorkflowPanels'
import {
  HttpConfiguration,
  ChannelConfiguration,
  RpcConfiguration,
  SchedulerConfiguration,
  QueueConfiguration,
  CliConfiguration,
  McpConfiguration,
  TriggerConfiguration,
  TriggerSourceConfiguration,
} from '../project/panels/WiringPanels'
import { MiddlewareConfiguration } from '../project/panels/MiddlewarePanels'
import { PermissionConfiguration } from '../project/panels/PermissionsPanels'
import { AgentConfiguration } from '../project/panels/AgentPanels'
import {
  SecretConfiguration,
  VariableConfiguration,
} from '../project/panels/SecretVariablePanels'

interface PanelChild {
  id: string
  title: string
  content: React.ReactNode
}

const WorkflowStepTabbedPanel: React.FunctionComponent<{
  stepId: string
  metadata: any
}> = ({ stepId, metadata }) => {
  const runContext = useWorkflowRunContextSafe()
  const node = useWorkflowNode(stepId)
  const hasRun = !!runContext?.selectedRunId
  const stepType = metadata?.stepType
  const isTrigger = stepType === 'trigger'
  const isFlowControl = [
    'branch',
    'switch',
    'parallel',
    'fanout',
    'filter',
    'arrayPredicate',
  ].includes(stepType)
  const isReturn = stepType === 'return'

  const overviewContent = isFlowControl ? (
    <WorkflowStepBranches stepId={stepId} />
  ) : isReturn ? (
    <WorkflowStepOutput stepId={stepId} showOutputs />
  ) : (
    <Stack gap="xl">
      {!isTrigger && <WorkflowStepInput stepId={stepId} />}
      <WorkflowStepOutput stepId={stepId} />
      <WorkflowStepConfiguration stepId={stepId} />
    </Stack>
  )

  const runContent = (
    <Stack gap="xl">
      <WorkflowStepExecution stepId={stepId} />
      <WorkflowStepInputData stepId={stepId} />
      <WorkflowStepOutputData stepId={stepId} />
      <WorkflowStepError stepId={stepId} />
      <WorkflowStepRetryHistory stepId={stepId} />
    </Stack>
  )

  return (
    <Stack gap="md">
      <Group gap="xs" px="md">
        <GitBranch size={20} />
        <Text size="lg" ff="monospace">
          {node?.stepName || node?.nodeId || stepId}
        </Text>
        <PikkuBadge type="label" color="blue">
          {stepType}
        </PikkuBadge>
      </Group>
      <Tabs
        defaultValue={hasRun ? 'run' : 'overview'}
        key={hasRun ? 'with-run' : 'no-run'}
      >
        <Tabs.List grow>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="run" disabled={!hasRun}>
            Run
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md" px="md">
          {overviewContent}
        </Tabs.Panel>
        <Tabs.Panel value="run" pt="md" px="md">
          {runContent}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

const NewWorkflowRunForm: React.FunctionComponent<{ workflowId: string }> = ({
  workflowId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const startMutation = useStartWorkflowRun()
  const { workflow } = useWorkflowContext()

  const inputFuncId = useMemo(() => {
    if (workflow?.source === 'graph') {
      const entryNodeId = workflow.entryNodeIds?.[0]
      const entryNode = entryNodeId ? workflow.nodes?.[entryNodeId] : null
      return entryNode?.rpcName ?? null
    }
    return workflow?.pikkuFuncId ?? null
  }, [workflow])

  const { data: funcMeta, isLoading: funcLoading } = useFunctionMeta(
    inputFuncId ?? ''
  )
  const inputSchemaName = funcMeta?.inputSchemaName
  const { data: schema, isLoading: schemaLoading } = useSchema(inputSchemaName)

  const handleSubmit = useCallback(
    (formData: any) => {
      startMutation.mutate(
        { workflowName: workflowId, input: formData },
        {
          onSuccess: (data: any) => {
            if (data?.runId) {
              runContext?.setSelectedRunId(data.runId)
            }
            runContext?.setIsCreatingRun(false)
          },
        }
      )
    },
    [workflowId, startMutation, runContext]
  )

  const isLoading =
    (!!inputFuncId && funcLoading) || (!!inputSchemaName && schemaLoading)

  return (
    <Stack gap="md">
      {isLoading ? (
        <Loader size="sm" />
      ) : schema ? (
        <SchemaForm
          schema={schema}
          onSubmit={handleSubmit}
          submitting={startMutation.isPending}
        />
      ) : (
        <Group justify="flex-end">
          <Button
            leftSection={<Play size={16} />}
            onClick={() => handleSubmit({})}
            loading={startMutation.isPending}
          >
            Run
          </Button>
        </Group>
      )}
      {startMutation.isError && (
        <Text size="sm" c="red">
          {typeof (startMutation.error as any)?.message === 'string'
            ? (startMutation.error as any).message
            : JSON.stringify(
                (startMutation.error as any)?.message ?? startMutation.error,
                null,
                2
              ) || 'Failed to start workflow'}
        </Text>
      )}
    </Stack>
  )
}

const WorkflowTabbedPanel: React.FunctionComponent<{ workflowId: string }> = ({
  workflowId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const hasRun = !!runContext?.selectedRunId
  const isCreating = !!runContext?.isCreatingRun

  const showRun = hasRun || isCreating
  const defaultTab = showRun ? 'run' : 'overview'
  const tabKey = `${isCreating ? 'creating' : ''}${hasRun ? 'with-run' : 'no-run'}`

  return (
    <Stack gap="md">
      <Box px="md">
        <WorkflowHeader workflowId={workflowId} />
      </Box>
      <Tabs defaultValue={defaultTab} key={tabKey}>
        <Tabs.List grow>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          {showRun && (
            <Tabs.Tab value="run">{isCreating ? 'New Run' : 'Run'}</Tabs.Tab>
          )}
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md" px="md">
          <Stack gap="xl">
            <WorkflowConfiguration workflowId={workflowId} />
            <WorkflowNodes workflowId={workflowId} />
            <WorkflowState workflowId={workflowId} />
          </Stack>
        </Tabs.Panel>
        {showRun && (
          <Tabs.Panel value="run" pt="md" px="md">
            {isCreating ? (
              <NewWorkflowRunForm workflowId={workflowId} />
            ) : (
              <WorkflowRunOverview workflowId={workflowId} />
            )}
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  )
}

export const createPanelChildren = (panelData: PanelData): PanelChild[] => {
  switch (panelData.type) {
    case 'function':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <FunctionConfiguration
                functionName={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'workflowStep': {
      return [
        {
          id: 'step',
          title: 'Step',
          content: (
            <WorkflowStepTabbedPanel
              stepId={panelData.id}
              metadata={panelData.metadata}
            />
          ),
        },
      ]
    }

    case 'workflow':
      return [
        {
          id: 'workflow',
          title: 'Workflow',
          content: <WorkflowTabbedPanel workflowId={panelData.id} />,
        },
      ]

    case 'http':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <HttpConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'channel':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <ChannelConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'rpc':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <RpcConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'scheduler':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <SchedulerConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'queue':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <QueueConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'cli':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <CliConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'mcp':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <McpConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'trigger':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <TriggerConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'triggerSource':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <TriggerSourceConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'middleware':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <MiddlewareConfiguration
                middlewareId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'permission':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <PermissionConfiguration
                permissionId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'agent':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <AgentConfiguration
                wireId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'secret':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <SecretConfiguration
                secretId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'variable':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <VariableConfiguration
                variableId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    default:
      return []
  }
}
