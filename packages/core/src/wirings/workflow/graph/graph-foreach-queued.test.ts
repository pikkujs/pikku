/**
 * forEach fan-out over the durable (queued) path.
 *
 * `graph-foreach.test.ts` drives the inline runner, which plans and executes in
 * one process. Production runs instead go out to a queue: entry nodes are
 * queued by `runWorkflowGraph`, each step comes back through
 * `executeWorkflowStep` (which has to map `node[i]` back to `node` before it
 * can find the RPC), and every completion re-enters `continueGraph` through the
 * orchestrator. These tests exercise that loop.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../../services/in-memory-workflow-service.js'
import { runWorkflowGraph } from './graph-runner.js'
import { pikkuState } from '../../../pikku-state.js'

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

interface QueuedJob {
  queueName: string
  data: any
}

type RpcImpl = (rpcName: string, data: any) => Promise<any>

interface Harness {
  ws: InMemoryWorkflowService
  rpc: any
  jobs: QueuedJob[]
  onEnqueue: (fn: (job: QueuedJob) => void | Promise<void>) => void
  drain: (max?: number) => Promise<void>
}

const isOrchestratorJob = (queueName: string) =>
  queueName.includes('orchestrator')

function harness(rpcImpl: RpcImpl): Harness {
  const jobs: QueuedJob[] = []
  let enqueueHook: ((job: QueuedJob) => void | Promise<void>) | undefined

  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
    queueService: {
      add: async (queueName: string, data: any) => {
        const job = { queueName, data }
        jobs.push(job)
        await enqueueHook?.(job)
        return 'job-1'
      },
    },
  } as any)

  const ws = new InMemoryWorkflowService()
  const rpc = { rpcWithWire: rpcImpl } as any

  const drain = async (max = 200) => {
    let processed = 0
    while (jobs.length) {
      if (++processed > max) {
        throw new Error('the queue never settled — the fan-out is looping')
      }
      const job = jobs.shift()!
      if (isOrchestratorJob(job.queueName)) {
        await ws.orchestrateWorkflow(job.data.runId, rpc)
      } else {
        await ws.executeWorkflowStep(
          job.data.runId,
          job.data.stepName,
          job.data.rpcName,
          job.data.data,
          rpc
        )
      }
    }
  }

  return {
    ws,
    rpc,
    jobs,
    onEnqueue: (fn) => {
      enqueueHook = fn
    },
    drain,
  }
}

function seedMeta(name: string, nodes: Record<string, any>, entry: string[]) {
  const metaState = pikkuState(null, 'workflows', 'meta')
  metaState[name] = {
    name,
    pikkuFuncId: name,
    source: 'graph',
    entryNodeIds: entry,
    graphHash: `${name}-hash`,
    nodes,
  }
  return () => {
    delete metaState[name]
  }
}

const stepNames = async (ws: InMemoryWorkflowService, runId: string) =>
  (await ws.getStepInstances(runId)).map((i) => i.stepName).sort()

describe('graph forEach fanout — durable queued path', () => {
  test('every item gets its own queued step, and each one resolves $item', async () => {
    const seen: any[] = []
    const h = harness(async (rpcName, data) => {
      if (rpcName === 'listRows')
        return { rows: [{ n: 1 }, { n: 2 }, { n: 3 }] }
      if (rpcName === 'handleRow') {
        seen.push(data)
        return { doubled: data.value * 2 }
      }
      return {}
    })
    const cleanup = seedMeta(
      'queuedFanout',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list', path: 'rows' },
          input: { value: { $ref: '$item', path: 'n' } },
        },
      },
      ['list']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedFanout',
      {},
      h.rpc,
      false
    )
    await h.drain()

    assert.equal((await h.ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(await stepNames(h.ws, runId), [
      'handle[0]',
      'handle[1]',
      'handle[2]',
      'list',
    ])
    assert.deepEqual(
      seen.map((d) => d.value).sort(),
      [1, 2, 3],
      `each queued instance should carry its own item, got ${JSON.stringify(seen)}`
    )

    cleanup()
  })

  test('a parallel fanout queues every item in one orchestrator pass', async () => {
    const h = harness(async (rpcName) => {
      if (rpcName === 'listRows') return [1, 2, 3]
      return { ok: true }
    })
    const cleanup = seedMeta(
      'queuedFanoutBurst',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
        },
      },
      ['list']
    )

    await runWorkflowGraph(h.ws, 'queuedFanoutBurst', {}, h.rpc, false)

    // list, then the orchestrator pass that fans handle out.
    while (h.jobs.length) {
      const job = h.jobs.shift()!
      if (isOrchestratorJob(job.queueName)) {
        await h.ws.orchestrateWorkflow(job.data.runId, h.rpc)
        break
      }
      await h.ws.executeWorkflowStep(
        job.data.runId,
        job.data.stepName,
        job.data.rpcName,
        job.data.data,
        h.rpc
      )
    }

    const queuedSteps = h.jobs
      .filter((j) => !isOrchestratorJob(j.queueName))
      .map((j) => j.data.stepName)
    assert.deepEqual(
      queuedSteps,
      ['handle[0]', 'handle[1]', 'handle[2]'],
      'a parallel fanout should have all of its items in flight at once'
    )

    cleanup()
  })

  test("mode: 'sequential' never has two items queued at once", async () => {
    const executed: string[] = []
    const h = harness(async (rpcName, data) => {
      if (rpcName === 'listRows') return ['a', 'b', 'c']
      executed.push(data.value)
      return { value: data.value }
    })
    const cleanup = seedMeta(
      'queuedFanoutSequential',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          mode: 'sequential',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
        },
      },
      ['list']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedFanoutSequential',
      {},
      h.rpc,
      false
    )

    h.onEnqueue(async (job) => {
      if (isOrchestratorJob(job.queueName)) return
      if (!job.data.stepName.startsWith('handle[')) return
      const unfinished = (await h.ws.getStepInstances(job.data.runId)).filter(
        (i) =>
          i.stepName.startsWith('handle[') &&
          i.stepName !== job.data.stepName &&
          i.status !== 'succeeded'
      )
      assert.deepEqual(
        unfinished.map((i) => i.stepName),
        [],
        `${job.data.stepName} was queued while earlier items were still unfinished`
      )
    })

    await h.drain()

    assert.equal((await h.ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(
      executed,
      ['a', 'b', 'c'],
      'sequential items should run in source order'
    )

    cleanup()
  })

  test('a downstream node fires once, after every item, with the ordered results', async () => {
    const downstreamCalls: any[] = []
    const h = harness(async (rpcName, data) => {
      if (rpcName === 'listRows') return [1, 2, 3]
      if (rpcName === 'handleRow') return { squared: data.value * data.value }
      if (rpcName === 'summarise') {
        downstreamCalls.push(data)
        return { ok: true }
      }
      return {}
    })
    const cleanup = seedMeta(
      'queuedFanoutAggregate',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
          next: 'summary',
        },
        summary: {
          nodeId: 'summary',
          rpcName: 'summarise',
          input: { results: { $ref: 'handle' } },
        },
      },
      ['list']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedFanoutAggregate',
      {},
      h.rpc,
      false
    )
    await h.drain()

    assert.equal((await h.ws.getRun(runId))?.status, 'completed')
    assert.equal(
      downstreamCalls.length,
      1,
      `the downstream node should run once, not once per item (ran ${downstreamCalls.length}x)`
    )
    assert.deepEqual(downstreamCalls[0], {
      results: [{ squared: 1 }, { squared: 4 }, { squared: 9 }],
    })

    cleanup()
  })

  test('a downstream node stays put while sibling items are still in flight', async () => {
    // The orchestrator job for item 0 lands while items 1 and 2 are still
    // sitting on the step queue — only a completion count that ignores the
    // unfinished siblings would release the downstream node here.
    const downstreamCalls: any[] = []
    const h = harness(async (rpcName, data) => {
      if (rpcName === 'listRows') return [1, 2, 3]
      if (rpcName === 'handleRow') return { squared: data.value * data.value }
      if (rpcName === 'summarise') {
        downstreamCalls.push(data)
        return { ok: true }
      }
      return {}
    })
    const cleanup = seedMeta(
      'queuedFanoutEagerOrchestrator',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
          next: 'summary',
        },
        summary: {
          nodeId: 'summary',
          rpcName: 'summarise',
          input: { results: { $ref: 'handle' } },
        },
      },
      ['list']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedFanoutEagerOrchestrator',
      {},
      h.rpc,
      false
    )

    // An orchestrator job runs as soon as it exists, rather than behind the
    // items its siblings are still waiting on.
    let processed = 0
    while (h.jobs.length) {
      if (++processed > 200) throw new Error('the queue never settled')
      const index = h.jobs.findIndex((j) => isOrchestratorJob(j.queueName))
      const job = h.jobs.splice(index === -1 ? 0 : index, 1)[0]!
      if (isOrchestratorJob(job.queueName)) {
        const unfinishedItems = (await h.ws.getStepInstances(runId)).filter(
          (i) => i.stepName.startsWith('handle[') && i.status !== 'succeeded'
        )
        await h.ws.orchestrateWorkflow(job.data.runId, h.rpc)
        if (unfinishedItems.length > 0) {
          assert.deepEqual(
            downstreamCalls,
            [],
            `the downstream node ran while ${unfinishedItems.length} item(s) were unfinished`
          )
        }
      } else {
        await h.ws.executeWorkflowStep(
          job.data.runId,
          job.data.stepName,
          job.data.rpcName,
          job.data.data,
          h.rpc
        )
      }
    }

    assert.equal((await h.ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(downstreamCalls, [
      { results: [{ squared: 1 }, { squared: 4 }, { squared: 9 }] },
    ])

    cleanup()
  })

  test('an entry node fans out over the trigger input', async () => {
    const seen: any[] = []
    const h = harness(async (_rpcName, data) => {
      seen.push(data)
      return { ok: true }
    })
    const cleanup = seedMeta(
      'queuedEntryFanout',
      {
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'trigger', path: 'ids' },
          input: { id: { $ref: '$item' } },
        },
      },
      ['handle']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedEntryFanout',
      { ids: ['x', 'y'] },
      h.rpc,
      false
    )
    await h.drain()

    assert.equal((await h.ws.getRun(runId))?.status, 'completed')
    assert.deepEqual(await stepNames(h.ws, runId), ['handle[0]', 'handle[1]'])
    assert.deepEqual(seen.map((d) => d.id).sort(), ['x', 'y'])

    cleanup()
  })

  test('a sequential entry fanout still runs every item', async () => {
    const executed: string[] = []
    const h = harness(async (_rpcName, data) => {
      executed.push(data.id)
      return { ok: true }
    })
    const cleanup = seedMeta(
      'queuedEntryFanoutSequential',
      {
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          mode: 'sequential',
          forEach: { $ref: 'trigger', path: 'ids' },
          input: { id: { $ref: '$item' } },
        },
      },
      ['handle']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedEntryFanoutSequential',
      { ids: ['x', 'y', 'z'] },
      h.rpc,
      false
    )
    await h.drain()

    assert.equal(
      (await h.ws.getRun(runId))?.status,
      'completed',
      'an entry fanout that starts one item at a time must still reach the rest'
    )
    assert.deepEqual(executed, ['x', 'y', 'z'])

    cleanup()
  })

  test('a failing item fails the run instead of stalling it', async () => {
    const h = harness(async (rpcName, data) => {
      if (rpcName === 'listRows') return [1, 2, 3]
      if (data.value === 2) throw new Error('item 2 exploded')
      return { ok: true }
    })
    const cleanup = seedMeta(
      'queuedFanoutFailure',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list' },
          retries: 0,
          input: { value: { $ref: '$item' } },
          next: 'summary',
        },
        summary: { nodeId: 'summary', rpcName: 'summarise' },
      },
      ['list']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedFanoutFailure',
      {},
      h.rpc,
      false
    )
    await h.drain().catch(() => {})

    const run = await h.ws.getRun(runId)
    assert.notEqual(
      run?.status,
      'completed',
      'a run with a failed item must never report success'
    )
    const instances = await h.ws.getStepInstances(runId)
    assert.equal(
      instances.some((i) => i.stepName === 'summary'),
      false,
      'the downstream node must not run when an item failed'
    )

    cleanup()
  })

  test('re-orchestrating a settled fanout does not re-queue its items', async () => {
    const calls: any[] = []
    const h = harness(async (rpcName, data) => {
      if (rpcName === 'listRows') return [1, 2]
      calls.push(data)
      return { ok: true }
    })
    const cleanup = seedMeta(
      'queuedFanoutIdempotent',
      {
        list: { nodeId: 'list', rpcName: 'listRows', next: 'handle' },
        handle: {
          nodeId: 'handle',
          rpcName: 'handleRow',
          forEach: { $ref: 'list' },
          input: { value: { $ref: '$item' } },
        },
      },
      ['list']
    )

    const { runId } = await runWorkflowGraph(
      h.ws,
      'queuedFanoutIdempotent',
      {},
      h.rpc,
      false
    )
    await h.drain()
    assert.equal(calls.length, 2)

    // A duplicated orchestrator job — queues redeliver.
    await h.ws.orchestrateWorkflow(runId, h.rpc)
    await h.drain()

    assert.equal(
      calls.length,
      2,
      `a redelivered orchestrator job re-ran the fanout (${calls.length} calls)`
    )
    assert.deepEqual(await stepNames(h.ws, runId), [
      'handle[0]',
      'handle[1]',
      'list',
    ])

    cleanup()
  })
})
