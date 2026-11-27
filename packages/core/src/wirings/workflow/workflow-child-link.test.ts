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
