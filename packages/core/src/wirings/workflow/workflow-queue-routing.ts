import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import { getDurationInMilliseconds } from '../../time-utils.js'
import type {
  JobGroup,
  JobOptions,
  QueueService,
} from '../queue/queue.types.js'
import type {
  WorkflowServiceConfig,
  WorkflowStepOptions,
} from './workflow.types.js'
import { DEFAULT_STEP_RETRIES } from './workflow-constants.js'

export type WorkflowQueueStrategy = 'per-workflow' | 'shared-groups'

const toKebab = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

export const resolveWorkflowConfig = (): WorkflowServiceConfig => {
  const workflow = getSingletonServices().config?.workflow
  return {
    retries: workflow?.retries ?? DEFAULT_STEP_RETRIES,
    retryDelay: workflow?.retryDelay ?? 0,
    orchestratorQueueName:
      workflow?.orchestratorQueueName ?? 'pikku-workflow-orchestrator',
    stepWorkerQueueName:
      workflow?.stepWorkerQueueName ?? 'pikku-workflow-step-worker',
    sleeperRPCName: workflow?.sleeperRPCName ?? 'pikkuWorkflowSleeper',
  }
}

/**
 * Falls back to the shared queue whenever the dedicated one was not generated
 * into queue meta, so a workflow added without a rebuild still runs.
 */
const dedicatedQueueName = (
  prefix: string,
  name: string | undefined,
  strategy: WorkflowQueueStrategy,
  fallback: string
): string => {
  if (!name || strategy === 'shared-groups') {
    return fallback
  }
  const dedicated = `${prefix}${toKebab(name)}`
  return pikkuState(null, 'queue', 'meta')[dedicated] ? dedicated : fallback
}

export const orchestratorQueueName = (
  strategy: WorkflowQueueStrategy,
  workflowName?: string
): string =>
  dedicatedQueueName(
    'wf-orchestrator-',
    workflowName,
    strategy,
    resolveWorkflowConfig().orchestratorQueueName
  )

export const stepWorkerQueueName = (
  strategy: WorkflowQueueStrategy,
  rpcName?: string
): string =>
  dedicatedQueueName(
    'wf-step-',
    rpcName,
    strategy,
    resolveWorkflowConfig().stepWorkerQueueName
  )

/**
 * How a step reaches its worker: on the queue, or here in the orchestrator.
 *
 * A step naming a workflow queues whenever a queue exists, even unmarked. Run
 * here, it holds the parent's run lock — and its lock connection — until the
 * child ends, and marks the child inline so the child's own `sleep` degrades
 * from a suspension into a real in-process wait. Workflows cannot opt in
 * through `workflowQueued`: that flag is read off `rpc` meta, and `addWorkflow`
 * never registers there.
 *
 * Throws only for a step that asked for the queue by name and has none, which
 * is a deployment missing a service rather than a routing choice.
 *
 * `parentIsInline` is a thunk because resolving it can read the run store, and
 * every step dispatch would pay for that — only a step that names a workflow
 * and has a queue to reach ever asks.
 */
export const stepDispatchTarget = async (
  rpcName: string,
  stepName: string,
  parentIsInline: () => Promise<boolean>
): Promise<'queue' | 'inline'> => {
  const rpcFuncId = pikkuState(null, 'rpc', 'meta')[rpcName]
  const rpcMeta =
    typeof rpcFuncId === 'string'
      ? pikkuState(null, 'function', 'meta')[rpcFuncId]
      : undefined
  const hasQueue = getSingletonServices()?.queueService !== undefined
  if (rpcMeta?.workflowQueued === true) {
    if (!hasQueue) {
      throw new Error(
        `Workflow step '${stepName}' (function '${rpcName}') is marked 'workflowQueued: true' but no queue service is configured.`
      )
    }
    return 'queue'
  }
  const isWorkflow =
    pikkuState(null, 'workflows', 'meta')[rpcName] !== undefined
  if (!isWorkflow || !hasQueue) {
    return 'inline'
  }
  return (await parentIsInline()) ? 'inline' : 'queue'
}

export const jobGroupFor = (
  strategy: WorkflowQueueStrategy,
  id?: string
): JobGroup | undefined =>
  id && strategy === 'shared-groups' ? { id, tier: id } : undefined

/** The queue a remote run is driven through, or a clear account of its absence. */
export const requireQueueService = (): QueueService => {
  const queueService = getSingletonServices()?.queueService
  if (!queueService) {
    throw new Error(
      'QueueService not configured. Remote workflows require a queue service.'
    )
  }
  return queueService
}

export const stepJobOptions = (
  stepOptions?: WorkflowStepOptions
): JobOptions => {
  const retries = stepOptions?.retries ?? DEFAULT_STEP_RETRIES
  const retryDelay = stepOptions?.retryDelay
  const backoff =
    retryDelay !== undefined && retryDelay !== 'exponential'
      ? { type: 'fixed', delay: getDurationInMilliseconds(retryDelay) }
      : retries > 0 || retryDelay === 'exponential'
        ? 'exponential'
        : undefined
  return { attempts: retries + 1, ...(backoff ? { backoff } : {}) }
}
