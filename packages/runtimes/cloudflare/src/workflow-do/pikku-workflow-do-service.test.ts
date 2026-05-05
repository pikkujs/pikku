import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { PikkuWorkflowDoService } from './pikku-workflow-do-service.js'
import type {
  PikkuWorkflowDoEnv,
  PikkuDoStepDispatch,
} from './pikku-workflow-do-service.js'
import type { DoPendingAlarm } from './do-storage-types.js'

// ─── Fake DurableObjectStorage ────────────────────────────────────────

class FakeStorage {
  data = new Map<string, unknown>()
  alarmAt: number | null = null
  deletedAll = false

  async get(key: string | string[]): Promise<any> {
    if (Array.isArray(key)) {
      const out = new Map<string, unknown>()
      for (const k of key) {
        if (this.data.has(k)) out.set(k, this.data.get(k))
      }
      return out
    }
    return this.data.get(key)
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async deleteAll(): Promise<void> {
    this.data.clear()
    this.deletedAll = true
  }

  async setAlarm(time: number): Promise<void> {
    this.alarmAt = time
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmAt
  }

  async deleteAlarm(): Promise<void> {
    this.alarmAt = null
  }
}

// Concrete subclass for testing — base class is abstract.
class TestService extends PikkuWorkflowDoService<PikkuWorkflowDoEnv> {}

const RUN_ID = 'test-run-id-0001'

let storage: FakeStorage
let dispatched: PikkuDoStepDispatch[]
let env: PikkuWorkflowDoEnv
let service: TestService

beforeEach(() => {
  storage = new FakeStorage()
  dispatched = []
  const stepStub = {
    run: async (d: PikkuDoStepDispatch) => {
      dispatched.push(d)
    },
  }
  // Per-rpc bindings — keys match `toStepBindingName(rpcName)` for the
  // rpcNames used in tests below (`rpc.x`, `r`, `rpc.s`).
  env = {
    'rpc.x': stepStub,
    r: stepStub,
    'rpc.s': stepStub,
  }
  service = new TestService(storage as any, env, RUN_ID)
})

describe('PikkuWorkflowDoService — storage', () => {
  test('createRun writes the run record under the DO id', async () => {
    const id = await service.createRun('wf', { foo: 1 }, false, 'hash1', {
      type: 'do',
      id: RUN_ID,
    } as any)
    assert.equal(id, RUN_ID)

    const run = await service.getRun(RUN_ID)
    assert.ok(run)
    assert.equal(run.workflow, 'wf')
    assert.equal(run.status, 'running')
    assert.deepEqual(run.input, { foo: 1 })
    assert.equal(run.inline, false)
    assert.equal(run.graphHash, 'hash1')
    assert.ok(run.createdAt instanceof Date)
  })

  test('createRun with a foreign id throws', async () => {
    await assert.rejects(
      service.createRun('wf', {}, false, 'h', {
        type: 'do',
        id: 'someone-else',
      } as any),
      /bound to runId/
    )
  })

  test('getRun returns null for cross-run id (no leak)', async () => {
    await service.createRun('wf', {}, true, 'h', {
      type: 'do',
      id: RUN_ID,
    } as any)
    const r = await service.getRun('foreign-id')
    assert.equal(r, null)
  })

  test('updateRunStatus persists status and output', async () => {
    await service.createRun('wf', {}, true, 'h', {
      type: 'do',
      id: RUN_ID,
    } as any)
    await service.updateRunStatus(RUN_ID, 'completed', { ok: true })
    const r = await service.getRun(RUN_ID)
    assert.equal(r!.status, 'completed')
    assert.deepEqual(r!.output, { ok: true })
  })

  test('updateRunStatus on foreign id throws', async () => {
    await assert.rejects(
      service.updateRunStatus('foreign', 'completed'),
      /Cross-run access denied/
    )
  })
})

describe('PikkuWorkflowDoService — step lifecycle', () => {
  beforeEach(async () => {
    await service.createRun('wf', {}, false, 'h', {
      type: 'do',
      id: RUN_ID,
    } as any)
  })

  test('insertStepState creates pending step + history + name index', async () => {
    const step = await service.insertStepState(RUN_ID, 'step1', 'rpc.fn', {
      x: 1,
    })
    assert.equal(step.status, 'pending')
    assert.equal(step.attemptCount, 1)
    assert.ok(step.stepId)

    // Index by name should resolve to same step
    const fetched = await service.getStepState(RUN_ID, 'step1')
    assert.equal(fetched.stepId, step.stepId)

    // History order should contain one entry
    const history = await service.getRunHistory(RUN_ID)
    assert.equal(history.length, 1)
    assert.equal(history[0]!.status, 'pending')
    assert.equal(history[0]!.stepName, 'step1')
  })

  test('setStepRunning / setStepResult / history reflect lifecycle', async () => {
    const step = await service.insertStepState(RUN_ID, 'step1', 'rpc.fn', {})
    await service.setStepRunning(step.stepId)
    await service.setStepResult(step.stepId, { value: 42 })

    const fetched = await service.getStepState(RUN_ID, 'step1')
    assert.equal(fetched.status, 'succeeded')
    assert.deepEqual(fetched.result, { value: 42 })

    const history = await service.getRunHistory(RUN_ID)
    assert.deepEqual(
      history.map((h) => h.status),
      ['pending', 'running', 'succeeded']
    )
  })

  test('setStepError writes serialized error', async () => {
    const step = await service.insertStepState(RUN_ID, 'step1', 'rpc.fn', {})
    const err = Object.assign(new Error('boom'), { code: 'EBOOM' })
    await service.setStepError(step.stepId, err)

    const fetched = await service.getStepState(RUN_ID, 'step1')
    assert.equal(fetched.status, 'failed')
    assert.equal(fetched.error?.message, 'boom')
    assert.equal(fetched.error?.code, 'EBOOM')
  })

  test('createRetryAttempt increments attemptCount and resets result/error', async () => {
    const step = await service.insertStepState(RUN_ID, 'step1', 'rpc.fn', {})
    await service.setStepError(step.stepId, new Error('x'))
    const retried = await service.createRetryAttempt(step.stepId, 'pending')
    assert.equal(retried.attemptCount, 2)
    assert.equal(retried.status, 'pending')
    assert.equal(retried.error, undefined)
  })
})

describe('PikkuWorkflowDoService — graph state', () => {
  beforeEach(async () => {
    await service.createRun('wf', {}, false, 'h', {
      type: 'do',
      id: RUN_ID,
    } as any)
  })

  test('getCompletedGraphState reflects succeeded/failed steps and branches', async () => {
    const a = await service.insertStepState(RUN_ID, 'A', 'rpc.A', {})
    await service.setStepResult(a.stepId, 1)
    await service.setBranchTaken(a.stepId, 'left')

    const b = await service.insertStepState(RUN_ID, 'B', 'rpc.B', {})
    await service.setStepError(b.stepId, new Error('b failed'))
    // Only one attempt, no retries → counted as terminal failure

    const c = await service.insertStepState(RUN_ID, 'C', 'rpc.C', {})
    await service.setStepRunning(c.stepId)

    const graph = await service.getCompletedGraphState(RUN_ID)
    assert.deepEqual(graph.completedNodeIds.sort(), ['A'])
    assert.deepEqual(graph.failedNodeIds.sort(), ['B'])
    assert.deepEqual(graph.branchKeys, { A: 'left' })
  })

  test('getNodesWithoutSteps filters already-inserted names', async () => {
    await service.insertStepState(RUN_ID, 'A', 'rpc.A', {})
    const missing = await service.getNodesWithoutSteps(RUN_ID, ['A', 'B', 'C'])
    assert.deepEqual(missing.sort(), ['B', 'C'])
  })

  test('getNodeResults returns only succeeded steps', async () => {
    const a = await service.insertStepState(RUN_ID, 'A', 'rpc.A', {})
    await service.setStepResult(a.stepId, 'done')
    const b = await service.insertStepState(RUN_ID, 'B', 'rpc.B', {})
    await service.setStepRunning(b.stepId)

    const results = await service.getNodeResults(RUN_ID, ['A', 'B', 'C'])
    assert.deepEqual(results, { A: 'done' })
  })

  test('updateRunState / getRunState merge keys', async () => {
    await service.updateRunState(RUN_ID, 'counter', 1)
    await service.updateRunState(RUN_ID, 'flag', true)
    const state = await service.getRunState(RUN_ID)
    assert.deepEqual(state, { counter: 1, flag: true })
  })
})

describe('PikkuWorkflowDoService — transport hooks', () => {
  beforeEach(async () => {
    await service.createRun('wf', {}, false, 'h', {
      type: 'do',
      id: RUN_ID,
    } as any)
  })

  test('dispatchStep calls per-rpc step stub with dispatch payload', async () => {
    const ok = await (service as any).dispatchStep(
      RUN_ID,
      'stepX',
      'rpc.x',
      { foo: 'bar' },
      { retries: 2 }
    )
    assert.equal(ok, true)
    assert.equal(dispatched.length, 1)
    assert.deepEqual(dispatched[0], {
      runId: RUN_ID,
      stepName: 'stepX',
      rpcName: 'rpc.x',
      data: { foo: 'bar' },
      retries: 2,
      retryDelay: undefined,
    })
  })

  test('dispatchStep returns false for inline runs (does not call worker)', async () => {
    ;(service as any).inlineRuns.add(RUN_ID)
    const ok = await (service as any).dispatchStep(RUN_ID, 's', 'r', {})
    assert.equal(ok, false)
    assert.equal(dispatched.length, 0)
  })

  test('dispatchStep returns false when per-rpc binding is missing', async () => {
    const noWorker = new TestService(storage as any, {}, RUN_ID)
    const ok = await (noWorker as any).dispatchStep(RUN_ID, 's', 'r', {})
    assert.equal(ok, false)
  })

  test('scheduleSleep sets alarm and pending alarm reason', async () => {
    const ok = await (service as any).scheduleSleep(RUN_ID, 'step-id-1', 5_000)
    assert.equal(ok, true)
    assert.ok(storage.alarmAt)
    assert.ok(storage.alarmAt! > Date.now())

    const pending = await service.consumePendingAlarm()
    assert.deepEqual(pending, { kind: 'sleep', stepId: 'step-id-1' })

    // consume should clear
    const second = await service.consumePendingAlarm()
    assert.equal(second, null)
  })

  test('scheduleSleep accepts duration strings', async () => {
    const before = Date.now()
    await (service as any).scheduleSleep(RUN_ID, 'sid', '2s')
    assert.ok(storage.alarmAt! >= before + 2_000)
  })

  test('resumeWorkflow sets orchestrator-retry alarm', async () => {
    await service.resumeWorkflow(RUN_ID)
    const pending = (await storage.get('alarm:next')) as DoPendingAlarm
    assert.deepEqual(pending, { kind: 'orchestrator-retry' })
    assert.ok(storage.alarmAt)
  })

  test('scheduleOrchestratorRetry honours retryDelay', async () => {
    const before = Date.now()
    await (service as any).scheduleOrchestratorRetry(RUN_ID, '500ms')
    assert.ok(storage.alarmAt! >= before + 500)
    const pending = await storage.get('alarm:next')
    assert.deepEqual(pending, { kind: 'orchestrator-retry' })
  })

  test('queueStepWorker dispatches via per-rpc binding', async () => {
    await service.queueStepWorker(RUN_ID, 's', 'rpc.s', { d: 1 })
    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0]!.stepName, 's')
  })

