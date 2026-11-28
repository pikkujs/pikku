import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { getSingletonServices } from '../../pikku-state.js'
import { LeaseLostError } from '../../services/lease-service.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { WorkflowAsyncException } from './workflow-errors.js'
import {
  afterRenewal,
  fastLeaseRenewals,
  gate,
  LeasedWorkflowService,
} from './workflow-lease-helpers.test.js'

const LIMIT = { timeout: 20_000 }

let restoreTimers: () => void
before(() => {
  restoreTimers = fastLeaseRenewals()
})
after(() => restoreTimers())

/** The run lease is lost while a genuine step failure is being written. */
class LosingDuringErrorWrite extends LeasedWorkflowService {
  runId = ''
  armed = true
  toAnother = false

  override async setStepError(
    ...args: Parameters<LeasedWorkflowService['setStepError']>
  ) {
    await super.setStepError(...args)
    if (this.armed && args[1].message === 'genuine') {
      this.armed = false
      if (this.toAnother) this.leases.loseToAnother(this.runId)
      else this.leases.lose(this.runId)
      await afterRenewal()
    }
  }
}

let ws: LosingDuringErrorWrite
let h: QueuedWorkflowHarness

beforeEach(() => {
  ws = new LosingDuringErrorWrite()
  h = new QueuedWorkflowHarness(ws)
  delete (getSingletonServices() as any).queueService
})

const rows = async (service: InMemoryWorkflowService, runId: string) =>
  (await service.getRunSteps(runId)).map(
    (step) => `${step.stepName}:${step.attemptCount}:${step.status}`
  )

const startInline = () =>
  ws.startWorkflow('flow', {}, { type: 'test' }, h.rpc as never, {
    inline: true,
    onRunCreated: (id) => {
      ws.runId ||= id
    },
  })

const failingOnce = () => {
  let calls = 0
  return async () => {
    if (++calls === 1) throw new Error('genuine')
    return {}
  }
}

describe('a failed inline step that still has retries', () => {
  const rpcFlow = () => {
    h.register('first', { queued: false, forward: failingOnce() })
    h.defineDsl('flow', async (w: any) => {
      await w.do('First', 'first', {}, { retries: 3 })
      return {}
    })
  }

  test(
    'the pass that lost the run while failing it creates no attempt',
    LIMIT,
    async () => {
      rpcFlow()
      ws.toAnother = true

      await assert.rejects(startInline(), LeaseLostError)

      assert.deepEqual(await rows(ws, ws.runId), ['First:1:failed'])
      assert.equal((await ws.getRun(ws.runId))!.status, 'running')
    }
  )

  test('picked up again, it spends a retry', LIMIT, async () => {
    rpcFlow()

    await startInline()

    assert.deepEqual(await rows(ws, ws.runId), [
      'First:1:failed',
      'First:2:succeeded',
    ])
    assert.equal((await ws.getRun(ws.runId))!.status, 'completed')
  })

  test('a compensation spends its retry too', LIMIT, async () => {
    let undos = 0
    h.register('zero', {
      queued: false,
      forward: async () => ({}),
      compensate: async () => {
        if (++undos === 1) throw new Error('genuine')
      },
    })
    h.register('first', { ...h.boom('fails for good'), queued: false })
    h.defineDsl('flow', async (w: any) => {
      await w.do('Zero', 'zero', {})
      await w.do('First', 'first', {}, { retries: 0 })
      return {}
    })

    await startInline().catch(() => {})

    assert.deepEqual(await rows(ws, ws.runId), [
      'Zero:1:succeeded',
      'First:1:failed',
      'Zero:compensate:1:failed',
      'Zero:compensate:2:succeeded',
    ])
    assert.equal((await ws.getRun(ws.runId))!.status, 'compensated')
    assert.equal(undos, 2)
  })

  test(
    'a process that died there leaves a step the next pass retries',
    LIMIT,
    async () => {
      rpcFlow()
      h.register('first', { ...h.ok(), queued: false })
      ws.armed = false
      const runId = await ws.createRun('flow', {}, true, 'flow-hash', {
        type: 'test',
      })
      const step = await ws.insertStepState(
        runId,
        'First',
        'first',
        {},
        {
          retries: 3,
        }
      )
      await ws.setStepRunning(step.stepId, 1)
      await ws.setStepError(step.stepId, new Error('before the crash'), 1)

      await ws.runWorkflowJob(runId, h.rpc as never)

      assert.deepEqual(await rows(ws, runId), [
        'First:1:failed',
        'First:2:succeeded',
      ])
    }
  )

  test(
    'with every attempt spent it throws what the step threw',
    LIMIT,
    async () => {
      rpcFlow()
      ws.armed = false
      const runId = await ws.createRun('flow', {}, true, 'flow-hash', {
        type: 'test',
      })
      const step = await ws.insertStepState(
        runId,
        'First',
        'first',
        {},
        {
          retries: 0,
        }
      )
      h.defineDsl('flow', async (w: any) => {
        await w.do('First', 'first', {}, { retries: 0 })
        return {}
      })
      await ws.setStepRunning(step.stepId, 1)
      await ws.setStepError(step.stepId, new Error('final'), 1)

      await assert.rejects(ws.runWorkflowJob(runId, h.rpc as never), /final/)

      assert.deepEqual(await rows(ws, runId), ['First:1:failed'])
    }
  )

  test(
    'on a pass-through lease, a pass between attempts is not overtaken',
    LIMIT,
    async () => {
      const inGap = gate()
      const release = gate()
      class StallingInGap extends InMemoryWorkflowService {
        private armed = true
        override async setStepError(
          ...args: Parameters<InMemoryWorkflowService['setStepError']>
        ) {
          await super.setStepError(...args)
          if (!this.armed) return
          this.armed = false
          inGap.open()
          await release.passed
        }
      }
      const service = new StallingInGap()
      const harness = new QueuedWorkflowHarness(service)
      harness.register('first', { queued: false, forward: failingOnce() })
      harness.defineDsl('flow', async (w: any) => {
        await w.do('First', 'first', {}, { retries: 3 })
        return {}
      })
      const runId = await service.createRun('flow', {}, true, 'flow-hash', {
        type: 'test',
      })
      const older = service.runWorkflowJob(runId, harness.rpc as never)
      await inGap.passed

      await assert.rejects(
        service.runWorkflowJob(runId, harness.rpc as never),
        WorkflowAsyncException
      )

      assert.deepEqual(await rows(service, runId), ['First:1:failed'])
      release.open()
      await older
      assert.deepEqual(await rows(service, runId), [
        'First:1:failed',
        'First:2:succeeded',
      ])
    }
  )
})
