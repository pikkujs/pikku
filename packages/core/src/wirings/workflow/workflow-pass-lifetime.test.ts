import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  QueuedWorkflowHarness,
  type Handler,
} from '../../testing/service-tests/queued-workflow-harness.js'
import { pikkuState } from '../../pikku-state.js'
import { InMemoryLeaseService } from '../../services/in-memory-lease-service.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'
import { holdWorkflowLease } from './workflow-run-lease.js'
import { runLeaseKey } from './workflow-lost-lease.js'
import type { StepStatus } from './workflow.types.js'

/**
 * Records how each step stood when a pass let go of its run. It sleeps as a
 * stored service does, in the pass, instead of on an in-memory timer.
 */
class ObservedWorkflowService extends InMemoryWorkflowService {
  atRelease: Array<Record<string, StepStatus>> = []

  protected override scheduleSleep(
    runId: string,
    stepId: string,
    duration: number
  ): Promise<boolean> {
    return (PikkuWorkflowService.prototype as any).scheduleSleep.call(
      this,
      runId,
      stepId,
      duration
    )
  }

  override async withRunLease<T>(
    runId: string,
    fn: (leaseLost?: AbortSignal) => Promise<T>
  ): Promise<T> {
    try {
      return await super.withRunLease(runId, fn)
    } finally {
      this.atRelease.push(
        Object.fromEntries(
          (await this.getRunSteps(runId)).map((s) => [s.stepName, s.status])
        )
      )
    }
  }
}

let h: QueuedWorkflowHarness
let ws: ObservedWorkflowService

const useService = <T extends ObservedWorkflowService>(service: T): T => {
  ws = service
  h = new QueuedWorkflowHarness(service)
  return service
}

beforeEach(() => {
  useService(new ObservedWorkflowService())
})

const register = (name: string, handler: Handler) =>
  h.register(name, { ...handler, queued: false })

const gate = () => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, opened }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const settledWithin = (work: Promise<unknown>, ms: number) =>
  Promise.race([
    work.then(
      () => true,
      () => true
    ),
    pause(ms).then(() => false),
  ])

const startInline = (name: string) => {
  let created!: (runId: string) => void
  const runId = new Promise<string>((resolve) => (created = resolve))
  let thrown: unknown
  const ended = ws
    .startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
      inline: true,
      onRunCreated: created,
    })
    .then(() => {})
    .catch((error) => {
      thrown = error
    })
  return { runId, ended, thrown: () => thrown as Error | undefined }
}

/** The status of a step's latest attempt. */
const stepStatus = async (runId: string, stepName: string) =>
  (await ws.getRunSteps(runId)).filter((s) => s.stepName === stepName).at(-1)
    ?.status

const until = async (condition: () => Promise<boolean>) => {
  for (let i = 0; i < 400; i++) {
    if (await condition()) return
    await pause(5)
  }
  assert.fail('the condition never held')
}

const gatedSlow = () => {
  const slow = gate()
  register('slow', {
    forward: async () => {
      await slow.opened
      return {}
    },
    compensate: async () => {},
  })
  return slow
}