  test('queueStepWorker without binding throws', async () => {
    const noWorker = new TestService(storage as any, {}, RUN_ID)
    await assert.rejects(
      noWorker.queueStepWorker(RUN_ID, 's', 'r', {}),
      /No step worker binding for rpcName=r/
    )
  })

  test('setRetentionAlarm records retention reason', async () => {
    await service.setRetentionAlarm(60_000)
    const pending = (await storage.get('alarm:next')) as DoPendingAlarm
    assert.deepEqual(pending, { kind: 'retention' })
  })
})

describe('PikkuWorkflowDoService — workflow versions', () => {
  test('upsert + get round-trips per-run', async () => {
    await service.upsertWorkflowVersion(
      'wf-name',
      'hash1',
      { nodes: [] },
      'graph',
      'active'
    )
    const v = await service.getWorkflowVersion('wf-name', 'hash1')
    assert.deepEqual(v, { graph: { nodes: [] }, source: 'graph' })
  })

  test('updateWorkflowVersionStatus mutates stored status', async () => {
    await service.upsertWorkflowVersion('wf', 'h', {}, 'graph', 'active')
    await service.updateWorkflowVersionStatus('wf', 'h', 'archived')
    const stored = (await storage.get('version:wf:h')) as any
    assert.equal(stored.status, 'archived')
  })

  test('getAIGeneratedWorkflows returns empty (v0.1 stub)', async () => {
    const res = await service.getAIGeneratedWorkflows()
    assert.deepEqual(res, [])
  })
})

