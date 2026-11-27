import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import type { WorkflowStatus } from './workflow.types.js'
import type { SerializedError } from '../../errors/serialized-error.js'

class ObservedWorkflowService extends InMemoryWorkflowService {
  readonly cancelledOrder: string[] = []
  onChildCreated?: (parentRunId: string) => Promise<void>

  override async createRun(
    ...args: Parameters<InMemoryWorkflowService['createRun']>
  ) {
    const runId = await super.createRun(...args)
    const parentRunId = args[4]?.parentRunId
    if (parentRunId) await this.onChildCreated?.(parentRunId)
    return runId
  }

  override async transitionRunStatus(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: unknown,
    error?: SerializedError
  ) {
    const applied = await super.transitionRunStatus(
      id,
      from,
      status,
      output,
      error
    )
    if (applied && status === 'cancelled') this.cancelledOrder.push(id)
    return applied
  }
}

let h: QueuedWorkflowHarness
let ws: ObservedWorkflowService

beforeEach(() => {
  ws = new ObservedWorkflowService()
  h = new QueuedWorkflowHarness(ws)
})

const define = (shape: 'dsl' | 'graph') => {
  h.defineDsl('child', async (workflow) => workflow.do('C', 'c', {}))
  if (shape === 'dsl') {
    h.defineDsl('parent', async (workflow) => workflow.do('child', 'child', {}))
  } else {
    h.defineGraph('parent', 'child', { child: {} })
  }
}

const startParent = async (inline: boolean) => {
  let parentId!: string
  await ws
    .startWorkflow('parent', {}, { type: 'test' }, h.rpc as never, {
      inline,
      onRunCreated: (id) => {
        parentId = id
      },
    })
    .catch(() => {})
  await h.pump()
  return parentId
}

const childOf = async (parentId: string) =>
  (await ws.listRuns()).find((run) => run.wire?.parentRunId === parentId)

for (const shape of ['dsl', 'graph'] as const) {
  for (const inline of [true, false]) {
    const site = `${inline ? 'inline' : 'queued'} ${shape}`

    describe(`${site} child workflow`, () => {
      test('is linked to its parent step before it runs', async () => {
        let linkedWhileRunning: Array<string | undefined> | undefined
        let runningChild: string | undefined
        h.register('c', {
          queued: !inline,
          forward: async () => {
            const child = (await ws.listRuns()).find(
              (run) => run.wire?.parentRunId
            )!
            runningChild = child.id
            linkedWhileRunning = (
              await ws.getRunSteps(child.wire!.parentRunId!)
            ).map((step) => step.childRunId)
            return {}
          },
        })
        define(shape)

        const parentId = await startParent(inline)

        assert.deepEqual(linkedWhileRunning, [runningChild])
        assert.equal((await h.run(parentId)).status, 'completed')
        assert.equal(
          (await ws.getRunSteps(parentId))[0]!.childRunId,
          runningChild
        )
      })

      test(
        'is linked before it is handed to the queue',
        { skip: inline },
        async () => {
          h.register('c', h.ok())
          define(shape)
          let linkedWhenQueued: Promise<unknown> | undefined
          h.rejectAddWhen = (_queue, data) => {
            const parentId = data.runId
            if (data.stepName === undefined && !linkedWhenQueued) {
              linkedWhenQueued = ws
                .getRun(parentId)
                .then(async (run) =>
                  run?.wire?.parentRunId
                    ? (await ws.getRunSteps(run.wire.parentRunId)).map(
                        (step) => step.childRunId === run.id
                      )
                    : undefined
                )
              // Only the child's own first job is of interest.
              void linkedWhenQueued.then((links) => {
                if (links === undefined) linkedWhenQueued = undefined
              })
            }
            return false
          }

          await startParent(inline)

          assert.deepEqual(await linkedWhenQueued, [true])
        }
      )

      test('never starts when the parent is cancelled while it is created', async () => {
        h.register('c', { ...h.ok(), queued: !inline })
        define(shape)
        ws.onChildCreated = async (parentRunId) => {
          ws.onChildCreated = undefined
          await ws.cancelRun(parentRunId, h.rpc as never)
        }

        const parentId = await startParent(inline)

        assert.equal(ws.onChildCreated, undefined, 'no child was created')
        assert.deepEqual(h.log, [])
        assert.equal((await childOf(parentId))?.status, 'cancelled')
        assert.equal((await h.run(parentId)).status, 'cancelled')
      })
    })
  }
}

