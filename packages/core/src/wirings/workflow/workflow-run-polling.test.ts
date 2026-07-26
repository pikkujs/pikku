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
  endAfter = 1

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

  gaps(): number[] {
    return this.reads.slice(1).map((t, i) => t - this.reads[i]!)
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
    const started = Date.now()

    const output = await ws.runToCompletion('flow', {}, {} as any)

    assert.equal(output, 'result')
    const elapsed = Date.now() - started
    assert.ok(
      elapsed < 200,
      `a run that was done after one poll took ${elapsed}ms — a fixed interval makes every fast workflow pay the full wait`
    )
  })

  test('reads spread out as a run keeps running', async () => {
    const ws = probe()
    ws.endAfter = 8

    await ws.runToCompletion('flow', {}, {} as any)

    const gaps = ws.gaps()
    assert.ok(gaps.length >= 6)
    assert.ok(
      gaps.at(-1)! > gaps[0]! * 2,
      `waits stayed flat (${gaps.join('ms, ')}ms) — a run that drags on keeps costing the same read rate forever`
    )
  })

  test('the wait never grows past the configured interval', async () => {
    const ws = probe()
    ws.endAfter = 12

    await ws.runToCompletion('flow', {}, {} as any, { pollIntervalMs: 40 })

    for (const gap of ws.gaps()) {
      assert.ok(gap < 80, `a wait of ${gap}ms overshot the 40ms ceiling`)
    }
    assert.ok(
      ws.gaps().some((gap) => gap >= 35),
      'never reached the ceiling'
    )
  })

  test('a run that is already finished is returned without any wait', async () => {
    const ws = probe()
    ws.endAfter = 1
    const started = Date.now()

    await ws.runToCompletion('flow', {}, {} as any)

    assert.equal(ws.reads.length, 1)
    assert.ok(Date.now() - started < 50)
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
