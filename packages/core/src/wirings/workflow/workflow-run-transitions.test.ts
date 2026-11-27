import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import type { WorkflowStatus } from './workflow.types.js'
import type { SerializedError } from '../../errors/serialized-error.js'

/** Cancels the run as a pass is about to write `before`, after its last look. */
class CancelledJustBefore extends InMemoryWorkflowService {
  before?: WorkflowStatus
  cancel?: (runId: string) => Promise<unknown>

  override async transitionRunStatus(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: unknown,
    error?: SerializedError
  ) {
    if (status === this.before) {
      this.before = undefined
      await this.cancel!(id)
    }
    return super.transitionRunStatus(id, from, status, output, error)
  }
}

let h: QueuedWorkflowHarness
let ws: CancelledJustBefore

beforeEach(() => {
  ws = new CancelledJustBefore()
  h = new QueuedWorkflowHarness(ws)
  ws.cancel = (runId) => ws.cancelRun(runId, h.rpc as never)
})

describe('a pass cannot overwrite a cancel that landed after its last look', () => {
  for (const queued of [true, false]) {
    const mode = queued ? 'queued' : 'inline'
    const outcomes: Array<[WorkflowStatus, (workflow: any) => Promise<any>]> = [
      [
        'completed',
        async (workflow) => {
          await workflow.do('first', 'first', {})
          return { done: true }
        },
      ],
      [
        'failed',
        async (workflow) => {
          await workflow.do('first', 'first', {})
          throw new Error('body failed')
        },
      ],
      [
        'suspended',
        async (workflow) => {
          await workflow.do('first', 'first', {})
          await workflow.suspend('hold')
        },
      ],
    ]

    for (const [status, body] of outcomes) {
      test(`${mode} dsl: not as ${status}`, async () => {
        h.register('first', { ...h.ok(), queued })
        h.defineDsl('flow', body)
        ws.before = status

        let runId!: string
        await ws
          .startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
            inline: !queued,
            onRunCreated: (id) => {
              runId = id
            },
          })
          .catch(() => {})
        await h.pump()

        const run = await h.run(runId)
        assert.equal(ws.before, undefined, 'the cancel never landed')
        assert.equal(run.status, 'cancelled')
        assert.equal(run.error?.code, 'WORKFLOW_CANCELLED')
      })
    }

    test(`${mode} graph: not as completed`, async () => {
      h.register('first', { ...h.ok(), queued })
      h.defineGraph('flow', 'first', { first: {} })
      ws.before = 'completed'

      const runId = await h.start(
        'flow',
        {},
        { type: 'test' },
        { inline: !queued }
      )

      assert.equal(ws.before, undefined, 'the cancel never landed')
      assert.equal((await h.run(runId)).status, 'cancelled')
    })
  }

  test('a failure cannot take over the unwind of a cancel', async () => {
    h.register('first', h.undoable())
    h.defineDsl('flow', async (workflow) => {
      await workflow.do('first', 'first', {})
      throw new Error('body failed')
    })
    ws.before = 'compensating'

    const runId = await h.start('flow')

    const run = await h.run(runId)
    assert.equal(ws.before, undefined, 'the cancel never landed')
    assert.equal(run.error?.code, 'WORKFLOW_CANCELLED')
    assert.equal(run.status, 'compensated')
    assert.deepEqual(h.undone, ['undo:first'])
  })
})

describe('a run status is written only from a status that may precede it', () => {
  const start = () =>
    ws.createRun('flow', {}, false, 'hash', { type: 'test' } as never)

  for (const late of ['completed', 'failed', 'suspended'] as const) {
    test(`a cancelled run does not become ${late}`, async () => {
      const runId = await start()
      const cause = { message: 'stop', stack: '', code: 'WORKFLOW_CANCELLED' }

      assert.equal(
        await ws.updateRunStatus(runId, 'cancelled', undefined, cause),
        true
      )
      assert.equal(
        await ws.updateRunStatus(runId, late, 'late', {
          message: 'late',
          stack: '',
        }),
        false
      )

      const run = (await ws.getRun(runId))!
      assert.equal(run.status, 'cancelled')
      assert.equal(run.error?.code, 'WORKFLOW_CANCELLED')
      assert.equal(run.output ?? undefined, undefined)
    })
  }
})
