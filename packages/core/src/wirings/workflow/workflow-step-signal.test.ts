import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { beginChanges } from '../../function/abort-scope.js'
import {
  LeaseLostError,
  type LeaseService,
} from '../../services/lease-service.js'
import { InMemoryLeaseService } from '../../services/in-memory-lease-service.js'
import {
  WorkflowRunStoppedError,
  WorkflowStepCancelledError,
  WorkflowStepTimeoutError,
} from './workflow-errors.js'
import type { WorkflowRunMirror } from './workflow.types.js'

const LIMIT = { timeout: 5_000 }
const CHECK_MS = 10
/** Long enough for several cancel checks to have run. */
const SEVERAL_CHECKS_MS = CHECK_MS * 8

/** Every status each run was moved to, in order. */
let statuses: Map<string, string[]>

const recordingMirror = (): WorkflowRunMirror =>
  new Proxy({} as WorkflowRunMirror, {
    get: (_target, method) => async (id: string, status: string) => {
      if (method !== 'updateRunStatus') return
      statuses.set(id, [...(statuses.get(id) ?? []), status])
    },
  })

class TestWorkflowService extends InMemoryWorkflowService {
  protected override cancelCheckIntervalMs = CHECK_MS

  constructor() {
    super({ mirror: recordingMirror() })
  }

  /** A second process's service over the same store: it holds none of this one's signals. */
  otherInstance(): TestWorkflowService {
    const other = new TestWorkflowService()
    for (const key of [
      'runs',
      'steps',
      'stepData',
      'stepHistory',
      'runState',
      'branchKeys',
      'workflowVersions',
    ]) {
      ;(other as any)[key] = (this as any)[key]
    }
    return other
  }
}

let ws: TestWorkflowService
let h: QueuedWorkflowHarness
/** The wire of every function and compensation invoked. */
let wires: Array<{ rpc: string; wire: any }>

const harness = (service: TestWorkflowService = new TestWorkflowService()) => {
  ws = service
  h = new QueuedWorkflowHarness(ws)
  wires = []
  const invoke = h.rpc.rpcWithWire
  ;(h.rpc as any).rpcWithWire = (rpc: string, data: any, wire: any) => {
    wires.push({ rpc, wire })
    return invoke(rpc, data, wire)
  }
}

