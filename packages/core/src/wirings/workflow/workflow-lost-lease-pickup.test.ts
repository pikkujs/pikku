import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { getSingletonServices } from '../../pikku-state.js'
import { LeaseLostError } from '../../services/lease-service.js'
import { RUN_LEASE_RETRY_MS } from './workflow-constants.js'
import {
  afterRenewal,
  fastLeaseRenewals,
  LeasedWorkflowService,
} from './workflow-lease-helpers.test.js'

const LIMIT = { timeout: 20_000 }

let restoreTimers: () => void
before(() => {
  restoreTimers = fastLeaseRenewals()
})
after(() => restoreTimers())

let ws: LeasedWorkflowService
let h: QueuedWorkflowHarness
let runId: string
let wakes: Array<number | undefined>

beforeEach(() => {
  runId = ''
  ws = new LeasedWorkflowService()
  h = new QueuedWorkflowHarness(ws)
  wakes = []
  const queue = getSingletonServices().queueService!
  const add = queue.add.bind(queue)
  queue.add = async (name: string, data: any, options?: any) => {
    wakes.push(options?.delay)
    return add(name, data, options)
  }
})

const withoutQueue = () => {
  delete (getSingletonServices() as { queueService?: unknown }).queueService
}

/** This process loses the run's lease, which nobody else takes. */
const loseRun = async () => {
  ws.leases.lose(runId)
  await afterRenewal()
}

const startInline = (name = 'flow') =>
  ws.startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
    inline: true,
    onRunCreated: (id) => {
      runId ||= id
    },
  })

const rows = async () =>
  (await ws.getRunSteps(runId)).map(
    (step) => `${step.stepName}:${step.attemptCount}:${step.status}`
  )

const status = async () => (await ws.getRun(runId))!.status

const inlineStep = (
  forward: (data: any, wire: any) => Promise<unknown>,
  compensate?: () => Promise<void>
) => ({ queued: false, forward, ...(compensate ? { compensate } : {}) })

/** `zero` (undoable) then `first`, which loses the lease `losses` times. */
const losingFlow = (losses: number, retries: number) => {
  const startedAborted: boolean[] = []
  h.register(
    'zero',
    inlineStep(
      async () => ({}),
      async () => {}
    )
  )
  h.register(
    'first',
    inlineStep(async (_data, wire) => {
      const signal: AbortSignal = wire.workflowStep.signal
      startedAborted.push(signal.aborted)
      if (startedAborted.length > losses) return {}
      await loseRun()
      throw signal.reason
    })
  )
  h.defineDsl('flow', async (w: any) => {
    await w.do('Zero', 'zero', {})
    await w.do('First', 'first', {}, { retries })
    return {}
  })
  return startedAborted
}

