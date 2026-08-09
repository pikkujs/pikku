import { addFunction } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { wireQueueWorker } from '../queue/queue-runner.js'
import type {
  GroupConcurrencyConfig,
  PikkuWorkerConfig,
} from '../queue/queue.types.js'
import type { Logger } from '../../services/logger.js'
import {
  pikkuWorkflowOrchestratorFunc,
  pikkuWorkflowSleeperFunc,
  pikkuWorkflowWorkerFunc,
} from './workflow-queue-workers.js'
import type { WorkflowQueueStrategy } from './workflow-queue-routing.js'

const ORCHESTRATOR_QUEUE_PREFIX = 'wf-orchestrator-'
const STEP_QUEUE_PREFIX = 'wf-step-'

const helperFunctionMeta = (funcId: string) => ({
  pikkuFuncId: funcId,
  sessionless: true,
  functionType: 'helper' as const,
  inputSchemaName: null,
  outputSchemaName: null,
})

export type WorkflowQueueWiringOptions = {
  strategy: WorkflowQueueStrategy
  concurrency: number
  groupConcurrency: number | GroupConcurrencyConfig
  /**
   * Resolved only when there is something to warn about: reading the logger
   * throws while singleton services are uninitialized, and wiring queues before
   * that point is legitimate.
   */
  getLogger: () => Logger | undefined
}

/**
 * Registers the orchestrator, step-worker and sleeper functions and binds them
 * to their queues. Idempotent: a queue already carrying a registered function
 * is left alone.
 */
export const wireWorkflowQueueWorkers = ({
  strategy,
  concurrency,
  groupConcurrency,
  getLogger,
}: WorkflowQueueWiringOptions): void => {
  const functions = pikkuState(null, 'function', 'functions')
  const functionsMeta = pikkuState(null, 'function', 'meta')
  const queueMeta = pikkuState(null, 'queue', 'meta')

  const registerWorkflowFunc = (
    funcId: string,
    func: { func: unknown },
    queueName: string,
    config?: PikkuWorkerConfig
  ) => {
    if (functions.has(funcId)) return
    addFunction(funcId, func as never)
    if (!queueMeta[queueName]) {
      queueMeta[queueName] = { pikkuFuncId: funcId, name: queueName }
    }
    wireQueueWorker({ name: queueName, func, config } as never)
    if (!functionsMeta[funcId]) {
      functionsMeta[funcId] = helperFunctionMeta(funcId)
    }
  }

  const sharedGroups = strategy === 'shared-groups'
  const sharedQueueConfig: PikkuWorkerConfig | undefined = sharedGroups
    ? { batchSize: concurrency, groupConcurrency }
    : undefined

  registerWorkflowFunc(
    'pikkuWorkflowOrchestrator',
    { func: pikkuWorkflowOrchestratorFunc },
    'pikku-workflow-orchestrator',
    sharedQueueConfig
  )
  registerWorkflowFunc(
    'pikkuWorkflowStepWorker',
    { func: pikkuWorkflowWorkerFunc },
    'pikku-workflow-step-worker',
    sharedQueueConfig
  )

  const registerDedicatedQueues = (meta: Record<string, any>) => {
    for (const [queueName, entry] of Object.entries(meta)) {
      if (functions.has(entry.pikkuFuncId)) continue
      if (queueName.startsWith(ORCHESTRATOR_QUEUE_PREFIX)) {
        registerWorkflowFunc(
          entry.pikkuFuncId,
          { func: pikkuWorkflowOrchestratorFunc },
          queueName
        )
      } else if (queueName.startsWith(STEP_QUEUE_PREFIX)) {
        registerWorkflowFunc(
          entry.pikkuFuncId,
          { func: pikkuWorkflowWorkerFunc },
          queueName
        )
      }
    }
  }

  if (!sharedGroups) {
    registerDedicatedQueues(pikkuState(null, 'queue', 'meta'))

    const addons = pikkuState(null, 'addons', 'packages')
    for (const [, addon] of addons ?? []) {
      const addonQueueMeta = pikkuState(addon.package, 'queue', 'meta')
      if (addonQueueMeta) {
        registerDedicatedQueues(addonQueueMeta)
      }
    }
  }

  warnOnMissingDedicatedQueues(queueMeta, getLogger)

  if (!functions.has('pikkuWorkflowSleeper')) {
    addFunction('pikkuWorkflowSleeper', { func: pikkuWorkflowSleeperFunc })
  }
  if (!functionsMeta.pikkuWorkflowSleeper) {
    functionsMeta.pikkuWorkflowSleeper = helperFunctionMeta(
      'pikkuWorkflowSleeper'
    )
  }
}

const warnOnMissingDedicatedQueues = (
  queueMeta: Record<string, unknown>,
  getLogger: () => Logger | undefined
) => {
  const workflowCount = Object.keys(
    pikkuState(null, 'workflows', 'meta') ?? {}
  ).length
  const dedicatedQueues = Object.keys(queueMeta).filter((name) =>
    name.startsWith(ORCHESTRATOR_QUEUE_PREFIX)
  ).length
  if (workflowCount > 0 && dedicatedQueues === 0) {
    getLogger()?.warn?.(
      `[pikku] ${workflowCount} workflow(s) registered but no per-workflow orchestrator queues were found in queue meta. ` +
        `All workflows will share a single orchestrator queue, where one slow step blocks every other workflow behind it. ` +
        `Check that the generated bootstrap imports the queue-workers meta (pikku-queue-workers-wirings-meta.gen.js).`
    )
  }
}