beforeEach(() => {
  statuses = new Map()
  harness()
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Resolves once `signal` aborts, or after `ms`, reporting whether it did. */
const abortedWithin = (signal: AbortSignal | undefined, ms = 1_000) =>
  new Promise<boolean>((resolve) => {
    if (!signal) return resolve(false)
    if (signal.aborted) return resolve(true)
    const done = () => {
      clearTimeout(timer)
      resolve(signal.aborted)
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })

const hang = () => new Promise<never>(() => {})

const runInline = async (name: string): Promise<string> => {
  let runId: string | undefined
  await ws
    .startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
      inline: true,
      onRunCreated: (id) => (runId = id),
    })
    .catch(() => {})
  await h.pump()
  return runId!
}

const startIn = (queued: boolean, name: string) =>
  queued ? h.start(name) : runInline(name)

const stepNamed = async (runId: string, stepName: string) =>
  (await ws.getRunSteps(runId)).filter((s) => s.stepName === stepName).at(-1)!

const assertNeverMovedBack = (runId: string) => {
  const moves = statuses.get(runId) ?? []
  const stopped = moves.findIndex(
    (s) => s === 'cancelled' || s === 'compensating'
  )
  if (stopped === -1) return
  const back = moves
    .slice(stopped)
    .filter((s) => s === 'running' || s === 'suspended' || s === 'completed')
  assert.deepEqual(back, [], `the run moved back: ${moves.join(' -> ')}`)
}

const oneStep = (options?: Record<string, unknown>) =>
  h.defineDsl('flow', async (workflow) => {
    await workflow.do('First', 'first', {}, options)
    return { done: true }
  })

for (const queued of [true, false]) {
  const kind = queued ? 'queued' : 'inline'

  describe(`${kind} step: cancel`, () => {
    test(
      'a cancel from another service instance reaches the step',
      LIMIT,
      async () => {
        const other = ws.otherInstance()
        let reason: unknown
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await other.cancelRun(wire.workflowStep.runId, h.rpc as never)
            await abortedWithin(wire.workflowStep.signal)
            reason = wire.workflowStep.signal?.reason
            return {}
          },
        })
        oneStep()

        const runId = await startIn(queued, 'flow')

        assert.ok(reason instanceof WorkflowStepCancelledError, String(reason))
        assert.equal((await h.run(runId)).status, 'cancelled')
        assertNeverMovedBack(runId)
      }
    )

    test(
      'a step that throws after a cancel is recorded, not retried, and compensated',
      LIMIT,
      async () => {
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
            throw new Error('stopped half way')
          },
          compensate: async () => {},
        })
        oneStep({ retries: 2 })

        const runId = await startIn(queued, 'flow')

        assert.equal((await h.run(runId)).status, 'compensated')
        assert.deepEqual(h.log, ['do:first', 'undo:first'])
        const step = await stepNamed(runId, 'First')
        assert.equal(step.status, 'failed')
        assert.equal(step.attemptCount, 1)
        assert.equal(step.error?.message, 'stopped half way')
        assertNeverMovedBack(runId)
      }
    )

    test(
      'a step with no compensation that throws after a cancel leaves no attempt behind',
      LIMIT,
      async () => {
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
            throw new Error('stopped half way')
          },
        })
        oneStep({ retries: 2 })

        const runId = await startIn(queued, 'flow')

        assert.equal((await h.run(runId)).status, 'cancelled')
        assert.deepEqual(h.log, ['do:first'])
        const step = await stepNamed(runId, 'First')
        assert.equal(step.status, 'failed')
        assert.equal(step.attemptCount, 1)
        assert.equal(
          h.jobsRun.filter((j) => j.step === 'First').length,
          queued ? 1 : 0
        )
        assertNeverMovedBack(runId)
      }
    )

    test(
      'a step that returns after a cancel records its result and is compensated',
      LIMIT,
      async () => {
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
            return { charged: true }
          },
          compensate: async () => {},
        })
        oneStep()

        const runId = await startIn(queued, 'flow')

        assert.equal((await h.run(runId)).status, 'compensated')
        assert.deepEqual((await stepNamed(runId, 'First')).result, {
          charged: true,
        })
        assertNeverMovedBack(runId)
      }
    )

    test(
      'a missing RPC met after a cancel does not suspend the run',
      LIMIT,
      async () => {
        const { RPCNotFoundError } = await import('../rpc/rpc-runner.js')
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
            throw new RPCNotFoundError('first')
          },
        })
        oneStep()

        const runId = await startIn(queued, 'flow')

        assert.equal((await h.run(runId)).status, 'cancelled')
        assertNeverMovedBack(runId)
      }
    )

    test('beginChanges throws once the signal is aborted', LIMIT, async () => {
      const outcomes: string[] = []
      h.register('first', {
        queued,
        forward: async (_data, wire) => {
          await beginChanges(wire.abortScope)
          outcomes.push('allowed')
          await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
          await beginChanges(wire.abortScope).then(
            () => outcomes.push('allowed'),
            (error) => outcomes.push(error.name)
          )
          return {}
        },
      })
      oneStep()

      await startIn(queued, 'flow')

      assert.deepEqual(outcomes, ['allowed', 'AbandonedError'])
    })

    test('each attempt gets its own signal', LIMIT, async () => {
      const signals: AbortSignal[] = []
      h.register('first', {
        queued,
        forward: async (_data, wire) => {
          signals.push(wire.workflowStep.signal)
          if (signals.length === 1) throw new Error('once')
          return {}
        },
      })
      oneStep({ retries: 1 })

      await startIn(queued, 'flow')

      assert.equal(signals.length, 2)
      assert.ok(signals[0] instanceof AbortSignal)
      assert.notEqual(signals[0], signals[1])
      assert.equal(signals[1]!.aborted, false)
    })
  })

  describe(`${kind} step: only a cancel stops it`, () => {
    test(
      'another step failing, which starts an unwind, does not stop it',
      LIMIT,
      async () => {
        let aborted: boolean | undefined
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            const run = await h.run(wire.workflowStep.runId)
            await ws.failOrUnwind(
              run,
              new Error('another step failed'),
              h.rpc as never
            )
            assert.equal((await h.run(run.id)).status, 'compensating')
            await wait(SEVERAL_CHECKS_MS)
            aborted = wire.workflowStep.signal.aborted
            return {}
          },
          compensate: async () => {},
        })
        oneStep()

        await startIn(queued, 'flow')

        assert.equal(aborted, false)
      }
    )

    test(
      'a cancelled run that is already compensating still stops it',
      LIMIT,
      async () => {
        const other = ws.otherInstance()
        let reason: unknown
        let seenStatus: string | undefined
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            const { runId } = wire.workflowStep
            await other.cancelRun(runId, h.rpc as never)
            seenStatus = (await h.run(runId)).status
            await abortedWithin(wire.workflowStep.signal)
            reason = wire.workflowStep.signal.reason
            return {}
          },
          compensate: async () => {},
        })
        oneStep()

        const runId = await startIn(queued, 'flow')

        assert.equal(seenStatus, 'compensating')
        assert.ok(reason instanceof WorkflowStepCancelledError, String(reason))
        assert.equal((await h.run(runId)).status, 'compensated')
        assertNeverMovedBack(runId)
      }
    )

    for (const status of ['completed', 'failed'] as const) {
      test(`a ${status} run does not stop it`, LIMIT, async () => {
        let aborted: boolean | undefined
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await ws.updateRunStatus(wire.workflowStep.runId, status)
            await wait(SEVERAL_CHECKS_MS)
            aborted = wire.workflowStep.signal.aborted
            return {}
          },
        })
        oneStep()

        await startIn(queued, 'flow')

        assert.equal(aborted, false)
      })
    }
  })

  describe(`${kind} compensation: a cancel never stops it`, () => {
    test(
      'a running compensation is not aborted by the cancel it undoes, or a second one',
      LIMIT,
      async () => {
        const seen: boolean[] = []
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
            return {}
          },
          compensate: async () => {
            const { wire } = wires.at(-1)!
            const { runId, signal } = wire.workflowStep
            await wait(SEVERAL_CHECKS_MS)
            seen.push(signal.aborted)
            await ws.cancelRun(runId, h.rpc as never)
            await ws.otherInstance().cancelRun(runId, h.rpc as never)
            await wait(SEVERAL_CHECKS_MS)
            seen.push(signal.aborted)
          },
        })
        oneStep()

        const runId = await startIn(queued, 'flow')

        assert.deepEqual(seen, [false, false])
        assert.equal((await h.run(runId)).status, 'compensated')
        assertNeverMovedBack(runId)
      }
    )
  })

  describe(`${kind} step: deadline`, () => {
    test(
      'a hung step with a timeout fails, retries, then fails the run',
      LIMIT,
      async () => {
        const reasons: unknown[] = []
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            const { signal } = wire.workflowStep
            signal?.addEventListener('abort', () => reasons.push(signal.reason))
            return hang()
          },
        })
        oneStep({ retries: 1, timeout: 20, retryDelay: undefined })

        const runId = await startIn(queued, 'flow')

        assert.equal((await h.run(runId)).status, 'failed')
        assert.deepEqual(h.log, ['do:first', 'do:first'])
        assert.equal(reasons.length, 2)
        assert.ok(reasons.every((r) => r instanceof WorkflowStepTimeoutError))
        const step = await stepNamed(runId, 'First')
        assert.equal(step.attemptCount, 2)
        assert.match(step.error!.message!, /timed out after 20ms/)
      }
    )

    test(
      'the late result of an abandoned attempt is discarded',
      LIMIT,
      async () => {
        let release!: () => void
        const released = new Promise<void>((resolve) => (release = resolve))
        let late: Promise<unknown> | undefined
        h.register('first', {
          queued,
          forward: async () => {
            late = released.then(() => ({ late: true }))
            return late
          },
        })
        oneStep({ retries: 0, timeout: '20ms' })

        const runId = await startIn(queued, 'flow')
        release()
        await late
        await wait(10)

        const step = await stepNamed(runId, 'First')
        assert.equal(step.status, 'failed')
        assert.equal(step.result, undefined)
      }
    )

    test('a step that finishes in time is not aborted', LIMIT, async () => {
      let signal: AbortSignal | undefined
      h.register('first', {
        queued,
        forward: async (_data, wire) => {
          signal = wire.workflowStep.signal
          return {}
        },
      })
      oneStep({ timeout: 20 })

      const runId = await startIn(queued, 'flow')
      await wait(40)

      assert.equal((await h.run(runId)).status, 'completed')
      assert.equal(signal?.aborted, false)
    })

    test(
      'a compensation does not inherit the forward step’s timeout',
      LIMIT,
      async () => {
        let aborted: boolean | undefined
        h.register('first', {
          queued,
          forward: async () => ({}),
          compensate: async () => {
            const { signal } = wires.at(-1)!.wire.workflowStep
            await wait(50)
            aborted = signal.aborted
          },
        })
        h.register('second', { ...h.boom(), queued })
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('First', 'first', {}, { timeout: 20 })
          await workflow.do('Second', 'second', {}, { retries: 0 })
        })

        const runId = await startIn(queued, 'flow')

        assert.equal(aborted, false)
        assert.equal((await h.run(runId)).status, 'compensated')
      }
    )
  })
}

