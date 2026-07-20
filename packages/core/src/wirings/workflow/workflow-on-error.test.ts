import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'

/**
 * Drive the real failure branch: a step that is already terminally failed must
 * invoke its onError handler and still throw. Only the nested compensation
 * call is intercepted, so the branch under test is the production one.
 */
class TestWorkflowService extends InMemoryWorkflowService {
  public compensations: Array<{ rpcName: string; data: any }> = []

  public async callFailedStep(
    runId: string,
    stepName: string,
    onError?: string
  ) {
    const self = this as any
    const realRpcStep = self.rpcStep.bind(self)
    let depth = 0
    self.rpcStep = async (...args: any[]) => {
      if (depth++ > 0) {
        this.compensations.push({ rpcName: args[2], data: args[3] })
        return { compensated: true }
      }
      return realRpcStep(...args)
    }
    return self.rpcStep(runId, stepName, 'chargeCard', {}, {}, { onError })
  }
}

async function seedFailedStep(ws: TestWorkflowService, stepName: string) {
  const runId = await ws.createRun('wf', {}, true, 'hash', {
    type: 'inline',
  } as any)
  const step = await ws.insertStepState(runId, stepName, 'chargeCard', {})
  await (ws as any).updateStepStateImpl?.(runId, stepName, {
    status: 'failed',
    error: { message: 'card declined' },
  })
  const raw = (ws as any).steps ?? (ws as any).stepStates
  if (raw?.get) {
    const key = [...raw.keys()].find((k: string) => k.includes(stepName))
    if (key) {
      raw.set(key, {
        ...raw.get(key),
        status: 'failed',
        error: { message: 'card declined' },
      })
    }
  }
  return { runId, step }
}

describe('workflow onError — compensation on terminal step failure', () => {
  test('a failed step runs its handler and still throws the original error', async () => {
    const ws = new TestWorkflowService()
    const { runId } = await seedFailedStep(ws, 'Charge')

    await assert.rejects(
      () => ws.callFailedStep(runId, 'Charge', 'refundOrder'),
      /card declined/,
      'compensation must not swallow the failure — the workflow still fails'
    )

    assert.equal(
      ws.compensations.length,
      1,
      'the onError handler must have been invoked'
    )
    assert.equal(ws.compensations[0].rpcName, 'refundOrder')
    assert.deepEqual(
      ws.compensations[0].data,
      { error: { message: 'card declined' } },
      'the handler receives the failure reason, as a graph onError node does'
    )
  })

  test('a failed step with no onError simply throws', async () => {
    const ws = new TestWorkflowService()
    const { runId } = await seedFailedStep(ws, 'Charge')

    await assert.rejects(() => ws.callFailedStep(runId, 'Charge', undefined))
    assert.equal(
      ws.compensations.length,
      0,
      'no handler configured means nothing to compensate'
    )
  })
})
