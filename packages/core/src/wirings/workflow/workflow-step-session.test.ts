import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'

// A queued workflow step is executed with the bare job wire (payload is just
// { runId }), so its wire has no `pikkuUserId`. Without threading it from the
// persisted run wire, an authed step (`pikkuFunc`) sees no session and throws
// "Authentication required". These tests pin that `invokeStepRpc` merges the
// run wire's `pikkuUserId` into the step wire override so the session rehydrates.

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

// rpcService stand-in whose only job is to capture the wire override it's handed.
function capturingRpcService(): {
  service: { rpcWithWire: (n: string, d: any, w: any) => Promise<any> }
  wire: () => any
} {
  let captured: any
  return {
    service: {
      rpcWithWire: async (_rpcName: string, _data: any, wire: any) => {
        captured = wire
        return { ok: true }
      },
    },
    wire: () => captured,
  }
}

describe('queued workflow steps carry the run wire pikkuUserId', () => {
  test('invokeStepRpc merges run.wire.pikkuUserId into the step wire override', async () => {
    pikkuState(null, 'package', 'singletonServices', { logger: silentLogger } as any)

    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'queue',
      pikkuUserId: 'user-abc',
    })
    await ws.insertStepState(runId, 'deploy', 'deployByStageKind', {})
    const stepState = await ws.getStepState(runId, 'deploy')

    const rpc = capturingRpcService()
    await (ws as any).invokeStepRpc(
      runId,
      'deploy',
      stepState,
      'deployByStageKind',
      {},
      rpc.service
    )

    assert.equal(
      rpc.wire().pikkuUserId,
      'user-abc',
      'the step wire override carries the run wire pikkuUserId so authed steps rehydrate'
    )
    assert.ok(rpc.wire().workflowStep, 'workflowStep provenance is still present')
  })

  test('no pikkuUserId key is injected when the run wire has none', async () => {
    pikkuState(null, 'package', 'singletonServices', { logger: silentLogger } as any)

    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', { type: 'test' })
    await ws.insertStepState(runId, 'noauth', 'someFn', {})
    const stepState = await ws.getStepState(runId, 'noauth')

    const rpc = capturingRpcService()
    await (ws as any).invokeStepRpc(runId, 'noauth', stepState, 'someFn', {}, rpc.service)

    assert.ok(
      !('pikkuUserId' in rpc.wire()),
      'no undefined pikkuUserId is added when the run wire lacks one'
    )
  })
})
