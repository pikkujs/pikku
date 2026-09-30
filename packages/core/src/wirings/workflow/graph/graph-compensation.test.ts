import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { runWorkflowGraph } from './graph-runner.js'
import type { CompensatingFor } from '../dsl/workflow-dsl.types.js'

type Handler = {
  forward: (data: any, wire: any) => Promise<any> | any
  compensate?: (data: any, context: CompensatingFor) => Promise<void> | void
}

let handlers: Record<string, Handler>
let log: string[]
let recovering: Array<{ rpc: string; from: any }>
let contexts: Array<{ rpc: string; context: CompensatingFor | undefined }>

const register = (name: string, handler: Handler) => {
  handlers[name] = handler
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    sessionless: true,
    permissions: [],
    ...(handler.compensate ? { compensate: true } : {}),
  } as any
}

const rpc = {
  rpcWithWire: async (rpcName: string, data: any, wire: any) => {
    const isCompensation = rpcName.endsWith(':compensate')
    const base = isCompensation
      ? rpcName.slice(0, -':compensate'.length)
      : rpcName
    const handler = handlers[base]!
    contexts.push({ rpc: rpcName, context: wire.workflow?.compensatingFor })
    if (isCompensation) {
      log.push(`undo:${base}`)
      return handler.compensate!(data, wire.workflow.compensatingFor)
    }
    log.push(`do:${base}`)
    if (wire.graph?.recoveringFrom) {
      recovering.push({ rpc: base, from: wire.graph.recoveringFrom })
    }
    return handler.forward(data, wire)
  },
}

const defineGraph = (
  name: string,
  entry: string,
  nodes: Record<string, any>
) => {
  pikkuState(null, 'workflows', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    source: 'graph',
    entryNodeIds: [entry],
    graphHash: `${name}-hash`,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, node]) => [
        id,
        { nodeId: id, rpcName: id, retries: 0, ...node },
      ])
    ),
  } as any
}

const run = async (name: string) => {
  const ws = new InMemoryWorkflowService()
  const { runId } = await runWorkflowGraph(ws, name, {}, rpc, true)
  return {
    ws,
    runId,
    run: (await ws.getRun(runId))!,
    steps: await ws.getRunSteps(runId),
  }
}

const ok = (output: any = {}) => ({ forward: async () => output })
const boom = (message = 'boom'): Handler => ({
  forward: async () => {
    throw new Error(message)
  },
})
const undoable = (output: any = {}): Handler => ({
  ...ok(output),
  compensate: async () => {},
})
const undone = () => log.filter((l) => l.startsWith('undo'))

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  } as any)
  handlers = {}
  log = []
  recovering = []
  contexts = []
})

describe('graph saga compensation', () => {
  test('a failing node unwinds the nodes that completed before it, newest first', async () => {
    register('a', undoable())
    register('b', undoable())
    register('c', boom())
    defineGraph('chain', 'a', {
      a: { next: 'b' },
      b: { next: 'c' },
      c: {},
    })

    const { run: record } = await run('chain')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(undone(), ['undo:b', 'undo:a'])
  })

  test('the failed node compensates itself first with ok:false', async () => {
    register('a', undoable())
    register('b', {
      ...boom('card declined'),
      compensate: async () => {},
    })
    defineGraph('selfFirst', 'a', { a: { next: 'b' }, b: {} })

    await run('selfFirst')

    assert.deepEqual(undone(), ['undo:b', 'undo:a'])
    const self = contexts.find((c) => c.rpc === 'b:compensate')!
    assert.equal(self.context!.ok, false)
    assert.equal(
      (self.context as Extract<CompensatingFor, { ok: false }>).error.message,
      'card declined'
    )
  })

  test('a succeeded node compensates with ok:true and its output', async () => {
    register('a', undoable({ id: 'x1' }))
    register('b', boom())
    defineGraph('okContext', 'a', { a: { next: 'b' }, b: {} })

    await run('okContext')

    const ctx = contexts.find((c) => c.rpc === 'a:compensate')!
    assert.deepEqual(ctx.context, {
      ok: true,
      output: { id: 'x1' },
      stepName: 'a',
    })
  })

  test('{ compensate: false } on a node leaves it out of the unwind', async () => {
    register('a', undoable())
    register('b', undoable())
    register('c', boom())
    defineGraph('optOut', 'a', {
      a: { next: 'b' },
      b: { next: 'c', compensate: false },
      c: {},
    })

    const { run: record } = await run('optOut')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(undone(), ['undo:a'])
  })

  test('with nothing to compensate the run fails', async () => {
    register('a', ok())
    register('b', boom())
    defineGraph('nothing', 'a', { a: { next: 'b' }, b: {} })

    const { run: record } = await run('nothing')

    assert.equal(record.status, 'failed')
  })

  test('a stuck compensation parks the run as compensation_failed and protects earlier nodes', async () => {
    register('a', undoable())
    register('b', {
      ...ok(),
      compensate: async () => {
        throw new Error('cannot undo')
      },
    })
    register('c', boom())
    defineGraph('stuck', 'a', {
      a: { next: 'b' },
      b: { next: 'c' },
      c: {},
    })

    const { run: record } = await run('stuck')

    assert.equal(record.status, 'compensation_failed')
    assert.deepEqual(
      (record.output as any).stuckSteps.map((s: any) => s.stepName),
      ['b']
    )
    assert.ok(!log.includes('undo:a'))
  })

  test('parallel branches: a stuck one does not stop its sibling being undone', async () => {
    register('start', undoable())
    register('left', {
      ...ok(),
      compensate: async () => {
        throw new Error('left stuck')
      },
    })
    register('right', undoable())
    register('join', boom())
    defineGraph('fan', 'start', {
      start: { next: ['left', 'right'] },
      left: { next: 'join' },
      right: { next: 'join' },
      join: {},
    })

    const { run: record } = await run('fan')

    assert.equal(record.status, 'compensation_failed')
    assert.ok(log.includes('undo:right'))
    assert.ok(!log.includes('undo:start'))
  })

  test('a successful graph compensates nothing', async () => {
    register('a', undoable())
    register('b', undoable())
    defineGraph('happy', 'a', { a: { next: 'b' }, b: {} })

    const { run: record } = await run('happy')

    assert.equal(record.status, 'completed')
    assert.deepEqual(undone(), [])
  })

  test('compensation rows are named <node>:compensate and flagged on the timeline', async () => {
    register('a', undoable())
    register('b', boom())
    defineGraph('rows', 'a', { a: { next: 'b' }, b: {} })

    const { ws, runId, steps } = await run('rows')
    const timeline = await ws.getRunTimeline(runId)

    assert.ok(steps.some((s) => s.stepName === 'a:compensate'))
    assert.ok(
      timeline!.some((e) => e.compensating && e.stepName === 'a:compensate')
    )
  })
})

