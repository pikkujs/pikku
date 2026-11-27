import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { WorkflowCancelledException } from './workflow-errors.js'
import type { WorkflowRun, WorkflowStatus } from './workflow.types.js'
import type { SerializedError } from '../../errors/serialized-error.js'

/** Lets another writer decide a run just ahead of its pass's own cancel. */
class OutrunWorkflowService extends InMemoryWorkflowService {
  winner?: (runId: string) => Promise<unknown>
  /** The runs whose parent the cancelling pass itself told. */
  readonly toldByPass: string[] = []

  override async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: unknown,
    error?: SerializedError
  ) {
    const winner = this.winner
    if (winner && status === 'cancelled') {
      this.winner = undefined
      await winner(id)
    }
    return super.updateRunStatus(id, status, output, error)
  }

  protected override onChildWorkflowFailed(
    childRun: WorkflowRun,
    error: Error
  ) {
    if (error instanceof WorkflowCancelledException) {
      this.toldByPass.push(childRun.id)
    }
    return super.onChildWorkflowFailed(childRun, error)
  }
}

let h: QueuedWorkflowHarness
let ws: OutrunWorkflowService

beforeEach(() => {
  ws = new OutrunWorkflowService()
  h = new QueuedWorkflowHarness(ws)
  h.defineDsl('child', async () => {
    throw new WorkflowCancelledException('child', 'the body gave up')
  })
  h.defineDsl('parent', async (workflow) => workflow.do('child', 'child', {}))
})

const runWithWinner = async (
  winner: (runId: string) => Promise<unknown>
): Promise<string> => {
  let childId!: string
  ws.winner = async (runId) => {
    childId = runId
    await winner(runId)
  }
  await h.start('parent')
  assert.equal(ws.winner, undefined, 'the child never cancelled itself')
  return childId
}

describe("a pass whose 'cancelled' write is refused", () => {
  for (const status of ['compensating', 'completed'] as const) {
    test(`leaves the parent to whoever moved the run to ${status}`, async () => {
      const childId = await runWithWinner((runId) =>
        ws.transitionRunStatus(runId, ['running'], status)
      )

      assert.equal(ws.toldByPass.includes(childId), false)
    })
  }

  test('still tells the parent when the run was cancelled by another writer', async () => {
    const childId = await runWithWinner((runId) =>
      ws.cancelRun(runId, h.rpc as never)
    )

    assert.equal((await h.run(childId)).status, 'cancelled')
    assert.equal(ws.toldByPass.filter((id) => id === childId).length, 1)
  })
})
