import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableContentError,
} from '../../errors/errors.js'
import { AbandonedError } from '../../function/abort-scope.js'
import { RemoteAddonAuthError } from '../../wirings/addon/remote-addon-auth.js'
import {
  RemoteAddonFailedError,
  RemoteAddonTimeoutError,
} from '../../wirings/rpc/rpc-runner.js'
import { QueueJobDiscardedError } from '../../wirings/queue/queue-runner.js'
import { InMemoryWorkflowService } from '../../wirings/workflow/in-memory-workflow-service.js'
import { PikkuWorkflowService } from '../../wirings/workflow/pikku-workflow-service.js'
import type { QueuedWorkflowHarness } from '../service-tests/queued-workflow-harness.js'
import type { Handler } from '../service-tests/queued-workflow-harness.js'
import type { Outcome, Step, Workflow } from './dimensions.js'

/** Sleeps go through the scheduler, as in a deployment, so the wake-up is driven by hand. */
export class ScheduledSleeps extends InMemoryWorkflowService {
  protected override scheduleSleep(...args: [string, string, number | string]) {
    return PikkuWorkflowService.prototype['scheduleSleep'].apply(this, args)
  }
}

/** What a step's RPC throws for an outcome: the class a real call would raise. */
export const outcomeError = (outcome: Outcome): Error | undefined => {
  switch (outcome) {
    case 'throw-pikku-error':
    case 'step-compensated':
    case 'fan-out-sibling-failure':
      return new ConflictError('refused')
    case 'throw-plain-error':
    case 'job-exhausted':
      return new Error('boom')
    case 'schema-invalid':
    case 'job-poison':
      return new UnprocessableContentError('schema refused the data')
    case 'auth-mesh-jwt':
      return new UnauthorizedError()
    case 'auth-remote-addon':
      return new RemoteAddonAuthError('far', 'resolved token was empty')
    case 'permission-denied':
      return new ForbiddenError()
    case 'remote-4xx':
      return new NotFoundError()
    case 'remote-5xx':
    case 'remote-network':
      return new RemoteAddonFailedError('far', 'fn')
    case 'remote-timeout':
      return new RemoteAddonTimeoutError('far', 'fn', 2)
    case 'job-discarded':
      return new QueueJobDiscardedError('job', 'not wanted')
    case 'abandoned':
      return new AbandonedError('the caller left')
    default:
      return undefined
  }
}

export type RunCase = {
  /** Names every function and workflow of this run apart from a concurrent one. */
  id: string
  workflow: Workflow
  step: Step
  outcome: Outcome
}

const isDsl = (workflow: Workflow) => workflow.startsWith('dsl')

/**
 * Registers a workflow named `flow-<id>` that reaches `step`, then has its last
 * RPC meet `outcome`. Returns what brings the run to its end.
 */
export const defineRun = (
  h: QueuedWorkflowHarness,
  run: RunCase,
  child = false
) => {
  const { id, workflow, step, outcome } = run
  const queued = workflow.endsWith('-queued')
  const failure = () => outcomeError(outcome)
  let released = false
  let calls = 0

  const last: Handler = {
    queued,
    forward: async () => {
      const error = failure()
      if (error) throw error
      if (step === 'retry' && ++calls === 1) throw new Error('flaky')
      return {}
    },
  }
  const undoable =
    step === 'compensation' || outcome === 'step-compensated'
      ? { compensate: async () => {} }
      : {}
  h.register(`first-${id}`, {
    queued,
    ...undoable,
    forward: async (_data, wire) => {
      if (outcome === 'workflow-cancelled') {
        await h.ws.cancelRun(
          wire.workflow?.runId ?? wire.workflowStep?.runId,
          h.rpc as never
        )
      }
      return {}
    },
  })
  h.register(`last-${id}`, last)
  h.register(`left-${id}`, { queued, forward: async () => ({}) })

  const inner = child ? `inner-${id}` : `flow-${id}`
  if (isDsl(workflow)) {
    h.defineDsl(inner, async (w) => {
      await w.do('First', `first-${id}`, {})
      if (step === 'sleep') await w.sleep('Nap', 1)
      if (step === 'suspend' && !released) await w.suspend('Hold')
      if (step === 'approval') {
        const decision = await w.approval('Sign off', {
          schema: {
            '~standard': {
              version: 1,
              vendor: 'matrix',
              validate: (value: unknown) => ({ value }),
            },
          },
        })
        if (decision.data?.ok === false) {
          throw new ConflictError('the approval was rejected')
        }
      }
      if (step === 'fan-out') {
        await Promise.all([
          w.do('Left', `left-${id}`, {}),
          w.do('Last', `last-${id}`, {}),
        ])
      } else {
        await w.do(
          'Last',
          `last-${id}`,
          {},
          step === 'retry' ? { retries: 2 } : undefined
        )
      }
    })
  } else {
    h.defineGraph(inner, `first-${id}`, {
      [`first-${id}`]: {
        next: step === 'fan-out' ? [`left-${id}`, `last-${id}`] : `last-${id}`,
      },
      [`left-${id}`]: {},
      [`last-${id}`]: step === 'retry' ? { retries: 2 } : {},
    })
  }
  if (child) {
    h.defineDsl(`flow-${id}`, async (w) => w.do('Child', inner, {}))
  }

  return {
    /** Wakes whatever the run is waiting on, then lets it finish. */
    settle: async (runId: string, wakeSleeps: () => Promise<void>) => {
      if (step === 'sleep') await wakeSleeps()
      if (step === 'suspend') {
        released = true
        await h.ws.resumeWorkflow(runId)
      }
      if (step === 'approval') {
        await h.ws.approveStep(runId, 'Sign off', {
          ok: outcome !== 'approval-rejected',
        })
      }
      await h.pump()
    },
  }
}
