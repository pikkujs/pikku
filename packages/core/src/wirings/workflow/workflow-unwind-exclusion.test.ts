import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'
import { InMemoryLeaseService } from '../../services/in-memory-lease-service.js'
import type { LeaseService } from '../../services/lease-service.js'
import type { StepStatus } from './workflow.types.js'

/** In-memory storage behind the run lease a persistent store inherits. */
class LeasedWorkflowService extends InMemoryWorkflowService {
  readonly leases = new InMemoryLeaseService()
  protected override readonly leaseService: LeaseService = this.leases
  onScheduled?: () => Promise<void>

  override withRunLease<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return PikkuWorkflowService.prototype.withRunLease.call(
      this,
      id,
      fn
    ) as Promise<T>
  }

  protected override async setStepScheduledImpl(
    stepId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const applied = await super.setStepScheduledImpl(stepId, from)
    await this.onScheduled?.()
    return applied
  }
}

let h: QueuedWorkflowHarness

beforeEach(() => {
  h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
})

const gate = () => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { open, opened }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('two drivers of one unwind', () => {
  for (const shape of ['dsl', 'graph'] as const) {
    test(`${shape}: a cancel and the inline pass run one compensation once`, async () => {
      const inLast = gate()
      const finishLast = gate()
      const inUndo = gate()
      const finishUndo = gate()

      h.register('first', {
        queued: false,
        forward: async () => ({}),
        compensate: async () => {
          inUndo.open()
          await finishUndo.opened
        },
      })
      h.register('last', {
        queued: false,
        forward: async () => {
          inLast.open()
          await finishLast.opened
          return {}
        },
      })
      if (shape === 'dsl') {
        h.defineDsl('flow', async (workflow) => {
          await workflow.do('first', 'first', {})
          await workflow.do('last', 'last', {})
        })
      } else {
        h.defineGraph('flow', 'first', {
          first: { next: 'last' },
          last: {},
        })
      }

      let runId!: string
      const pass = h.ws
        .startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
          onRunCreated: (id) => {
            runId = id
          },
        })
        .catch(() => {})

      await inLast.opened
      const cancel = h.ws.cancelRun(runId, h.rpc as never)
      await inUndo.opened
      finishLast.open()
      await settle()
      finishUndo.open()
      await Promise.all([cancel, pass])

      assert.deepEqual(h.undone, ['undo:first'])
      assert.equal((await h.run(runId)).status, 'compensated')
    })
  }
})

describe('an unwind runs only under the run lease', () => {
  let ws: LeasedWorkflowService

  beforeEach(() => {
    ws = new LeasedWorkflowService()
    h = new QueuedWorkflowHarness(ws)
  })

  const startInline = (name: string) => {
    let runId!: string
    const pass = h.ws
      .startWorkflow(name, {}, { type: 'test' }, h.rpc as never, {
        inline: true,
        onRunCreated: (id) => {
          runId = id
        },
      })
      .catch(() => {})
    return { pass, runId: () => runId }
  }

  test('a cancel leaves the unwind to the pass that holds the lease', async () => {
    const inLast = gate()
    const finishLast = gate()
    h.register('first', { ...h.undoable(), queued: false })
    h.register('last', {
      queued: false,
      forward: async () => {
        inLast.open()
        await finishLast.opened
        return {}
      },
    })
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('first', 'first', {})
      await workflow.do('last', 'last', {})
    })

    const { pass, runId } = startInline('flow')
    await inLast.opened
    await h.ws.cancelRun(runId(), h.rpc as never)
    const whileHeld = [...h.undone]
    finishLast.open()
    await pass

    assert.deepEqual(whileHeld, [])
    assert.deepEqual(h.undone, ['undo:first'])
    assert.equal((await h.run(runId())).status, 'compensated')
  })

  test('a cancel that finds the lease held elsewhere wakes the run again', async () => {
    h.register('first', { ...h.undoable(), queued: false })
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('first', 'first', {})
      await workflow.suspend('hold')
    })
    const runId = await h.start('flow')
    const elsewhere = await ws.leases.acquire(
      `workflow-run:${runId}`,
      'another-process',
      60_000
    )

    await h.ws.cancelRun(runId, h.rpc as never)

    assert.deepEqual(h.undone, [])
    assert.equal((await h.run(runId)).status, 'compensating')
    await ws.leases.release(elsewhere!)
    await h.pump()
    assert.deepEqual(h.undone, ['undo:first'])
    assert.equal((await h.run(runId)).status, 'compensated')
  })

  test('a pass that leaves without seeing the cancel unwinds as it goes', async () => {
    h.register('first', { ...h.undoable(), queued: false })
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('first', 'first', {})
      await workflow.sleep('wait', '1h')
    })
    let whileHeld: string[] | undefined
    let cancelled: string | undefined
    ws.onScheduled = async () => {
      cancelled = (await ws.listRuns())[0]!.id
      await ws.cancelRun(cancelled, h.rpc as never)
      whileHeld = [...h.undone]
    }

    await startInline('flow').pass

    assert.deepEqual(whileHeld, [])
    assert.deepEqual(h.undone, ['undo:first'])
    assert.equal((await h.run(cancelled!)).status, 'compensated')
    await ws.close()
  })
})
