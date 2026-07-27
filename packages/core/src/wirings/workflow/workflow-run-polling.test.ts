import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import type { WorkflowRun } from './workflow.types.js'

/**
 * A workflow service whose run reads are counted and timestamped, and whose
 * run finishes only once it has been read `endAfter` times.
 */
class PollProbe extends InMemoryWorkflowService {
  readonly reads: number[] = []
  /** Every wait the loop asked for, in order — the schedule, not the clock. */
  readonly waits: number[] = []
  endAfter = 1

  override async waitBeforeNextRead(ms: number): Promise<void> {
    this.waits.push(ms)
  }

  override async startWorkflow(): Promise<{ runId: string }> {
    return { runId: 'run-1' }
  }

  override async getRun(_runId: string): Promise<WorkflowRun | null> {
    this.reads.push(Date.now())
    const done = this.reads.length >= this.endAfter
    return {
      id: 'run-1',
      status: done ? 'completed' : 'running',
      output: 'result',
    } as WorkflowRun
  }
}

const probe = () => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  } as any)
  return new PollProbe()
}

describe('waiting for a run to finish', () => {
  test('a run that finishes quickly is not held for a whole poll interval', async () => {
    const ws = probe()
    ws.endAfter = 2

    const output = await ws.runToCompletion('flow', {}, {} as any)

    assert.equal(output, 'result')
    assert.equal(ws.waits.length, 1)
    assert.ok(
      ws.waits[0]! < 1000,
      `a run done after one poll waited the full ${ws.waits[0]}ms default — a fixed interval makes every fast workflow pay for it`
    )
  })

  test('reads spread out as a run keeps running', async () => {
    const ws = probe()
    ws.endAfter = 8

    await ws.runToCompletion('flow', {}, {} as any)

    assert.ok(ws.waits.length >= 6)
    assert.ok(
      ws.waits.at(-1)! > ws.waits[0]! * 2,
      `waits stayed flat (${ws.waits.join('ms, ')}ms) — a run that drags on keeps costing the same read rate forever`
    )
    for (let i = 1; i < ws.waits.length; i++) {
      assert.ok(
        ws.waits[i]! >= ws.waits[i - 1]!,
        `wait ${i} shrank (${ws.waits.join('ms, ')}ms)`
      )
    }
  })

  test('the wait never grows past the configured interval', async () => {
    const ws = probe()
    ws.endAfter = 12

    await ws.runToCompletion('flow', {}, {} as any, { pollIntervalMs: 40 })

    for (const wait of ws.waits) {
      assert.ok(wait <= 40, `a wait of ${wait}ms overshot the 40ms ceiling`)
    }
    assert.equal(
      ws.waits.at(-1),
      40,
      `the ceiling was never reached (${ws.waits.join('ms, ')}ms)`
    )
  })

  test('a run that is already finished is returned without any wait', async () => {
    const ws = probe()
    ws.endAfter = 1

    await ws.runToCompletion('flow', {}, {} as any)

    assert.equal(ws.reads.length, 1)
    assert.deepEqual(ws.waits, [])
  })
})

describe('a run that ends badly', () => {
  test('a failed run surfaces its error message', async () => {
    const ws = probe()
    ws.getRun = async () =>
      ({
        id: 'run-1',
        status: 'failed',
        error: { message: 'step blew up' },
      }) as WorkflowRun

    await assert.rejects(ws.runToCompletion('flow', {}, {} as any), /blew up/)
  })

  test('a cancelled run rejects', async () => {
    const ws = probe()
    ws.getRun = async () =>
      ({ id: 'run-1', status: 'cancelled' }) as WorkflowRun

    await assert.rejects(ws.runToCompletion('flow', {}, {} as any))
  })

  test('a run that disappears rejects rather than polling forever', async () => {
    const ws = probe()
    ws.getRun = async () => null

    await assert.rejects(ws.runToCompletion('flow', {}, {} as any), /run-1/)
  })
})
