import React, { useCallback } from 'react'
import { Stack, Group, Text, Box, Button, Loader } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { GitBranch, Play } from 'lucide-react'
import { PikkuBadge } from '../ui/PikkuBadge'
import { SchemaForm } from '../ui/SchemaForm'
import type { PanelData } from '../../context/PanelContext'
import { useWorkflowRunContextSafe } from '../../context/WorkflowRunContext'
import { useStartWorkflowRun } from '../../hooks/useWorkflowRuns'
import { useWorkflowNode } from '../../context/WorkflowContext'
import { useWorkflowInputSchema } from '../../hooks/useWorkflowInputSchema'
import { FunctionTabbedPanel } from '../project/panels/FunctionDetailsForm'
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
import { GatewayConfiguration } from '../project/panels/GatewayConfiguration'
import { MiddlewareConfiguration } from '../project/panels/MiddlewarePanels'
import { PermissionConfiguration } from '../project/panels/PermissionsPanels'
import { AgentConfiguration } from '../project/panels/AgentPanels'
import {
  SecretConfiguration,
  VariableConfiguration,
} from '../project/panels/SecretVariablePanels'
import { CredentialUserPanel } from '../project/panels/CredentialUserPanel'
import { AuthProviderPanel } from '../project/panels/AuthProviderPanel'
import { DbColumnPanel } from '../project/panels/DbColumnPanel'
import { EmailPreviewPanel } from '../project/panels/EmailPreviewPanel'

interface PanelChild {
  id: string
  title: string
  content: React.ReactNode
  selfContained?: boolean
}

const WorkflowStepTabbedPanel: React.FC<{
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
        <PikkuBadge type="label" color="gray">
          {stepType}
        </PikkuBadge>
      </Group>
      <Box px="md" pt="md">
        {hasRun ? runContent : overviewContent}
      </Box>
    </Stack>
  )
}

const NewWorkflowRunForm: React.FC<{ workflowId: string }> = ({
  workflowId,
}) => {
  useLocale()
  const runContext = useWorkflowRunContextSafe()
  const startMutation = useStartWorkflowRun()
  const { schema: effectiveSchema, isLoading } = useWorkflowInputSchema()

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

  return (
    <Stack gap="md">
      {isLoading ? (
        <Loader size="sm" />
      ) : effectiveSchema ? (
        <SchemaForm
          schema={effectiveSchema}
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
            {m.workflows_run()}
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

const WorkflowTabbedPanel: React.FC<{ workflowId: string }> = ({
  workflowId,
}) => {
  const runContext = useWorkflowRunContextSafe()
  const hasRun = !!runContext?.selectedRunId
  const isCreating = !!runContext?.isCreatingRun

  return (
    <Stack gap="md">
      <Box px="md">
        <WorkflowHeader workflowId={workflowId} />
      </Box>
      <Box px="md" pt="md">
        {isCreating ? (
          <NewWorkflowRunForm workflowId={workflowId} />
        ) : hasRun ? (
          <WorkflowRunOverview workflowId={workflowId} />
        ) : (
          <Stack gap="xl">
            <WorkflowConfiguration workflowId={workflowId} />
            <WorkflowNodes workflowId={workflowId} />
            <WorkflowState workflowId={workflowId} />
          </Stack>
        )}
      </Box>
    </Stack>
  )
}

export const createPanelChildren = (panelData: PanelData): PanelChild[] => {
  switch (panelData.type) {
    case 'function':
      return [
        {
          id: 'configuration',
          title: 'Function',
          selfContained: true,
          content: (
            <FunctionTabbedPanel
              functionName={panelData.id}
              metadata={panelData.metadata}
            />
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

    case 'gateway':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <GatewayConfiguration
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

    case 'credentialUser':
      return [
        {
          id: 'configuration',
          title: 'Credentials',
          content: (
            <Box px="md">
              <CredentialUserPanel
                userId={panelData.id}
                metadata={panelData.metadata}
              />
            </Box>
          ),
        },
      ]

    case 'authProvider':
      return [
        {
          id: 'configuration',
          title: 'Configuration',
          content: (
            <Box px="md">
              <AuthProviderPanel metadata={panelData.metadata} />
            </Box>
          ),
        },
      ]

    case 'dbColumn':
      return [
        {
          id: 'configuration',
          title: 'Column',
          content: (
            <Box px="md">
              <DbColumnPanel metadata={panelData.metadata} />
            </Box>
          ),
        },
      ]

    case 'email':
      return [
        {
          id: 'preview',
          title: 'Email',
          content: (
            <Box px="md">
              <EmailPreviewPanel
                templateName={panelData.id}
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
