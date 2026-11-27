import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../../testing/service-tests/queued-workflow-harness.js'
import {
  LeaseLostError,
  LeaseTakenError,
} from '../../../services/lease-service.js'
import {
  afterRenewal,
  fastLeaseRenewals,
  gate,
  LeasedWorkflowService,
} from '../workflow-lease-helpers.test.js'
import type { InMemoryWorkflowService } from '../in-memory-workflow-service.js'

const LIMIT = { timeout: 20_000 }

let restoreTimers: () => void
before(() => {
  restoreTimers = fastLeaseRenewals()
})
after(() => restoreTimers())

let ws: LeasedWorkflowService
let h: QueuedWorkflowHarness
let runId: string

const useService = <T extends InMemoryWorkflowService>(service: T): T => {
  runId = ''
  h = new QueuedWorkflowHarness(service)
  return service
}

beforeEach(() => {
  ws = useService(new LeasedWorkflowService())
})

const node = (
  forward: (data: any, wire: any) => Promise<unknown>,
  compensate?: () => Promise<void>
) => ({ queued: false, forward, ...(compensate ? { compensate } : {}) })

const startInline = () =>
  h.ws.startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
    inline: true,
    onRunCreated: (id) => {
      runId ||= id
    },
  })

const rows = async () =>
  (await h.ws.getRunSteps(runId)).map(
    (step) => `${step.stepName}:${step.attemptCount}:${step.status}`
  )

const status = async () => (await h.ws.getRun(runId))!.status

/** A node that waits to be let go. */
const gatedNode = (compensate?: () => Promise<void>) => {
  const entered = gate()
  const release = gate()
  return {
    entered: entered.passed,
    release: release.open,
    handler: node(async () => {
      entered.open()
      await release.passed
      return {}
    }, compensate),
  }
}

describe('an inline graph run holds its run lease', () => {
  for (const when of ['an entry node', 'a later node'] as const) {
    test(`a second pass is refused while ${when} runs`, LIMIT, async () => {
      const slow = gatedNode()
      h.register('slow', slow.handler)
      if (when === 'an entry node') {
        h.defineGraph('flow', 'slow', { slow: {} })
      } else {
        h.register(
          'first',
          node(async () => ({}))
        )
        h.defineGraph('flow', 'first', {
          first: { next: 'slow' },
          slow: {},
        })
      }

      const pass = startInline()
      await slow.entered

      const second = await h.ws.runWorkflowJob(runId, h.rpc as never).then(
        () => 'ran',
        (error) => error
      )
      slow.release()
      await pass

      assert.ok(second instanceof LeaseTakenError, `second pass: ${second}`)
      assert.equal(await status(), 'completed')
    })
  }

  test('a live node is not taken over by a cancel', LIMIT, async () => {
    const undone: string[] = []
    const slow = gatedNode(async () => {
      undone.push('slow')
    })
    h.register('slow', slow.handler)
    h.defineGraph('flow', 'slow', { slow: {} })

    const pass = startInline()
    await slow.entered
    await h.ws.cancelRun(runId, h.rpc as never)
    const during = await rows()
    const undoneDuring = [...undone]
    slow.release()
    await pass

    assert.deepEqual(during, ['slow:1:running'])
    assert.deepEqual(undoneDuring, [])
    assert.equal(await status(), 'compensated')
    assert.deepEqual(undone, ['slow'])
  })

  test(
    'a node that lost the lease records nothing and the run is picked up',
    LIMIT,
    async () => {
      let calls = 0
      h.register(
        'zero',
        node(
          async () => ({}),
          async () => {}
        )
      )
      h.register(
        'first',
        node(async (_data, wire) => {
          if (++calls > 1) return {}
          const signal: AbortSignal = wire.workflowStep.signal
          ws.leases.lose(runId)
          await afterRenewal()
          throw signal.reason
        })
      )
      h.defineGraph('flow', 'zero', {
        zero: { next: 'first' },
        first: { retries: 1 },
      })

      await startInline()

      assert.equal(await status(), 'completed')
      assert.equal(calls, 2)
      assert.deepEqual(await rows(), [
        'zero:1:succeeded',
        'first:1:running',
        'first:2:succeeded',
      ])
      assert.ok(!h.log.some((entry) => entry.startsWith('undo')))
    }
  )

  test(
    'a node with no attempt left after a lost lease fails the run',
    LIMIT,
    async () => {
      let calls = 0
      h.register(
        'only',
        node(async (_data, wire) => {
          calls++
          const signal: AbortSignal = wire.workflowStep.signal
          ws.leases.lose(runId)
          await afterRenewal()
          throw signal.reason
        })
      )
      h.defineGraph('flow', 'only', { only: { retries: 0 } })

      await startInline()

      assert.equal(calls, 1)
      assert.equal(await status(), 'failed')
      const step = await h.ws.getStepState(runId, 'only')
      assert.match(step.error!.message, /lost its worker/)
    }
  )

  test(
    'a run another process took is left to it, with nothing recorded',
    LIMIT,
    async () => {
      h.register(
        'only',
        node(async (_data, wire) => {
          const signal: AbortSignal = wire.workflowStep.signal
          ws.leases.loseToAnother(runId)
          await afterRenewal()
          throw signal.reason
        })
      )
      h.defineGraph('flow', 'only', { only: { retries: 3 } })

      await assert.rejects(startInline(), LeaseLostError)

      assert.equal(await status(), 'running')
      assert.deepEqual(await rows(), ['only:1:running'])
    }
  )

  test(
    'a node that succeeded as the lease was lost keeps its result and the run goes on',
    LIMIT,
    async () => {
      h.register(
        'first',
        node(async () => {
          ws.leases.lose(runId)
          await afterRenewal()
          return {}
        })
      )
      h.register(
        'next',
        node(async () => ({}))
      )
      h.defineGraph('flow', 'first', { first: { next: 'next' }, next: {} })

      await startInline()

      assert.equal(await status(), 'completed')
      assert.deepEqual(await rows(), ['first:1:succeeded', 'next:1:succeeded'])
    }
  )
})