describe('a child run', () => {
  test(
    'cancelling the parent aborts a step running in the child',
    LIMIT,
    async () => {
      let aborted: boolean | undefined
      let parentRunId: string | undefined
      h.register('first', {
        forward: async (_data, wire) => {
          const child = await h.run(wire.workflowStep.runId)
          parentRunId = child.wire.parentRunId
          await ws.cancelRun(parentRunId!, h.rpc as never)
          aborted = wire.workflowStep.signal.aborted
          return {}
        },
      })
      h.defineDsl('child', async (workflow) => {
        await workflow.do('First', 'first', {})
      })
      h.defineDsl('parent', async (workflow) => {
        await workflow.do('Child', 'child', {})
      })

      await h.start('parent')

      assert.ok(parentRunId)
      assert.equal(aborted, true)
    }
  )
})

describe('a queued job delivered after the run stopped', () => {
  const cancelBeforeDelivery = async (compensable: boolean) => {
    h.register('first', compensable ? h.undoable({ ok: 1 }) : h.ok({ ok: 1 }))
    oneStep()
    const { runId } = await ws.startWorkflow(
      'flow',
      {},
      { type: 'test' },
      h.rpc as never
    )
    await ws.orchestrateWorkflow(h.queue.shift()!.data.runId, h.rpc as never)
    assert.equal(h.queue[0]?.data.stepName, 'First')
    await ws.cancelRun(runId, h.rpc as never)
    await h.pump()
    return runId
  }

  test('a forward step does not run', LIMIT, async () => {
    const runId = await cancelBeforeDelivery(false)

    assert.deepEqual(h.log, [])
    assert.equal((await h.run(runId)).status, 'cancelled')
    const step = await stepNamed(runId, 'First')
    assert.equal(step.status, 'failed')
    assert.equal(
      step.error?.message,
      new WorkflowRunStoppedError(runId, 'First').message
    )
    assertNeverMovedBack(runId)
  })

  test(
    'a refused step never ran, so it is not compensated and the unwind ends',
    LIMIT,
    async () => {
      const runId = await cancelBeforeDelivery(true)

      assert.deepEqual(h.log, [])
      assert.equal((await h.run(runId)).status, 'cancelled')
      assertNeverMovedBack(runId)
    }
  )

  test(
    'with nothing to compensate the run stays cancelled, and no later job runs',
    LIMIT,
    async () => {
      h.register('first', h.undoable())
      h.register('second', h.ok())
      h.defineDsl('flow', async (workflow) => {
        await Promise.all([
          workflow.do('First', 'first', {}),
          workflow.do('Second', 'second', {}),
        ])
      })
      const held: typeof h.queue = []
      h.dropWhen = (job) =>
        job.data.stepName !== undefined && held.push(job) > 0
      const runId = await h.start('flow')
      await ws.cancelRun(runId, h.rpc as never)
      h.dropWhen = undefined

      for (const job of held) {
        h.queue.push(job)
        await h.pump()
        assert.equal((await h.run(runId)).status, 'cancelled')
      }

      assert.equal(held.length, 2)
      assert.deepEqual(h.log, [])
    }
  )

  test(
    'a queued compensation still runs, through a second cancel',
    LIMIT,
    async () => {
      h.register('first', h.undoable())
      h.register('second', { ...h.boom(), queued: false })
      h.defineDsl('flow', async (workflow) => {
        await workflow.do('First', 'first', {})
        await workflow.do('Second', 'second', {}, { retries: 0 })
      })
      const { runId } = await ws.startWorkflow(
        'flow',
        {},
        { type: 'test' },
        h.rpc as never
      )
      while (h.queue[0]?.data.stepName !== 'First:compensate') {
        const job = h.queue.shift()!
        if (job.data.stepName !== undefined) {
          await ws.executeWorkflowStep(
            runId,
            job.data.stepName,
            job.data.rpcName,
            job.data.data,
            h.rpc as never
          )
        } else {
          await ws.orchestrateWorkflow(runId, h.rpc as never)
        }
      }

      await ws.cancelRun(runId, h.rpc as never)
      await h.pump()

      assert.deepEqual(h.undone, ['undo:first'])
      assert.equal((await h.run(runId)).status, 'compensated')
      assertNeverMovedBack(runId)
    }
  )
})

