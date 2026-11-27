import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import {
  WorkflowCancelledException,
  WorkflowStepSupersededError,
  WorkflowSuspendedException,
} from './workflow-errors.js'
import { pikkuState } from '../../pikku-state.js'
import { RPCNotFoundError } from '../rpc/rpc-runner.js'
import { LeaseLostError } from '../../services/lease-service.js'
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

beforeEach(() => {
  ws = new LeasedWorkflowService()
  h = new QueuedWorkflowHarness(ws)
})

/** Another process takes the run, and this one has noticed. */
const loseRun = async (id = runId) => {
  ws.leases.loseToAnother(id)
  await afterRenewal()
}

const startInline = (name = 'flow') =>
  ws.startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
    inline: true,
    onRunCreated: (id) => {
      runId ||= id
    },
  })

beforeEach(() => {
  runId = ''
})

const rows = async (id = runId) =>
  (await ws.getRunSteps(id)).map(
    (step) => `${step.stepName}:${step.attemptCount}:${step.status}`
  )

const status = async (id = runId) => (await ws.getRun(id))!.status

const inlineStep = (
  forward: () => Promise<unknown>,
  compensate?: () => Promise<void>
) => ({ queued: false, forward, ...(compensate ? { compensate } : {}) })

/** `zero` (undoable) then `first`. */
const twoSteps = (
  first: () => Promise<unknown>,
  options: object = { retries: 3 }
) => {
  h.register(
    'zero',
    inlineStep(
      async () => ({}),
      async () => {}
    )
  )
  h.register('first', inlineStep(first))
  h.defineDsl('flow', async (w: any) => {
    await w.do('Zero', 'zero', {})
    await w.do('First', 'first', {}, options)
    return {}
  })
}

const assertUntouched = async (expected: string[], runStatus = 'running') => {
  assert.deepEqual(await rows(), expected)
  assert.equal(await status(), runStatus)
}