describe('graph recover', () => {
  test('a failing node runs its recover node, with the error on graph.recoveringFrom', async () => {
    register('a', boom('payment down'))
    register('fallback', ok({ used: true }))
    defineGraph('recoverNode', 'a', {
      a: { recover: 'fallback' },
      fallback: {},
    })

    const { run: record } = await run('recoverNode')

    assert.equal(record.status, 'completed')
    assert.equal(recovering.length, 1)
    assert.equal(recovering[0]!.rpc, 'fallback')
    assert.equal(recovering[0]!.from.nodeId, 'a')
    assert.equal(recovering[0]!.from.error.message, 'payment down')
  })

  test("recover: 'ignore' carries on to next with no output", async () => {
    register('a', boom())
    register('b', ok())
    defineGraph('ignore', 'a', { a: { recover: 'ignore', next: 'b' }, b: {} })

    const { run: record } = await run('ignore')

    assert.equal(record.status, 'completed')
    assert.ok(log.includes('do:b'))
  })

  test('recover nodes chain: a recovery that fails can itself recover', async () => {
    register('a', boom('first'))
    register('second', boom('second'))
    register('third', ok())
    defineGraph('chainRecover', 'a', {
      a: { recover: 'second' },
      second: { recover: 'third' },
      third: {},
    })

    const { run: record } = await run('chainRecover')

    assert.equal(record.status, 'completed')
    assert.deepEqual(
      recovering.map((r) => [r.rpc, r.from.nodeId, r.from.error.message]),
      [
        ['second', 'a', 'first'],
        ['third', 'second', 'second'],
      ]
    )
  })

  test('a recovered failure takes precedence over compensation', async () => {
    register('earlier', undoable())
    register('a', {
      ...boom(),
      compensate: async () => {},
    })
    register('fallback', ok())
    defineGraph('precedence', 'earlier', {
      earlier: { next: 'a' },
      a: { recover: 'fallback' },
      fallback: {},
    })

    const { run: record } = await run('precedence')

    assert.equal(record.status, 'completed')
    assert.deepEqual(undone(), [])
  })

  test('a failing recover node falls through to compensation, undoing the recovered node too', async () => {
    register('earlier', undoable())
    register('a', boom('first'))
    register('fallback', boom('second'))
    defineGraph('recoverFails', 'earlier', {
      earlier: { next: 'a' },
      a: { recover: 'fallback' },
      fallback: {},
    })

    const { run: record } = await run('recoverFails')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(undone(), ['undo:earlier'])
  })

  test('recover to an unknown node is rejected before anything runs', async () => {
    register('a', ok())
    defineGraph('badRecover', 'a', { a: { recover: 'ghost' } })

    await assert.rejects(
      () => run('badRecover'),
      /recover targets unknown node 'ghost'/
    )
    assert.deepEqual(log, [])
  })

  test('recovering is undefined on a node that was reached normally', async () => {
    register('a', ok())
    register('b', ok())
    defineGraph('normal', 'a', { a: { next: 'b' }, b: {} })

    await run('normal')

    assert.deepEqual(recovering, [])
  })

  test('an unrecovered failure elsewhere still compensates', async () => {
    register('a', undoable())
    register('b', boom())
    register('fallback', ok())
    defineGraph('mixed', 'a', {
      a: { next: ['b'] },
      b: {},
      fallback: {},
    })

    const { run: record } = await run('mixed')

    assert.equal(record.status, 'compensated')
  })
})
