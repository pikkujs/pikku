import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'
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

/** The real step lock, lost while the step it covers is being recorded. */
class LosingStepLockService extends LeasedWorkflowService {
  private armed = true

  override withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return PikkuWorkflowService.prototype.withStepLock.call(
      this,
      runId,
      stepName,
      fn
    ) as Promise<T>
  }

  override async setStepRunning(stepId: string, attempt?: number) {
    await super.setStepRunning(stepId, attempt)
    const lock = this.leases.granted
      .filter(({ key }) => key.startsWith('workflow-step:'))
      .at(-1)
    if (this.armed && lock) {
      this.armed = false
      this.leases.lost.add(lock.holder)
      await afterRenewal()
    }
  }
}

let ws: LosingStepLockService
let h: QueuedWorkflowHarness

beforeEach(() => {
  ws = new LosingStepLockService()
  h = new QueuedWorkflowHarness(ws)
})

describe('a gate whose step lock is lost', () => {
  for (const [kind, gateStep] of [
    ['suspend', (w: any) => w.suspend('wait for operator')],
    ['approval', (w: any) => w.approval('sign off', {})],
  ] as const) {
    test(
      `${kind}: the run suspends and compensates nothing`,
      LIMIT,
      async () => {
        h.register('zero', { ...h.undoable(), queued: false })
        h.defineDsl('flow', async (w: any) => {
          await w.do('Zero', 'zero', {})
          await gateStep(w)
          return {}
        })
        let runId = ''

        await ws.startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
          inline: true,
          onRunCreated: (id) => {
            runId ||= id
          },
        })

        assert.equal((await ws.getRun(runId))!.status, 'suspended')
        assert.deepEqual(h.undone, [])
      }
    )
  }
})
