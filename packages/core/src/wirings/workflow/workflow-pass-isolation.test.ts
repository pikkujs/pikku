import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'
import { InMemoryLeaseService } from '../../services/in-memory-lease-service.js'
import {
  LeaseLostError,
  type Lease,
  type LeaseService,
} from '../../services/lease-service.js'
import {
  fastLeaseRenewals,
  gate,
  until,
} from './workflow-lease-helpers.test.js'

const LIMIT = { timeout: 20_000 }

let restoreTimers: () => void
before(() => {
  restoreTimers = fastLeaseRenewals()
})
after(() => restoreTimers())

/** Every holder is told it still has the lease, until it is named as lost. */
class ScriptedLeases extends InMemoryLeaseService {
  readonly granted: Lease[] = []
  readonly lost = new Set<number>()
  private readonly clock: { skew: number }

  constructor() {
    const clock = { skew: 0 }
    super(() => Date.now() + clock.skew)
    this.clock = clock
  }

  lapse() {
    this.clock.skew += 60_000
  }

  override async acquire(key: string, holder: string, ttlMs: number) {
    const lease = await super.acquire(key, holder, ttlMs)
    if (lease) this.granted.push(lease)
    return lease
  }

  override async refresh(lease: Lease): Promise<Lease | null> {
    return this.lost.has(lease.token) ? null : lease
  }
}

class LeasedService extends InMemoryWorkflowService {
  protected override readonly leaseService: LeaseService
  constructor(readonly leases = new ScriptedLeases()) {
    super()
    this.leaseService = leases
  }

  override withRunLease<T>(
    id: string,
    fn: (lost?: AbortSignal) => Promise<T>
  ): Promise<T> {
    return PikkuWorkflowService.prototype.withRunLease.call(
      this,
      id,
      fn
    ) as Promise<T>
  }
}

const newRun = async (ws: InMemoryWorkflowService) => {
  const runId = await ws.createRun('flow', {}, true, 'flow-hash', {
    type: 'test',
  })
  ws.registerInlineRun(runId)
  return runId
}

describe('two passes of one run active at once', () => {
  test(
    'a newer pass does not change the step keys of an older one',
    LIMIT,
    async () => {
      const h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
      const ws = h.ws as InMemoryWorkflowService
      const olderBetween = gate()
      const olderResume = gate()
      const newerEntered = gate()
      const newerResume = gate()
      let passes = 0
      let seen: unknown[] = []
      h.defineDsl('flow', async (w: any) => {
        const mine = ++passes
        if (mine === 2) {
          newerEntered.open()
          await newerResume.passed
          return {}
        }
        const first = await w.do('A', async () => 'first')
        olderBetween.open()
        await olderResume.passed
        const second = await w.do('A', async () => 'second')
        seen = [first, second]
        return {}
      })
      const runId = await newRun(ws)

      const older = ws.runWorkflowJob(runId, h.rpc as never)
      await olderBetween.passed
      const newer = ws.runWorkflowJob(runId, h.rpc as never)
      await newerEntered.passed
      olderResume.open()
      await older
      newerResume.open()
      await newer.catch(() => {})

      assert.deepEqual(seen, ['first', 'second'])
      const steps = await ws.getRunSteps(runId)
      assert.deepEqual(
        steps.map((s) => [s.stepName, s.fromStepName]),
        [
          ['A', undefined],
          ['A#1', 'A'],
        ]
      )
    }
  )

  /**
   * Two passes holding their own lease on one run, each with a step in flight.
   * The older pass opens its attempt only once the newer one holds a lease too.
   */
  const bothInAStep = async () => {
    const service = new LeasedService()
    const h = new QueuedWorkflowHarness(service)
    const entered = [gate(), gate()]
    const go = [gate(), gate()]
    const done = [gate(), gate()]
    const signals: AbortSignal[] = []
    let passes = 0
    h.register('probe', {
      queued: false,
      forward: async ({ pass }, wire) => {
        signals[pass] = wire.workflowStep.signal
        await done[pass]!.passed
        return {}
      },
    })
    h.defineDsl('flow', async (w: any) => {
      const pass = passes++
      entered[pass]!.open()
      await go[pass]!.passed
      await w.do(`Probe ${pass}`, 'probe', { pass })
      return {}
    })
    const runId = await newRun(service)
    const run = () =>
      service
        .runWorkflowJob(runId, h.rpc as never)
        .catch((error: unknown) => error)

    const older = run()
    await entered[0]!.passed
    service.leases.lapse()
    const newer = run()
    await entered[1]!.passed
    go[0]!.open()
    await until(() => !!signals[0])
    go[1]!.open()
    await until(() => !!signals[1])

    const end = async () => {
      done[0]!.open()
      done[1]!.open()
      await Promise.all([older, newer])
    }
    return { service, signals: signals as [AbortSignal, AbortSignal], end }
  }

  for (const [lost, kept, name] of [
    [0, 1, 'older'],
    [1, 0, 'newer'],
  ] as const) {
    test(
      `only the ${name} pass losing its lease aborts only its own attempt`,
      LIMIT,
      async () => {
        const { service, signals, end } = await bothInAStep()

        service.leases.lost.add(service.leases.granted[lost]!.token)

        const aborted = await until(() => signals[lost].aborted, 2_000)
        const other = signals[kept].aborted
        await end()
        assert.equal(aborted, true, `the ${name} pass never heard its loss`)
        assert.ok(signals[lost].reason instanceof LeaseLostError)
        assert.equal(other, false, 'the other pass’s attempt was aborted')
      }
    )
  }
})