describe('a pass that lost its run lease writes nothing', () => {
  test(
    'inline step that throws: no failure, retry or compensation',
    LIMIT,
    async () => {
      twoSteps(async () => {
        await loseRun()
        throw new Error('boom')
      })

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(['Zero:1:succeeded', 'First:1:running'])
      assert.deepEqual(h.undone, [])
    }
  )

  test(
    'inline step with no attempt left: the run is not failed',
    LIMIT,
    async () => {
      twoSteps(
        async () => {
          await loseRun()
          throw new Error('boom')
        },
        { retries: 0 }
      )

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(['Zero:1:succeeded', 'First:1:running'])
      assert.deepEqual(h.undone, [])
    }
  )

  test(
    'a success is kept, and the pass starts nothing after it',
    LIMIT,
    async () => {
      h.register(
        'first',
        inlineStep(async () => {
          await loseRun()
          return { done: true }
        })
      )
      h.register(
        'second',
        inlineStep(async () => ({}))
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('First', 'first', {})
        await w.do('Second', 'second', {})
        return {}
      })

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(['First:1:succeeded'])
      assert.deepEqual(h.log, ['do:first'])
    }
  )

  for (const [what, thrown] of [
    ['returns', undefined],
    ['throws', () => new Error('boom')],
    ['cancels itself', () => new WorkflowCancelledException('x', 'enough')],
    ['suspends', () => new WorkflowSuspendedException('x', 'wait')],
  ] as const) {
    test(`a body that ${what} leaves the run as it was`, LIMIT, async () => {
      h.register(
        'zero',
        inlineStep(
          async () => ({}),
          async () => {}
        )
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('Zero', 'zero', {})
        await loseRun()
        if (thrown) throw thrown()
        return {}
      })

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(['Zero:1:succeeded'])
      assert.deepEqual(h.undone, [])
    })
  }

  test('a body that catches the loss can start no step', LIMIT, async () => {
    h.register(
      'second',
      inlineStep(async () => ({}))
    )
    h.defineDsl('flow', async (w: any) => {
      await loseRun()
      for (const next of [
        () => w.do('Second', 'second', {}),
        () => w.do('Closure', async () => 1),
        () => w.sleep('Nap', 1),
        () => w.suspend('wait'),
      ]) {
        await next().catch(() => {})
      }
      return {}
    })

    await assert.rejects(startInline(), LeaseLostError)

    await assertUntouched([])
    assert.deepEqual(h.log, [])
  })

  test('inline closure step that throws', LIMIT, async () => {
    h.defineDsl('flow', async (w: any) => {
      await w.do(
        'Closure',
        async () => {
          await loseRun()
          throw new Error('boom')
        },
        { retries: 3 }
      )
      return {}
    })

    await assert.rejects(startInline(), LeaseLostError)

    await assertUntouched(['Closure:1:running'])
  })

  test('queued run, closure step: only a wake is enqueued', LIMIT, async () => {
    h.defineDsl('flow', async (w: any) => {
      await w.do(
        'Closure',
        async () => {
          await loseRun()
          throw new Error('boom')
        },
        { retries: 3 }
      )
      return {}
    })
    ;({ runId } = await ws.startWorkflow(
      'flow',
      {},
      { type: 'test' },
      h.rpc as never
    ))
    const job = h.queue.shift()!

    await ws.orchestrateWorkflow(job.data.runId, h.rpc as never)

    await assertUntouched(['Closure:1:running'])
    assert.deepEqual(
      h.queue.map((queued) => queued.data),
      [{ runId }]
    )
  })

  test('a child run that lost its lease fails no parent', LIMIT, async () => {
    let childId = ''
    h.register(
      'first',
      inlineStep(async () => {
        const [child] = (await ws.listRuns({ workflowName: 'child' })) as any[]
        childId = child.id
        await loseRun(childId)
        throw new Error('boom')
      })
    )
    h.defineDsl('child', async (w: any) => {
      await w.do('First', 'first', {}, { retries: 0 })
      return {}
    })
    h.register(
      'zero',
      inlineStep(
        async () => ({}),
        async () => {}
      )
    )
    pikkuState(null, 'rpc', 'meta')['child'] = 'child'
    h.defineDsl('flow', async (w: any) => {
      await w.do('Zero', 'zero', {})
      await w.do('Child', 'child', {}, { retries: 3 })
      return {}
    })

    await assert.rejects(startInline(), LeaseLostError)

    await assertUntouched(['Zero:1:succeeded', 'Child:1:running'])
    assert.equal(await status(childId), 'running')
    assert.deepEqual(h.undone, [])
  })

  /** `a` and `b` undoable, then a failure; `undo` is `b`'s compensation. */
  const failingFlow = (
    undo: () => Promise<void>,
    options: object = { retries: 3 }
  ) => {
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
      await w.do('B', 'b', {}, options)
      await w.do('Boom', 'boom', {}, { retries: 0 })
      return {}
    })
  }

  const forward = ['A:1:succeeded', 'B:1:succeeded', 'Boom:1:failed']

  test(
    'compensation that throws: the row is not failed and nothing follows it',
    LIMIT,
    async () => {
      failingFlow(async () => {
        await loseRun()
        throw new Error('undo interrupted')
      })

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(
        [...forward, 'B:compensate:1:running'],
        'compensating'
      )
      assert.deepEqual(h.undone, ['undo:b'])
    }
  )

  test(
    'compensation that succeeds is kept, and the run is not settled',
    LIMIT,
    async () => {
      failingFlow(async () => {
        await loseRun()
      })

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(
        [...forward, 'B:compensate:1:succeeded'],
        'compensating'
      )
      assert.deepEqual(h.undone, ['undo:b'])
    }
  )

  test('inline graph, compensation that throws', LIMIT, async () => {
    h.register(
      'a',
      inlineStep(
        async () => ({}),
        async () => {
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
    h.defineGraph('graph', 'a', { a: { next: 'b' }, b: {} })

    // The unwind is whoever has the run's, as when it was taken to begin with.
    await startInline('graph')

    await assertUntouched(
      ['a:1:succeeded', 'b:1:failed', 'a:compensate:1:running'],
      'compensating'
    )
  })

  test(
    'queued graph: no node is fired and the run is not completed',
    LIMIT,
    async () => {
      h.register('a', h.ok())
      h.register('b', h.ok())
      h.defineGraph('graph', 'a', { a: { next: 'b' }, b: {} })
      ;({ runId } = await ws.startWorkflow(
        'graph',
        {},
        { type: 'test' },
        h.rpc as never
      ))
      const { data } = h.queue.shift()!
      await ws.executeWorkflowStep(
        runId,
        data.stepName,
        data.rpcName,
        data.data,
        h.rpc as never
      )
      h.queue.length = 0
      const read = ws.getStepInstances.bind(ws)
      ws.getStepInstances = async (id) => {
        await loseRun()
        return read(id)
      }

      await ws.orchestrateWorkflow(runId, h.rpc as never)

      await assertUntouched(['a:1:succeeded'])
      assert.deepEqual(
        h.queue.map((queued) => queued.data),
        [{ runId }]
      )
    }
  )

  test(
    'an unrelated error thrown after the loss does not fail the run',
    LIMIT,
    async () => {
      h.register('a', h.ok())
      h.defineGraph('graph', 'a', { a: {} })
      ;({ runId } = await ws.startWorkflow(
        'graph',
        {},
        { type: 'test' },
        h.rpc as never
      ))
      h.queue.length = 0
      // Nothing below the run's lease checks the pass's signal for this one.
      ws.getStepInstances = async () => {
        await loseRun()
        throw new Error('store unreachable')
      }

      await ws.orchestrateWorkflow(runId, h.rpc as never)

      await assertUntouched(['a:1:pending'])
      assert.deepEqual(
        h.queue.map((queued) => queued.data),
        [{ runId }]
      )
    }
  )

  test(
    'queued graph with nothing left to fire: the run is not completed',
    LIMIT,
    async () => {
      h.register('a', h.ok())
      // A fan-out over no items leaves no step, so no check comes before the
      // one on the write that completes the run.
      h.defineGraph('graph', 'a', {
        a: { forEach: { $ref: 'trigger', path: 'ids' } },
      })
      ;({ runId } = await ws.startWorkflow(
        'graph',
        { ids: [] },
        { type: 'test' },
        h.rpc as never
      ))
      h.queue.length = 0
      const read = ws.getStepInstances.bind(ws)
      ws.getStepInstances = async (id) => {
        await loseRun()
        return read(id)
      }

      await ws.orchestrateWorkflow(runId, h.rpc as never)

      await assertUntouched([])
    }
  )

  test(
    'the last compensation succeeds: the run is not settled',
    LIMIT,
    async () => {
      h.register(
        'a',
        inlineStep(
          async () => ({}),
          async () => {
            await loseRun()
          }
        )
      )
      h.register(
        'boom',
        inlineStep(async () => {
          throw new Error('boom')
        })
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('A', 'a', {})
        await w.do('Boom', 'boom', {}, { retries: 0 })
        return {}
      })

      await assert.rejects(startInline(), LeaseLostError)

      await assertUntouched(
        ['A:1:succeeded', 'Boom:1:failed', 'A:compensate:1:succeeded'],
        'compensating'
      )
    }
  )

  test(
    'the old pass leaves a run that was also cancelled to the cancel',
    LIMIT,
    async () => {
      twoSteps(async () => {
        await ws.cancelRun(runId, h.rpc as never, 'stop')
        await loseRun()
        throw new Error('boom')
      })

      await assert.rejects(startInline(), LeaseLostError)

      const run = (await ws.getRun(runId))!
      assert.equal(run.error?.code, 'WORKFLOW_CANCELLED')
      assert.equal(run.error?.message, 'stop')
      assert.ok((await rows()).includes('First:1:running'))
    }
  )
})

