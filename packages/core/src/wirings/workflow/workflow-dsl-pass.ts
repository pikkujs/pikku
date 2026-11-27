import { runPikkuFunc } from '../../function/function-runner.js'
import { runTraceWire } from './workflow-run-trace.js'
import { assertRunSessionStore } from './workflow-graph-session.js'
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
import { isOwnershipError, throwIfLeaseLost } from './workflow-lost-lease.js'
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
  ) => Promise<boolean>
  /** The run's status if something has ended it, finishing any unwind that waited on this pass. */
  settleIfStopped: () => Promise<WorkflowStatus | undefined>
  onChildCompleted: (result: unknown) => Promise<void>
  onChildFailed: (error: Error) => Promise<void>
  failOrUnwind: (error: Error) => Promise<'unwinding' | 'finished' | 'failed'>
  /** Aborts if the run lease this pass holds is lost. */
  leaseLost?: AbortSignal
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
  assertRunSessionStore(run.wire?.pikkuUserId)
  const wire: PikkuRawWire = {
    ...runTraceWire(run.wire?.traceparent),
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

    throwIfLeaseLost(deps.leaseLost)
    // The run has been in the hands of its steps, and an inline one never went
    // back through the queue, so what it was told is only known by rereading.
    if (await deps.settleIfStopped()) {
      throw new WorkflowCancelledException(runId)
    }
    if (!(await deps.updateRunStatus('completed', result))) {
      throw new WorkflowCancelledException(runId)
    }
    await deps.onChildCompleted(result)
  } catch (error: any) {
    failure = error

    const lost: unknown = deps.leaseLost?.aborted
      ? deps.leaseLost.reason
      : isOwnershipError(error)
        ? error
        : undefined
    if (lost) {
      outcome = 'interrupted'
      failure = lost
      throw lost
    }

    if (error instanceof WorkflowAsyncException) {
      outcome = 'interrupted'
      throw error
    }

    if (error instanceof WorkflowCancelledException) {
      outcome = 'failed'
      let stopped = await deps.settleIfStopped()
      if (
        !stopped &&
        !(await deps.updateRunStatus('cancelled', undefined, {
          message: error.message || 'Workflow cancelled',
          stack: '',
          code: 'WORKFLOW_CANCELLED',
        }))
      ) {
        stopped = await deps.settleIfStopped()
      }
      // An unwind tells the parent itself, when it finishes.
      if (!stopped || stopped === 'cancelled') await deps.onChildFailed(error)
      throw error
    }

    if (error instanceof WorkflowSuspendedException) {
      outcome = 'interrupted'
      if (!(await deps.settleIfStopped())) {
        const suspended = await deps.updateRunStatus('suspended', undefined, {
          message: error.message || 'Workflow suspended',
          stack: '',
          code: 'WORKFLOW_SUSPENDED',
        })
        if (!suspended) await deps.settleIfStopped()
      }
      throw error
    }

    outcome = 'failed'
    if (await deps.settleIfStopped()) throw error
    if ((await deps.failOrUnwind(error)) === 'unwinding') return
    throw error
  } finally {
    await deps.extension?.onAfterRunFunc(lifecycle, outcome, failure)
  }
}