describe('an inline step stopped between attempts', () => {
  test(
    'a cancel during the retry delay leaves no attempt in flight',
    LIMIT,
    async () => {
      let runId: string | undefined
      h.register('first', {
        queued: false,
        forward: async (_data, wire) => {
          runId = wire.workflowStep.runId
          setTimeout(() => void ws.cancelRun(runId!, h.rpc as never), 10)
          throw new Error('flaky')
        },
        compensate: async () => {},
      })
      oneStep({ retries: 2, retryDelay: 40 })

      await runInline('flow')

      assert.equal((await h.run(runId!)).status, 'compensated')
      assert.deepEqual(h.log, ['do:first', 'undo:first'])
      assertNeverMovedBack(runId!)
    }
  )
})

describe('a lost lease', () => {
  const shortStepLease = (rpcName: string) =>
    pikkuState(null, 'queue', 'registrations').set(
      (ws as any).getStepWorkerQueueName(rpcName),
      { config: { lockDuration: 30 } } as never
    )

  for (const compensation of [false, true]) {
    test(
      `a lost step lease aborts a ${compensation ? 'compensation' : 'forward'} step’s signal`,
      LIMIT,
      async () => {
        let reason: unknown
        const lose = async () => {
          const { signal } = wires.at(-1)!.wire.workflowStep
          ws.refreshStepLease = async () => false
          await abortedWithin(signal)
          reason = signal?.reason
        }
        h.register('first', {
          forward: async () => {
            if (!compensation) await lose()
            return {}
          },
          compensate: lose,
        })
        h.register('second', { ...h.boom(), queued: false })
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('First', 'first', {})
          if (compensation) {
            await workflow.do('Second', 'second', {}, { retries: 0 })
          }
        })
        shortStepLease('first')

        await h.start('flow')

        assert.ok(reason instanceof LeaseLostError, String(reason))
      }
    )
  }

  test(
    'a lost run lease aborts an inline step’s signal',
    { timeout: 20_000 },
    async () => {
      class LeasedService extends TestWorkflowService {
        protected override readonly leaseService: LeaseService
        constructor() {
          super()
          const leases = new InMemoryLeaseService()
          this.leaseService = {
            acquire: (...args) => leases.acquire(...args),
            release: (...args) => leases.release(...args),
            get: (...args) => leases.get(...args),
            refresh: async () => null,
          }
        }
        override withRunLease<T>(id: string, fn: () => Promise<T>): Promise<T> {
          return PikkuWorkflowService.prototype.withRunLease.call(
            this,
            id,
            fn
          ) as Promise<T>
        }
      }
      harness(new LeasedService())
      let reason: unknown
      h.register('first', {
        queued: false,
        forward: async (_data, wire) => {
          await abortedWithin(wire.workflowStep.signal, 15_000)
          reason = wire.workflowStep.signal?.reason
          return {}
        },
      })
      oneStep()

      await runInline('flow')

      assert.ok(reason instanceof LeaseLostError, String(reason))
    }
  )
})