describe('an inline run whose pass lost the lease is picked up again', () => {
  test('with no queue, by taking the lease again', LIMIT, async () => {
    const startedAborted = losingFlow(1, 3)
    withoutQueue()

    await startInline()

    assert.deepEqual(startedAborted, [false, false])
    assert.deepEqual(await rows(), [
      'Zero:1:succeeded',
      'First:1:running',
      'First:2:succeeded',
    ])
    assert.equal(await status(), 'completed')
    assert.deepEqual(h.undone, [])
  })

  test('only so many times, then it stays running', LIMIT, async () => {
    const startedAborted = losingFlow(Infinity, 5)
    withoutQueue()

    await assert.rejects(startInline(), LeaseLostError)

    assert.deepEqual(startedAborted, [false, false, false, false])
    assert.equal((await rows()).at(-1), 'First:4:running')
    assert.equal(await status(), 'running')
    assert.deepEqual(h.undone, [])
  })

  test('only so many times, then the queue is asked', LIMIT, async () => {
    losingFlow(4, 5)

    await assert.rejects(startInline(), LeaseLostError)

    assert.deepEqual(wakes, [RUN_LEASE_RETRY_MS])
    assert.deepEqual(
      h.queue.map((job) => job.data),
      [{ runId }]
    )
    await h.pump()
    assert.equal(await status(), 'completed')
  })

  test(
    'with no attempt left the step is lost and compensation runs once',
    LIMIT,
    async () => {
      const startedAborted = losingFlow(Infinity, 1)
      withoutQueue()

      await assert.rejects(startInline(), /lost its worker|attempt/)

      assert.deepEqual(startedAborted, [false, false])
      assert.equal(await status(), 'compensated')
      assert.deepEqual(h.undone, ['undo:zero'])
    }
  )

  for (const queued of [true, false]) {
    test(
      `a run someone else took is left to them, ${queued ? 'with a wake' : 'with no queue'}`,
      LIMIT,
      async () => {
        h.register(
          'first',
          inlineStep(async () => {
            ws.leases.loseToAnother(runId)
            await afterRenewal()
            throw new Error('boom')
          })
        )
        h.defineDsl('flow', async (w: any) => {
          await w.do('First', 'first', {})
          return {}
        })
        if (!queued) withoutQueue()

        await assert.rejects(startInline(), LeaseLostError)

        assert.deepEqual(wakes, queued ? [RUN_LEASE_RETRY_MS] : [])
        assert.deepEqual(await rows(), ['First:1:running'])
        assert.equal(await status(), 'running')
      }
    )
  }

  test(
    'a lease that cannot be taken again leaves the run running',
    LIMIT,
    async () => {
      h.register(
        'first',
        inlineStep(async () => {
          await loseRun()
          ws.leases.unreachable = true
          throw new Error('boom')
        })
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('First', 'first', {})
        return {}
      })
      withoutQueue()

      await assert.rejects(startInline(), LeaseLostError)

      assert.deepEqual(await rows(), ['First:1:running'])
      assert.equal(await status(), 'running')
    }
  )
})

describe('the next owner of a lost closure step', () => {
  const closureFlow = (losses: number, retries: number) => {
    const calls = { count: 0 }
    h.defineDsl('flow', async (w: any) => {
      await w.do(
        'Closure',
        async () => {
          if (++calls.count > losses) return {}
          await loseRun()
          throw new Error('interrupted')
        },
        { retries }
      )
      return {}
    })
    return calls
  }

  test('runs it as another attempt', LIMIT, async () => {
    const calls = closureFlow(1, 2)
    withoutQueue()

    await startInline()

    assert.equal(calls.count, 2)
    assert.deepEqual(await rows(), ['Closure:1:running', 'Closure:2:succeeded'])
  })

  test('fails it as lost when no attempt is left', LIMIT, async () => {
    const calls = closureFlow(Infinity, 0)
    withoutQueue()

    await assert.rejects(startInline())

    assert.equal(calls.count, 1)
    assert.deepEqual(await rows(), ['Closure:1:failed'])
    assert.equal(await status(), 'failed')
  })

  test('in a queued run, runs it as another attempt', LIMIT, async () => {
    closureFlow(1, 2)
    h.queue.length = 0
    const started = await ws.startWorkflow(
      'flow',
      {},
      { type: 'test' },
      h.rpc as never
    )
    runId = started.runId

    await h.pump()

    assert.deepEqual(await rows(), ['Closure:1:running', 'Closure:2:succeeded'])
    assert.equal(await status(), 'completed')
  })
})