describe('a pass waits for every step it started', () => {
  test('dsl: a failing step does not end the pass under a running sibling', async () => {
    register('first', h.undoable())
    register('boom', h.boom())
    const slow = gatedSlow()
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('first', 'first', {})
      await Promise.all([
        workflow.do('slow', 'slow', {}, { retries: 0 }),
        workflow.do('boom', 'boom', {}, { retries: 0 }),
      ])
    })

    const started = startInline('flow')
    const runId = await started.runId
    await until(async () => (await stepStatus(runId, 'boom')) === 'failed')

    assert.equal(await settledWithin(started.ended, 100), false)
    assert.deepEqual(ws.atRelease, [])
    slow.open()
    await started.ended

    assert.equal(ws.atRelease[0]!.slow, 'succeeded')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone.sort(), ['undo:first', 'undo:slow'])
  })

  test('dsl: a step a surviving branch asks for later is part of the pass', async () => {
    register('boom', h.boom())
    register('after', h.ok())
    const slow = gatedSlow()
    h.defineDsl('flow', async (workflow) => {
      await Promise.all([
        (async () => {
          await workflow.do('slow', 'slow', {}, { retries: 0 })
          await workflow.do('after', 'after', {}, { retries: 0 })
        })(),
        workflow.do('boom', 'boom', {}, { retries: 0 }),
      ])
    })

    const started = startInline('flow')
    const runId = await started.runId
    await until(async () => (await stepStatus(runId, 'boom')) === 'failed')
    slow.open()
    await started.ended

    assert.equal(ws.atRelease[0]!.after, 'failed')
    assert.ok(!h.log.includes('do:after'))
  })

  test('dsl: a run does not complete under a step its body did not await', async () => {
    const slow = gatedSlow()
    h.defineDsl('flow', async (workflow) => {
      void workflow.do('slow', 'slow', {})
      return {}
    })

    const started = startInline('flow')
    const runId = await started.runId
    await until(async () => (await stepStatus(runId, 'slow')) === 'running')

    assert.equal(await settledWithin(started.ended, 100), false)
    assert.equal((await h.run(runId)).status, 'running')
    slow.open()
    await started.ended

    assert.equal(ws.atRelease[0]!.slow, 'succeeded')
    assert.equal((await h.run(runId)).status, 'completed')
  })

  test('dsl: a step asked for after the pass ended does not start', async () => {
    register('late', h.ok())
    const outside = gate()
    let branch!: Promise<unknown>
    h.defineDsl('flow', async (workflow) => {
      branch = outside.opened.then(() => workflow.do('late', 'late', {}))
      branch.catch(() => {})
      return {}
    })

    const started = startInline('flow')
    const runId = await started.runId
    await started.ended
    outside.open()

    await assert.rejects(branch, { name: 'WorkflowAsyncException' })
    assert.deepEqual(h.log, [])
    assert.deepEqual(await ws.getRunSteps(runId), [])
  })

  for (const { shape, entries, nodes } of [
    {
      shape: 'graph entry nodes',
      entries: ['slow', 'boom'],
      nodes: { slow: {}, boom: {} },
    },
    {
      shape: 'graph fan-out',
      entries: ['first'],
      nodes: { first: { next: ['slow', 'boom'] }, slow: {}, boom: {} },
    },
  ]) {
    test(`${shape}: a failing node does not end the pass under a running sibling`, async () => {
      register('first', h.undoable())
      register('boom', h.boom())
      const slow = gatedSlow()
      h.defineGraph('flow', entries[0]!, nodes)
      pikkuState(null, 'workflows', 'meta').flow!.entryNodeIds = entries

      const started = startInline('flow')
      const runId = await started.runId
      await until(async () => (await stepStatus(runId, 'boom')) === 'failed')

      assert.equal(await settledWithin(started.ended, 100), false)
      slow.open()
      await started.ended

      assert.equal(await stepStatus(runId, 'slow'), 'succeeded')
      assert.equal((await h.run(runId)).status, 'compensated')
      assert.ok(h.undone.includes('undo:slow'))
    })
  }
})

/** An observed service whose run lease excludes, as a stored one does. */
class LeasedWorkflowService extends ObservedWorkflowService {
  private readonly runLeases = new InMemoryLeaseService()

  override async withRunLease<T>(
    runId: string,
    fn: (leaseLost?: AbortSignal) => Promise<T>
  ): Promise<T> {
    return holdWorkflowLease(this, this.runLeases, runLeaseKey(runId), fn)
  }
}

/**
 * Cancels the run as the pass is about to start `taken`, and refuses that start,
 * as a store does once the canceller has taken the step.
 */
class CancelledAtStart extends LeasedWorkflowService {
  taken?: { stepName: string; write: 'start' | 'retry' }
  cancel?: (runId: string) => Promise<unknown>

  private async takenStep(stepId: string, write: 'start' | 'retry') {
    for (const run of await this.listRuns()) {
      const step = (await this.getRunSteps(run.id)).find(
        (s) => s.stepId === stepId
      )
      if (
        step?.stepName === this.taken?.stepName &&
        write === this.taken?.write
      ) {
        await this.cancel!(run.id)
        return true
      }
    }
    return false
  }

  protected override async setStepRunningImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<boolean> {
    if (await this.takenStep(stepId, 'start')) return false
    return super.setStepRunningImpl(stepId, from, attempt)
  }

  protected override async createRetryAttemptImpl(
    failedStepId: string,
    status: 'pending' | 'running',
    from: readonly StepStatus[],
    attempt?: number
  ) {
    if (await this.takenStep(failedStepId, 'retry')) return null
    return super.createRetryAttemptImpl(failedStepId, status, from, attempt)
  }
}