for (const shape of ['dsl', 'graph'] as const) {
  for (const inline of [true, false]) {
    describe(`${inline ? 'inline' : 'queued'} ${shape} child that cannot be linked`, () => {
      test('is failed unstarted, so no sweep runs it later', async () => {
        h.register('c', { ...h.ok(), queued: !inline })
        define(shape)
        let refusals = 0
        ws.onChildCreated = async () => {
          ws.setStepChildRunId = async () => {
            refusals++
            throw new Error('store unreachable')
          }
        }

        await startParent(inline)

        assert.ok(refusals > 0, 'no link was attempted')
        await ws.recoverStalledRuns({ stalledAfterMs: -60_000 })
        await h.pump()
        const children = (await ws.listRuns()).filter(
          (run) => run.wire?.parentRunId
        )
        assert.ok(children.length > 0)
        for (const child of children) {
          assert.equal(child.status, 'failed')
          assert.equal(child.error?.message, 'store unreachable')
        }
        assert.deepEqual(h.log, [])
      })
    })
  }
}

for (const shape of ['dsl', 'graph'] as const) {
  describe(`${shape} run whose onRunCreated throws`, () => {
    test('is failed unstarted and the caller gets the error', async () => {
      h.register('c', { ...h.ok(), queued: false })
      define(shape)
      let runId!: string

      await assert.rejects(
        ws.startWorkflow('parent', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
          onRunCreated: (id) => {
            runId = id
            throw new Error('caller gave up')
          },
        }),
        /caller gave up/
      )

      assert.equal((await h.run(runId)).status, 'failed')
      assert.deepEqual(h.log, [])
    })

    test("rethrows the caller's error when the run cannot be failed", async () => {
      h.register('c', { ...h.ok(), queued: false })
      define(shape)

      await assert.rejects(
        ws.startWorkflow('parent', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
          onRunCreated: () => {
            ws.updateRunStatus = async () => {
              throw new Error('store unreachable')
            }
            throw new Error('caller gave up')
          },
        }),
        /caller gave up/
      )
    })
  })
}

describe('cancelling a run with a child', () => {
  test('marks the parent cancelled before it cancels the child', async () => {
    h.defineDsl('child', async (workflow) => workflow.suspend('hold'))
    h.defineDsl('parent', async (workflow) => workflow.do('child', 'child', {}))
    const parentId = await startParent(false)
    const childId = (await childOf(parentId))!.id

    await ws.cancelRun(parentId, h.rpc as never)

    assert.deepEqual(ws.cancelledOrder, [parentId, childId])
  })
})

/** Runs a recovery tick between a child ending and its parent recording it. */
class SweptWorkflowService extends InMemoryWorkflowService {
  sweeps = 0

  override async startWorkflow<I>(
    ...args: Parameters<
      typeof InMemoryWorkflowService.prototype.startWorkflow<I>
    >
  ) {
    try {
      return await super.startWorkflow<I>(...args)
    } finally {
      if (args[2].parentRunId && this.sweeps === 0) {
        this.sweeps++
        await this.recoverStalledRuns({ stalledAfterMs: -60_000 })
      }
    }
  }
}

describe('a sweep settling an inline child step its pass still awaits', () => {
  let swept: SweptWorkflowService

  beforeEach(() => {
    swept = new SweptWorkflowService()
    h = new QueuedWorkflowHarness(swept)
  })

  const runParent = async (retries: number) => {
    h.defineDsl('child', async (workflow) => workflow.do('C', 'c', {}))
    h.defineDsl('parent', async (workflow) => ({
      out: await workflow.do('child', 'child', {}, { retries }),
    }))
    let parentId!: string
    let thrown: Error | undefined
    await swept
      .startWorkflow('parent', {}, { type: 'test' }, h.rpc as never, {
        inline: true,
        onRunCreated: (id) => {
          parentId = id
        },
      })
      .catch((error) => (thrown = error))
    assert.equal(swept.sweeps, 1, 'no sweep ran')
    return { parent: await h.run(parentId), parentId, thrown }
  }

  test('leaves a succeeded child as it is and completes the parent', async () => {
    h.register('c', { ...h.undoable({ ok: 1 }), queued: false })

    const { parent, parentId, thrown } = await runParent(0)

    assert.equal(thrown, undefined)
    assert.equal(parent.status, 'completed')
    assert.deepEqual(parent.output, { out: { ok: 1 } })
    assert.deepEqual(h.undone, [])
    assert.equal((await swept.getRunSteps(parentId))[0]!.status, 'succeeded')
  })

  test("fails the parent with the failed child's own error", async () => {
    h.register('c', { ...h.boom('child boom'), queued: false })

    const { parent, thrown } = await runParent(0)

    assert.equal(thrown?.message, 'child boom')
    assert.equal(parent.status, 'failed')
    assert.equal(parent.error?.message, 'child boom')
  })

  test('still retries a failed child the sweep recorded first', async () => {
    let calls = 0
    h.register('c', {
      queued: false,
      forward: async () => {
        if (++calls === 1) throw new Error('child boom')
        return { ok: 2 }
      },
    })

    const { parent, thrown } = await runParent(1)

    assert.equal(thrown, undefined)
    assert.equal(parent.status, 'completed')
    assert.deepEqual(parent.output, { out: { ok: 2 } })
  })
})