describe('a pass that stalled past its lease without hearing of it', () => {
  /** The step as the next owner leaves it: on a newer attempt. */
  const takeOver = async (stepName: string) => {
    const step = await ws.getStepState(runId, stepName)
    await ws.createRetryAttempt(step.stepId, 'running', step.attemptCount)
  }

  for (const [kind, fails] of [
    ['a throw', true],
    ['a result', false],
  ] as const) {
    test(
      `${kind} refused by the step fence does not end the run`,
      LIMIT,
      async () => {
        twoSteps(async () => {
          await takeOver('First')
          if (fails) throw new Error('boom')
          return {}
        })

        await assert.rejects(startInline(), WorkflowStepSupersededError)

        await assertUntouched([
          'Zero:1:succeeded',
          'First:1:running',
          'First:2:running',
        ])
        assert.deepEqual(h.undone, [])
      }
    )
  }

  test(
    'a refused compensation write does not call the compensation stuck',
    LIMIT,
    async () => {
      let undos = 0
      h.register(
        'a',
        inlineStep(
          async () => ({}),
          async () => {
            if (++undos === 1) await takeOver('A:compensate')
          }
        )
      )
      h.register(
        'boom',
        inlineStep(async () => {
          throw new Error('boom')
        })
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('A', 'a', {})
        await w.do('Boom', 'boom', {}, { retries: 0 })
        return {}
      })

      await assert.rejects(startInline(), WorkflowStepSupersededError)

      assert.equal(await status(), 'compensating')
      assert.equal(undos, 1)
    }
  )

  test(
    'a graph node cannot fail the newer attempt of its step',
    LIMIT,
    async () => {
      let calls = 0
      h.register(
        'a',
        inlineStep(async () => {
          if (++calls === 1) await takeOver('a')
          throw new RPCNotFoundError('a')
        })
      )
      h.defineGraph('graph', 'a', { a: {} })

      await startInline('graph').catch(() => {})

      assert.deepEqual(await rows(), ['a:1:running', 'a:2:running'])
      assert.equal(await status(), 'running')
    }
  )
})