describe('an unwind whose driver lost the lease is picked up again', () => {
  /** `a` and `b` undoable, then a failure; `undo` is `b`'s compensation. */
  const failingFlow = (undo: () => Promise<void>, retries = 3) => {
    h.register(
      'a',
      inlineStep(
        async () => ({}),
        async () => {}
      )
    )
    h.register(
      'b',
      inlineStep(async () => ({}), undo)
    )
    h.register(
      'boom',
      inlineStep(async () => {
        throw new Error('boom')
      })
    )
    h.defineDsl('flow', async (w: any) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries })
      await w.do('Boom', 'boom', {}, { retries: 0 })
      return {}
    })
  }

  const compensationRows = async () =>
    (await rows()).filter((row) => row.includes(':compensate'))

  test(
    'a compensation that was interrupted runs as another attempt',
    LIMIT,
    async () => {
      let undos = 0
      failingFlow(async () => {
        if (++undos > 1) return
        await loseRun()
        throw new Error('undo interrupted')
      })
      withoutQueue()

      await assert.rejects(startInline(), /boom/)

      assert.deepEqual(h.undone, ['undo:b', 'undo:b', 'undo:a'])
      assert.deepEqual(await compensationRows(), [
        'B:compensate:1:running',
        'B:compensate:2:succeeded',
        'A:compensate:1:succeeded',
      ])
      assert.equal(await status(), 'compensated')
    }
  )

  test('a compensation that finished is not run again', LIMIT, async () => {
    let undos = 0
    failingFlow(async () => {
      if (++undos === 1) await loseRun()
    })
    withoutQueue()

    await assert.rejects(startInline(), /boom/)

    assert.deepEqual(h.undone, ['undo:b', 'undo:a'])
    assert.equal(await status(), 'compensated')
  })

  test(
    'a compensation interrupted on its last attempt is not invoked again',
    LIMIT,
    async () => {
      failingFlow(async () => {
        await loseRun()
        throw new Error('undo interrupted')
      }, 1)
      withoutQueue()

      await assert.rejects(startInline())

      // A stuck compensation holds back the earlier ones, here as anywhere.
      assert.deepEqual(h.undone, ['undo:b', 'undo:b'])
      assert.equal(await status(), 'compensation_failed')
    }
  )

  test('under a cancel with no pass at work', LIMIT, async () => {
    let undos = 0
    h.register(
      'a',
      inlineStep(
        async () => ({}),
        async () => {
          if (++undos > 1) return
          await loseRun()
          throw new Error('undo interrupted')
        }
      )
    )
    h.defineDsl('flow', async (w: any) => {
      await w.do('A', 'a', {})
      await w.suspend('wait')
      return {}
    })
    await startInline()
    withoutQueue()

    const ended = await ws.cancelRun(runId, h.rpc as never, 'stop')

    assert.equal(ended, 'compensated')
    assert.equal(undos, 2)
  })

  test('an inline graph', LIMIT, async () => {
    let undos = 0
    h.register(
      'a',
      inlineStep(
        async () => ({}),
        async () => {
          if (++undos > 1) return
          await loseRun()
          throw new Error('undo interrupted')
        }
      )
    )
    h.register(
      'b',
      inlineStep(async () => {
        throw new Error('boom')
      })
    )
    h.defineGraph('graph', 'a', { a: { next: 'b', retries: 1 }, b: {} })
    withoutQueue()

    await startInline('graph')

    assert.equal(undos, 2)
    assert.equal(await status(), 'compensated')
  })

  test(
    'a child’s lost unwind does not stop its parent’s from starting',
    LIMIT,
    async () => {
      h.register(
        'undoable',
        inlineStep(
          async () => ({}),
          async () => {}
        )
      )
      h.register(
        'inChild',
        inlineStep(
          async () => ({}),
          async () => {
            // Lost every time, so the pickups run out.
            ws.leases.lose(childId)
            await afterRenewal()
            throw new Error('undo interrupted')
          }
        )
      )
      h.defineDsl('child', async () => ({}))
      const create = (name: string) =>
        ws.createRun(name, {}, true, `${name}-hash`, { type: 'test' })
      const succeeded = async (id: string, name: string) => {
        const step = await ws.insertStepState(id, name, name, {})
        await ws.setStepRunning(step.stepId)
        await ws.setStepResult(step.stepId, {})
      }
      runId = await create('flow')
      const childId = await create('child')
      await succeeded(childId, 'inChild')
      await succeeded(runId, 'undoable')
      const parked = await ws.insertStepState(runId, 'sub', 'child', {})
      await ws.setStepRunning(parked.stepId)
      await ws.setStepChildRunId(parked.stepId, childId)

      await assert.rejects(
        ws.cancelRun(runId, h.rpc as never, 'stop'),
        LeaseLostError
      )

      assert.equal(await status(), 'compensating')
    }
  )
})