describe('a cancel that lands as a queued failure is recorded', () => {
  test('the failure is not handed back to the queue', LIMIT, async () => {
    h.register('first', h.boom())
    oneStep({ retries: 2 })
    const { runId } = await ws.startWorkflow(
      'flow',
      {},
      { type: 'test' },
      h.rpc as never
    )
    await ws.orchestrateWorkflow(h.queue.shift()!.data.runId, h.rpc as never)
    const job = h.queue.shift()!.data
    // A database hands out copies; this store hands out the live row.
    const read = ws.getRun.bind(ws)
    ws.getRun = async (id) => {
      const run = await read(id)
      return run && { ...run }
    }
    const record = ws.setStepError.bind(ws)
    ws.setStepError = async (stepId, error, attempt) => {
      await ws.cancelRun(runId, h.rpc as never)
      return record(stepId, error, attempt)
    }

    await assert.doesNotReject(
      ws.executeWorkflowStep(
        runId,
        job.stepName,
        job.rpcName,
        job.data,
        h.rpc as never
      )
    )

    assert.deepEqual(h.log, ['do:first'])
    assert.equal((await h.run(runId)).status, 'cancelled')
  })
})

describe('a graph step', () => {
  for (const queued of [true, false]) {
    test(
      `${queued ? 'queued' : 'inline'}: gets a signal that a cancel aborts`,
      LIMIT,
      async () => {
        let aborted: boolean | undefined
        h.register('first', {
          queued,
          forward: async (_data, wire) => {
            assert.equal(wire.workflowStep.signal.aborted, false)
            await ws.cancelRun(wire.workflowStep.runId, h.rpc as never)
            aborted = wire.workflowStep.signal.aborted
            await assert.rejects(beginChanges(wire.abortScope), {
              name: 'AbandonedError',
            })
            return {}
          },
        })
        h.defineGraph('graph', 'first', { first: {} })

        const runId = await startIn(queued, 'graph')

        assert.equal(aborted, true)
        assert.equal((await h.run(runId)).status, 'cancelled')
        assertNeverMovedBack(runId)
      }
    )
  }
})

describe('a timeout that cannot be applied fails loudly', () => {
  test('on a child workflow step', LIMIT, async () => {
    h.defineDsl('child', async () => ({}))
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('Child', 'child', {}, { timeout: '1s' })
    })

    const runId = await runInline('flow')

    const run = await h.run(runId)
    assert.equal(run.status, 'failed')
    assert.match(run.error!.message!, /timeout.*child workflow/i)
    assert.deepEqual(await ws.getRunSteps(runId), [])
  })

  test('on a function-closure step', LIMIT, async () => {
    let ran = false
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('Closure', async () => (ran = true), { timeout: '1s' })
    })

    const runId = await runInline('flow')

    const run = await h.run(runId)
    assert.equal(run.status, 'failed')
    assert.match(run.error!.message!, /timeout.*function step/i)
    assert.equal(ran, false)
  })

  for (const timeout of ['soon', 0, -1, '30days']) {
    test(`when it is ${JSON.stringify(timeout)}`, LIMIT, async () => {
      h.register('first', { ...h.ok(), queued: false })
      oneStep({ timeout })

      const runId = await runInline('flow')

      assert.equal((await h.run(runId)).status, 'failed')
      assert.deepEqual(h.log, [])
    })
  }
})