describe('a step start refused on a cancelled run', () => {
  const cancelledAtStart = (taken: NonNullable<CancelledAtStart['taken']>) => {
    const service = useService(new CancelledAtStart())
    service.taken = taken
    service.cancel = (runId) => service.cancelRun(runId, h.rpc as never)
    register('first', h.undoable())
  }

  for (const shape of ['dsl', 'dsl closure', 'graph'] as const) {
    test(`${shape}: it is the cancel, and completed work is compensated`, async () => {
      cancelledAtStart({ stepName: 'second', write: 'start' })
      register('second', h.ok())
      if (shape === 'graph') {
        h.defineGraph('flow', 'first', {
          first: { next: 'second' },
          second: {},
        })
      } else {
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('first', 'first', {})
          if (shape === 'dsl') await workflow.do('second', 'second', {})
          else await workflow.do('second', async () => ({}))
        })
      }

      const started = startInline('flow')
      const runId = await started.runId
      await started.ended

      assert.equal(started.thrown()?.name, undefined)
      assert.deepEqual(h.log, ['do:first', 'undo:first'])
      assert.equal((await h.run(runId)).status, 'compensated')
    })
  }

  test('a refused retry is the cancel too', async () => {
    cancelledAtStart({ stepName: 'second', write: 'retry' })
    register('second', h.boom())
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('first', 'first', {})
      await workflow.do('second', 'second', {}, { retries: 1 })
    })

    const started = startInline('flow')
    const runId = await started.runId
    await started.ended

    assert.equal(started.thrown()?.name, undefined)
    assert.deepEqual(h.log, ['do:first', 'do:second', 'undo:first'])
    assert.equal((await h.run(runId)).status, 'compensated')
  })
})

describe('an inline wait on a cancelled run', () => {
  const WAIT = '3s'

  const failsOnce = () => {
    let calls = 0
    return async () => {
      if (calls++ === 0) throw new Error('once')
      return {}
    }
  }

  const waits: Array<{
    name: string
    waiting: string
    status: StepStatus
    define: () => void
  }> = [
    {
      name: 'sleep',
      waiting: 'wait',
      status: 'pending',
      define: () =>
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('first', 'first', {})
          await workflow.sleep('wait', WAIT)
          await workflow.do('after', 'after', {})
        }),
    },
    {
      name: 'retryDelay of an RPC step',
      waiting: 'flaky',
      status: 'pending',
      define: () => {
        register('flaky', { forward: failsOnce() })
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('first', 'first', {})
          await workflow.do('flaky', 'flaky', {}, { retryDelay: WAIT })
          await workflow.do('after', 'after', {})
        })
      },
    },
    {
      name: 'retryDelay of a function step',
      waiting: 'flaky',
      status: 'pending',
      define: () => {
        const flaky = failsOnce()
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('first', 'first', {})
          await workflow.do('flaky', flaky, { retries: 1, retryDelay: WAIT })
          await workflow.do('after', 'after', {})
        })
      },
    },
    {
      name: 'retryDelay of a graph node',
      waiting: 'flaky',
      status: 'pending',
      define: () => {
        register('flaky', { forward: failsOnce() })
        h.defineGraph('flow', 'first', {
          first: { next: 'flaky' },
          flaky: { retries: 1, retryDelay: WAIT, next: 'after' },
          after: {},
        })
      },
    },
  ]

  for (const wait of waits) {
    for (const lease of ['pass-through', 'exclusive'] as const) {
      test(`${wait.name} ends with the cancel (${lease} lease)`, async () => {
        if (lease === 'exclusive') useService(new LeasedWorkflowService())
        register('first', h.undoable())
        register('after', h.ok())
        wait.define()

        const started = startInline('flow')
        const runId = await started.runId
        await until(
          async () => (await stepStatus(runId, wait.waiting)) === wait.status
        )
        await pause(30)
        await ws.cancelRun(runId, h.rpc as never)

        assert.equal(await settledWithin(started.ended, 1000), true)
        assert.equal((await h.run(runId)).status, 'compensated')
        assert.deepEqual(h.undone, ['undo:first'])
        assert.ok(!h.log.includes('do:after'))
        assert.notEqual(await stepStatus(runId, wait.waiting), 'succeeded')
      })
    }
  }

  test('a failure elsewhere in the run does not cut a sleep short', async () => {
    register('boom', h.boom())
    h.defineDsl('flow', async (workflow) => {
      await Promise.all([
        workflow.sleep('wait', '300ms'),
        workflow.do('boom', 'boom', {}, { retries: 0 }),
      ])
    })

    const started = startInline('flow')
    const runId = await started.runId
    await started.ended

    assert.equal(await stepStatus(runId, 'wait'), 'succeeded')
  })
})