describe('PikkuWorkflowDoService — locks', () => {
  test('withRunLock is a no-op pass-through', async () => {
    const out = await service.withRunLock('whatever', async () => 42)
    assert.equal(out, 42)
  })

  test('withStepLock is a no-op pass-through', async () => {
    const out = await service.withStepLock('a', 'b', async () => 'x')
    assert.equal(out, 'x')
  })
})

describe('PikkuWorkflowDoService — mirror', () => {
  test('mirror.createRun is invoked after impl with the run id', async () => {
    const calls: any[] = []
    const mirror = {
      createRun: async (runId: string, workflowName: string) => {
        calls.push({ method: 'createRun', runId, workflowName })
      },
      updateRunStatus: async () => {},
      insertStepState: async () => {},
      setStepRunning: async () => {},
      setStepScheduled: async () => {},
      setStepResult: async () => {},
      setStepChildRunId: async () => {},
      setStepError: async () => {},
      createRetryAttempt: async () => {},
      setBranchTaken: async () => {},
      updateRunState: async () => {},
      upsertWorkflowVersion: async () => {},
      updateWorkflowVersionStatus: async () => {},
    }
    const svc = new TestService(storage as any, env, RUN_ID, { mirror })
    await svc.createRun('wf', {}, false, 'h', { type: 'do', id: RUN_ID } as any)
    assert.deepEqual(calls, [
      { method: 'createRun', runId: RUN_ID, workflowName: 'wf' },
    ])
  })

  test('mirror failures are swallowed and do not break the executor', async () => {
    const mirror = {
      createRun: async () => {
        throw new Error('mirror down')
      },
      updateRunStatus: async () => {},
      insertStepState: async () => {},
      setStepRunning: async () => {},
      setStepScheduled: async () => {},
      setStepResult: async () => {},
      setStepChildRunId: async () => {},
      setStepError: async () => {},
      createRetryAttempt: async () => {},
      setBranchTaken: async () => {},
      updateRunState: async () => {},
      upsertWorkflowVersion: async () => {},
      updateWorkflowVersionStatus: async () => {},
    }
    const svc = new TestService(storage as any, env, RUN_ID, { mirror })
    const id = await svc.createRun('wf', {}, false, 'h', {
      type: 'do',
      id: RUN_ID,
    } as any)
    assert.equal(id, RUN_ID)
    const run = await svc.getRun(RUN_ID)
    assert.equal(run?.workflow, 'wf')
  })
})
