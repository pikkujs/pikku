import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import type { WorkflowRunMirror } from './workflow.types.js'

const MIRROR_METHODS = [
  'createRun',
  'updateRunStatus',
  'insertStepState',
  'setStepRunning',
  'setStepScheduled',
  'setStepResult',
  'setStepChildRunId',
  'setStepError',
  'createRetryAttempt',
  'setBranchTaken',
  'updateRunState',
  'upsertWorkflowVersion',
  'updateWorkflowVersionStatus',
] as const

type Call = { method: string; args: any[] }

const recordingMirror = (
  onCall?: (method: string) => void
): { mirror: WorkflowRunMirror; calls: Call[] } => {
  const calls: Call[] = []
  const mirror = {} as any
  for (const method of MIRROR_METHODS) {
    mirror[method] = async (...args: any[]) => {
      calls.push({ method, args })
      onCall?.(method)
    }
  }
  return { mirror, calls }
}

const service = (mirror?: WorkflowRunMirror) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  } as any)
  const ws = new InMemoryWorkflowService() as any
  ws.mirror = mirror
  return ws
}

const driveEveryWrite = async (ws: any) => {
  const runId = await ws.createRun('flow', { a: 1 }, false, 'hash', {
    type: 'test',
  })
  const step = await ws.insertStepState(runId, 'step-1', 'rpc.fn', { x: 1 })
  await ws.setStepRunning(step.stepId)
  await ws.setStepScheduled(step.stepId)
  await ws.setStepResult(step.stepId, 'ok')
  await ws.setStepChildRunId(step.stepId, 'child-1')
  await ws.setStepError(step.stepId, new Error('boom'))
  await ws.createRetryAttempt(step.stepId, 'pending')
  await ws.setBranchTaken(step.stepId, 'left')
  await ws.updateRunState(runId, 'total', 42)
  await ws.upsertWorkflowVersion('flow', 'hash', { nodes: {} }, 'code')
  await ws.updateWorkflowVersionStatus('flow', 'hash', 'archived')
  await ws.updateRunStatus(runId, 'completed', 'output')
  return { runId, step }
}

describe('mirroring workflow state', () => {
  test('every mirror method is wired to the write it shadows', async () => {
    const { mirror, calls } = recordingMirror()
    await driveEveryWrite(service(mirror))

    assert.deepEqual(
      [...new Set(calls.map((c) => c.method))].sort(),
      [...MIRROR_METHODS].sort()
    )
  })

  test('a mirror write carries the same identifiers as the write it shadows', async () => {
    const { mirror, calls } = recordingMirror()
    const ws = service(mirror)
    const { runId, step } = await driveEveryWrite(ws)

    const call = (method: string) => calls.find((c) => c.method === method)!
    assert.equal(call('createRun').args[0], runId)
    assert.equal(call('createRun').args[1], 'flow')
    assert.equal(call('insertStepState').args[0], runId)
    assert.equal(call('insertStepState').args[1].stepId, step.stepId)
    assert.equal(call('insertStepState').args[1].stepName, 'step-1')
    assert.equal(call('insertStepState').args[1].rpcName, 'rpc.fn')
    assert.equal(call('setStepResult').args[1], 'ok')
    assert.equal(call('setStepChildRunId').args[1], 'child-1')
    assert.equal(call('setBranchTaken').args[1], 'left')
    assert.equal(call('updateRunState').args[2], 42)
    assert.equal(call('updateRunStatus').args[1], 'completed')
  })

  test('a step error reaches the mirror serialised, not as a live Error', async () => {
    const { mirror, calls } = recordingMirror()
    await driveEveryWrite(service(mirror))

    const serialised = calls.find((c) => c.method === 'setStepError')!.args[1]
    assert.equal(serialised instanceof Error, false)
    assert.equal(serialised.message, 'boom')
    assert.equal(typeof serialised.stack, 'string')
    assert.equal(typeof serialised.expected, 'boolean')
  })

  test('the mirror only ever sees a write that already landed', async () => {
    const seen: Array<string | undefined> = []
    const { mirror } = recordingMirror()
    const ws = service(mirror)
    ;(mirror as any).updateRunStatus = async () => {
      seen.push((await ws.getRun(runIdRef.id))?.status)
    }
    const runIdRef = { id: '' }

    runIdRef.id = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })
    await ws.updateRunStatus(runIdRef.id, 'completed', 'output')

    assert.deepEqual(
      seen,
      ['completed'],
      'the mirror ran before the write it was mirroring'
    )
  })

  test('a write that fails is not mirrored', async () => {
    const { mirror, calls } = recordingMirror()
    const ws = service(mirror)
    ws.updateRunStatusImpl = async () => {
      throw new Error('database down')
    }
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'test',
    })

    await assert.rejects(
      ws.updateRunStatus(runId, 'completed'),
      /database down/
    )
    assert.equal(
      calls.some((c) => c.method === 'updateRunStatus'),
      false,
      'a status the store rejected was reported to the mirror as if it had happened'
    )
  })
})

describe('a mirror that is broken', () => {
  test('no write fails because the mirror did', async () => {
    const { mirror } = recordingMirror((method) => {
      throw new Error(`mirror down on ${method}`)
    })
    const ws = service(mirror)

    const { runId } = await driveEveryWrite(ws)

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.equal((await ws.getRun(runId))?.output, 'output')
    assert.deepEqual(await ws.getRunState(runId), { total: 42 })
  })

  test('no mirror configured is not an error path', async () => {
    const ws = service(undefined)
    const { runId } = await driveEveryWrite(ws)
    assert.equal((await ws.getRun(runId))?.status, 'completed')
  })
})
