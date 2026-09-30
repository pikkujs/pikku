import { runPikkuFunc } from '../../function/function-runner.js'
import {
  getCreateWireServices,
  getSingletonServices,
} from '../../pikku-state.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import type { PikkuRawWire } from '../../types/core.types.js'
import type {
  RunLifecycleContext,
  WorkflowRunExtension,
} from './workflow-run-engine.types.js'
import {
  WorkflowAsyncException,
  WorkflowCancelledException,
  WorkflowSuspendedException,
} from './workflow-errors.js'
import type {
  PikkuWorkflowWire,
  WorkflowRun,
  WorkflowStatus,
} from './workflow.types.js'

export interface DslPassDeps {
  workflowWire: (addonNamespace: string | null) => PikkuWorkflowWire
  extension: WorkflowRunExtension | undefined
  updateRunStatus: (
    status: WorkflowStatus,
    output?: unknown,
    error?: SerializedError
  ) => Promise<void>
  onChildCompleted: (result: unknown) => Promise<void>
  onChildFailed: (error: Error) => Promise<void>
  failOrUnwind: (error: Error) => Promise<'unwinding' | 'finished' | 'failed'>
}

export const runDslWorkflowPass = async (
  deps: DslPassDeps,
  run: WorkflowRun,
  workflowMeta: RunLifecycleContext['workflowMeta'],
  workflow: RunLifecycleContext['workflow'],
  pkgName: string | null
): Promise<void> => {
  const runId = run.id
  const addonNs = run.workflow.includes(':')
    ? run.workflow.substring(0, run.workflow.indexOf(':'))
    : null
  const workflowWire = deps.workflowWire(addonNs)
  workflowWire.pikkuUserId = run.wire?.pikkuUserId
  const wire: PikkuRawWire = {
    workflow: workflowWire,
    pikkuUserId: run.wire?.pikkuUserId,
  }
  deps.extension?.decorateRunWire(wire, {
    runId,
    workflowMeta,
    workflowWire,
  })

  const lifecycle: RunLifecycleContext = {
    runId,
    run,
    workflowMeta,
    workflow,
    wire,
    packageName: pkgName,
  }

  let outcome: 'completed' | 'failed' | 'interrupted' = 'completed'
  let failure: any
  try {
    await deps.extension?.onBeforeRunFunc(lifecycle)

    const result = await runPikkuFunc(
      'workflow',
      workflowMeta.name,
      workflowMeta.pikkuFuncId,
      {
        singletonServices: getSingletonServices()!,
        wire,
        createWireServices: getCreateWireServices(),
        data: () => run.input,
        packageName: pkgName ?? undefined,
      }
    )

    await deps.updateRunStatus('completed', result)
    await deps.onChildCompleted(result)
  } catch (error: any) {
    failure = error

    if (error instanceof WorkflowAsyncException) {
      outcome = 'interrupted'
      throw error
    }

    if (error instanceof WorkflowCancelledException) {
      outcome = 'failed'
      await deps.updateRunStatus('cancelled', undefined, {
        message: error.message || 'Workflow cancelled',
        stack: '',
        code: 'WORKFLOW_CANCELLED',
      })
      await deps.onChildFailed(error)
      throw error
    }

    if (error instanceof WorkflowSuspendedException) {
      outcome = 'interrupted'
      await deps.updateRunStatus('suspended', undefined, {
        message: error.message || 'Workflow suspended',
        stack: '',
        code: 'WORKFLOW_SUSPENDED',
      })
      throw error
    }

    outcome = 'failed'
    if ((await deps.failOrUnwind(error)) === 'unwinding') return
    throw error
  } finally {
    await deps.extension?.onAfterRunFunc(lifecycle, outcome, failure)
  }
}
