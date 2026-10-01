import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { QueuedWorkflowHarness } from './workflow-queued-harness.test.js'

const setup = () => new QueuedWorkflowHarness()

describe('queued saga compensation — DSL', () => {
  test('a successful run compensates nothing', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.defineDsl('ok', async (w) => {
      await w.do('A', 'a', {})
    })
    const runId = await h.start('ok')
    assert.equal((await h.run(runId)).status, 'completed')
    assert.deepEqual(h.undone, [])
  })

  test('a failure unwinds in reverse order, each compensation on the step queue', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.register('c', h.boom())
    h.defineDsl('chain', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {})
      await w.do('C', 'c', {}, { retries: 0 })
    })
    const runId = await h.start('chain')

    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:b', 'undo:a'])
    const queuedSteps = h.jobsRun.map((j) => j.step).filter(Boolean)
    assert.ok(queuedSteps.includes('B:compensate'))
    assert.ok(queuedSteps.includes('A:compensate'))
  })

  test('compensatingFor carries ok, output and the original input', async () => {
    const h = setup()
    h.register('a', h.undoable({ id: 7 }))
    h.register('b', h.boom('declined'))
    h.defineDsl('ctx', async (w) => {
      await w.do('A', 'a', { sku: 'x' })
      await w.do('B', 'b', {}, { retries: 0 })
    })
    await h.start('ctx')

    const undoA = h.contexts.find((c) => c.rpc === 'a:compensate')!
    assert.equal(undoA.context?.ok, true)
    assert.deepEqual(undoA.context?.output, { id: 7 })
    assert.equal(h.contexts.find((c) => c.rpc === 'a')!.context, undefined)
  })

  test('the failed step compensates itself with ok:false', async () => {
    const h = setup()
    h.register('b', {
      ...h.boom('declined'),
      compensate: async () => {},
    })
    h.defineDsl('self', async (w) => {
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('self')
    assert.equal((await h.run(runId)).status, 'compensated')
    const undo = h.contexts.find((c) => c.rpc === 'b:compensate')!
    assert.equal(undo.context?.ok, false)
  })

  test('nothing to compensate leaves the run failed', async () => {
    const h = setup()
    h.register('a', h.ok())
    h.register('b', h.boom())
    h.defineDsl('plain', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('plain')
    assert.equal((await h.run(runId)).status, 'failed')
  })

  test('{ compensate: false } leaves a step out', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.register('c', h.boom())
    h.defineDsl('skip', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { compensate: false })
      await w.do('C', 'c', {}, { retries: 0 })
    })
    await h.start('skip')
    assert.deepEqual(h.undone, ['undo:a'])
  })

  test('a non-step error thrown by the body still unwinds', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.defineDsl('bodyThrow', async (w) => {
      await w.do('A', 'a', {})
      throw new Error('body broke')
    })
    const runId = await h.start('bodyThrow')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:a'])
  })

  test('the original error is kept on the compensated run', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.boom('original'))
    h.defineDsl('err', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('err')
    assert.match((await h.run(runId)).error?.message ?? '', /original/)
  })

  test('compensation rows are named <step>:compensate and flagged', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.boom())
    h.defineDsl('rows', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('rows')
    const row = (await h.steps(runId)).find(
      (s: any) => s.stepName === 'A:compensate'
    ) as any
    assert.ok(row)
    assert.equal(row.status, 'succeeded')
  })
})

describe('queued saga compensation — retries and stuck steps', () => {
  test('a compensation retries before it gives up', async () => {
    const h = setup()
    let attempts = 0
    h.register('a', {
      ...h.ok(),
      compensate: async () => {
        if (++attempts < 3) throw new Error('flaky')
      },
    })
    h.register('b', h.boom())
    h.defineDsl('retry', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('retry')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.equal(attempts, 3)
  })

  test('a compensation that exhausts retries parks the run as compensation_failed', async () => {
    const h = setup()
    h.register('first', h.undoable())
    h.register('a', {
      ...h.ok(),
      compensate: async () => {
        throw new Error('stuck')
      },
    })
    h.register('b', h.boom())
    h.defineDsl('stuck', async (w) => {
      await w.do('First', 'first', {})
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('stuck')
    const run = await h.run(runId)
    assert.equal(run.status, 'compensation_failed')
    assert.ok(!h.log.includes('undo:first'), 'earlier steps stay protected')
  })

  test('a stuck compensation blocks only earlier steps, not parallel siblings', async () => {
    const h = setup()
    h.register('first', h.undoable())
    h.register('left', {
      ...h.ok(),
      compensate: async () => {
        throw new Error('left stuck')
      },
    })
    h.register('right', h.undoable())
    h.defineDsl('par', async (w) => {
      await w.do('First', 'first', {})
      await Promise.all([
        w.do('Left', 'left', {}, { retries: 0 }),
        w.do('Right', 'right', {}, { retries: 0 }),
      ])
      throw new Error('x')
    })
    const runId = await h.start('par')
    assert.equal((await h.run(runId)).status, 'compensation_failed')
    assert.ok(h.log.includes('undo:right'))
    assert.ok(!h.log.includes('undo:first'))
  })

  test('forward retries on the queue run before the unwind starts', async () => {
    const h = setup()
    let tries = 0
    h.register('a', h.undoable())
    h.register('b', {
      forward: async () => {
        tries++
        throw new Error('always')
      },
    })
    h.defineDsl('fwdRetry', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 2 })
    })
    const runId = await h.start('fwdRetry')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.equal(tries, 3)
    assert.equal(h.log.indexOf('undo:a'), h.log.length - 1)
  })
})

describe('queued saga compensation — milestones', () => {
  test('the unwind stops at the last milestone', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.register('c', h.boom())
    h.defineDsl('ms', async (w) => {
      await w.do('A', 'a', {})
      await w.milestone('approved')
      await w.do('B', 'b', {})
      await w.do('C', 'c', {}, { retries: 0 })
    })
    const runId = await h.start('ms')
    const run = await h.run(runId)
    assert.deepEqual(h.undone, ['undo:b'])
    assert.equal(run.status, 'compensated')
    assert.equal((run.output as any)?.restedAt, 'approved')
  })

  test('a failure before any milestone unwinds everything', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.boom())
    h.defineDsl('noms', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    await h.start('noms')
    assert.deepEqual(h.undone, ['undo:a'])
  })

  test('a milestone does not change a successful run', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.defineDsl('msok', async (w) => {
      await w.do('A', 'a', {})
      await w.milestone('m')
    })
    const runId = await h.start('msok')
    assert.equal((await h.run(runId)).status, 'completed')
  })
})

describe('queued saga compensation — never twice and recovery', () => {
  test('a duplicate orchestration job does not rerun a finished unwind', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.boom())
    h.defineDsl('dup', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('dup')
    h.queue.push({ queue: 'pikku-workflow-orchestrator', data: { runId } })
    h.queue.push({ queue: 'pikku-workflow-orchestrator', data: { runId } })
    await h.pump()
    assert.deepEqual(h.undone, ['undo:a'])
    assert.equal((await h.run(runId)).status, 'compensated')
  })

  test('a redelivered compensation job does not run the compensation twice', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.boom())
    h.defineDsl('redeliver', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {}, { retries: 0 })
    })
    const runId = await h.start('redeliver')
    h.queue.push({
      queue: 'pikku-workflow-step-worker',
      data: {
        runId,
        stepName: 'A:compensate',
        rpcName: 'a:compensate',
        data: {},
      },
    })
    await h.pump()
    assert.deepEqual(h.undone, ['undo:a'])
  })

  test('a compensation whose dispatch failed is still run, exactly once', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.register('c', h.boom())
    h.defineDsl('undispatched', async (w) => {
      await w.do('A', 'a', {})
      await w.do('B', 'b', {})
      await w.do('C', 'c', {}, { retries: 0 })
    })
    let rejected = false
    h.rejectAddWhen = (_queue, data) => {
      if (!rejected && data.stepName === 'B:compensate') {
        rejected = true
        return true
      }
      return false
    }
    const runId = await h.start('undispatched')
    assert.equal(rejected, true)

    await h.ws.resumeWorkflow(runId)
    await h.pump()
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:b', 'undo:a'])
  })
})

describe('queued saga compensation — nested workflows', () => {
  test('a completed child is undone as a unit when the parent fails', async () => {
    const h = setup()
    h.register('inner', h.undoable())
    h.register('outer', h.undoable())
    h.defineDsl('child', async (w) => {
      await w.do('Inner', 'inner', {})
      return { ok: true }
    })
    h.defineDsl('parent', async (w) => {
      await w.do('Outer', 'outer', {})
      await w.do('Child', 'child', {})
      throw new Error('x')
    })
    const runId = await h.start('parent')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:inner', 'undo:outer'])
  })

  test('a child that fails unwinds itself and then the parent', async () => {
    const h = setup()
    h.register('inner', h.undoable())
    h.register('bad', h.boom())
    h.register('outer', h.undoable())
    h.defineDsl('child3', async (w) => {
      await w.do('Inner', 'inner', {})
      await w.do('Bad', 'bad', {}, { retries: 0 })
    })
    h.defineDsl('parent3', async (w) => {
      await w.do('Outer', 'outer', {})
      await w.do('Child', 'child3', {}, { retries: 0 })
    })
    const runId = await h.start('parent3')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:inner', 'undo:outer'])
  })

  test('{ compensate: false } on the parent step keeps the child', async () => {
    const h = setup()
    h.register('inner', h.undoable())
    h.register('outer', h.undoable())
    h.defineDsl('child2', async (w) => {
      await w.do('Inner', 'inner', {})
    })
    h.defineDsl('parent2', async (w) => {
      await w.do('Outer', 'outer', {})
      await w.do('Child', 'child2', {}, { compensate: false })
      throw new Error('x')
    })
    await h.start('parent2')
    assert.deepEqual(h.undone, ['undo:outer'])
  })

  test('a stuck child leaves the parent compensation_failed', async () => {
    const h = setup()
    h.register('inner', {
      ...h.ok(),
      compensate: async () => {
        throw new Error('inner stuck')
      },
    })
    h.register('bad', h.boom())
    h.register('outer', h.undoable())
    h.defineDsl('child4', async (w) => {
      await w.do('Inner', 'inner', {})
      await w.do('Bad', 'bad', {}, { retries: 0 })
    })
    h.defineDsl('parent4', async (w) => {
      await w.do('Outer', 'outer', {})
      await w.do('Child', 'child4', {}, { retries: 0 })
    })
    const runId = await h.start('parent4')
    assert.equal((await h.run(runId)).status, 'compensation_failed')
    assert.ok(!h.log.includes('undo:outer'))
  })
})

describe('queued saga compensation — child outcomes survive the step boundary', () => {
  test('a child resting at its own milestone leaves the parent compensated there', async () => {
    const h = setup()
    h.register('safe', h.undoable())
    h.register('risky', h.undoable())
    h.register('bad', h.boom())
    h.register('outer', h.undoable())
    h.defineDsl('childRest', async (w) => {
      await w.do('Safe', 'safe', {})
      await w.milestone('childSafe')
      await w.do('Risky', 'risky', {})
      await w.do('Bad', 'bad', {}, { retries: 0 })
    })
    h.defineDsl('parentRest', async (w) => {
      await w.do('Outer', 'outer', {})
      await w.do('Child', 'childRest', {}, { retries: 0 })
    })
    const runId = await h.start('parentRest')
    const run = await h.run(runId)
    assert.equal(run.status, 'compensated')
    assert.equal((run.output as any)?.restedAt, 'childSafe')
    assert.deepEqual(h.undone, ['undo:risky'])
  })

  test('a child that simply failed (nothing to undo) fails the parent normally', async () => {
    const h = setup()
    h.register('bad', h.boom())
    h.defineDsl('plainChild', async (w) => {
      await w.do('Bad', 'bad', {}, { retries: 0 })
    })
    h.defineDsl('plainParent', async (w) => {
      await w.do('Child', 'plainChild', {}, { retries: 0 })
    })
    const runId = await h.start('plainParent')
    assert.equal((await h.run(runId)).status, 'failed')
  })
})

describe('queued saga compensation — cancellation', () => {
  test('cancelling a suspended run unwinds what it completed', async () => {
    const h = setup()
    h.register('reserve', h.undoable({ id: 1 }))
    h.defineDsl('parked', async (w) => {
      await w.do('Reserve', 'reserve', {})
      await w.suspend('wait')
    })
    const runId = await h.start('parked')
    assert.equal((await h.run(runId)).status, 'suspended')

    assert.equal(await h.ws.cancelRun(runId, h.rpc as any), 'compensating')
    await h.pump()
    const run = await h.run(runId)
    assert.equal(run.status, 'compensated')
    assert.equal(run.error?.code, 'WORKFLOW_CANCELLED')
    assert.deepEqual(h.undone, ['undo:reserve'])
  })

  test('cancelling twice undoes once', async () => {
    const h = setup()
    h.register('reserve', h.undoable())
    h.defineDsl('parked2', async (w) => {
      await w.do('Reserve', 'reserve', {})
      await w.suspend('wait')
    })
    const runId = await h.start('parked2')
    await h.ws.cancelRun(runId, h.rpc as any)
    await h.ws.cancelRun(runId, h.rpc as any)
    await h.pump()
    assert.deepEqual(h.undone, ['undo:reserve'])
  })

  test('a finished run cannot be cancelled', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.defineDsl('done', async (w) => {
      await w.do('A', 'a', {})
    })
    const runId = await h.start('done')
    assert.equal(await h.ws.cancelRun(runId, h.rpc as any), 'completed')
    assert.deepEqual(h.undone, [])
  })
})

describe('queued saga compensation — graph', () => {
  test('a failing node unwinds earlier nodes newest first', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.register('c', h.boom())
    h.defineGraph('chain', 'a', {
      a: { next: 'b' },
      b: { next: 'c' },
      c: {},
    })
    const runId = await h.start('chain')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:b', 'undo:a'])
  })

  test('compensatingFor on a graph node carries ok and output', async () => {
    const h = setup()
    h.register('a', h.undoable({ id: 3 }))
    h.register('b', {
      forward: async () => {
        throw new Error('no')
      },
      compensate: async () => {},
    })
    h.defineGraph('gctx', 'a', { a: { next: 'b' }, b: {} })
    await h.start('gctx')
    const a = h.contexts.find((c) => c.rpc === 'a:compensate')!
    const b = h.contexts.find((c) => c.rpc === 'b:compensate')!
    assert.equal(a.context?.ok, true)
    assert.deepEqual(a.context?.output, { id: 3 })
    assert.equal(b.context?.ok, false)
  })

  test('{ compensate: false } on a node leaves it out', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.register('c', h.boom())
    h.defineGraph('gskip', 'a', {
      a: { next: 'b' },
      b: { next: 'c', compensate: false },
      c: {},
    })
    await h.start('gskip')
    assert.deepEqual(h.undone, ['undo:a'])
  })

  test('nothing to compensate fails the run', async () => {
    const h = setup()
    h.register('a', h.ok())
    h.register('b', h.boom())
    h.defineGraph('gplain', 'a', { a: { next: 'b' }, b: {} })
    const runId = await h.start('gplain')
    assert.equal((await h.run(runId)).status, 'failed')
  })

  test('a successful graph compensates nothing', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.undoable())
    h.defineGraph('gok', 'a', { a: { next: 'b' }, b: {} })
    const runId = await h.start('gok')
    assert.equal((await h.run(runId)).status, 'completed')
    assert.deepEqual(h.undone, [])
  })

  test('a stuck compensation parks the run and protects earlier nodes', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', {
      ...h.ok(),
      compensate: async () => {
        throw new Error('stuck')
      },
    })
    h.register('c', h.boom())
    h.defineGraph('gstuck', 'a', {
      a: { next: 'b' },
      b: { next: 'c' },
      c: {},
    })
    const runId = await h.start('gstuck')
    assert.equal((await h.run(runId)).status, 'compensation_failed')
    assert.ok(!h.log.includes('undo:a'))
  })

  test('parallel branches: a stuck one does not stop its sibling', async () => {
    const h = setup()
    h.register('start', h.undoable())
    h.register('left', {
      ...h.ok(),
      compensate: async () => {
        throw new Error('left stuck')
      },
    })
    h.register('right', h.undoable())
    h.register('join', h.boom())
    h.defineGraph('gpar', 'start', {
      start: { next: ['left', 'right'] },
      left: { next: 'join' },
      right: { next: 'join' },
      join: {},
    })
    const runId = await h.start('gpar')
    assert.equal((await h.run(runId)).status, 'compensation_failed')
    assert.ok(h.log.includes('undo:right'))
  })

  test('a duplicate orchestration after the unwind changes nothing', async () => {
    const h = setup()
    h.register('a', h.undoable())
    h.register('b', h.boom())
    h.defineGraph('gdup', 'a', { a: { next: 'b' }, b: {} })
    const runId = await h.start('gdup')
    h.queue.push({ queue: 'pikku-workflow-orchestrator', data: { runId } })
    await h.pump()
    assert.deepEqual(h.undone, ['undo:a'])
    assert.equal((await h.run(runId)).status, 'compensated')
  })
})

describe('queued graph recover', () => {
  test('a failing node runs its recover node with the error', async () => {
    const h = setup()
    h.register('a', h.boom('payment down'))
    h.register('fallback', h.ok())
    h.defineGraph('rec', 'a', { a: { recover: 'fallback' }, fallback: {} })
    const runId = await h.start('rec')
    assert.equal((await h.run(runId)).status, 'completed')
    assert.equal(h.recovering.length, 1)
    assert.equal(h.recovering[0]!.rpc, 'fallback')
    assert.equal(h.recovering[0]!.from.nodeId, 'a')
    assert.equal(h.recovering[0]!.from.error.message, 'payment down')
  })

  test("recover: 'ignore' carries on to next", async () => {
    const h = setup()
    h.register('a', h.boom())
    h.register('b', h.ok())
    h.defineGraph('ign', 'a', { a: { recover: 'ignore', next: 'b' }, b: {} })
    const runId = await h.start('ign')
    assert.equal((await h.run(runId)).status, 'completed')
    assert.ok(h.log.includes('do:b'))
  })

  test('recover nodes chain', async () => {
    const h = setup()
    h.register('a', h.boom('first'))
    h.register('second', h.boom('second'))
    h.register('third', h.ok())
    h.defineGraph('chainrec', 'a', {
      a: { recover: 'second' },
      second: { recover: 'third' },
      third: {},
    })
    const runId = await h.start('chainrec')
    assert.equal((await h.run(runId)).status, 'completed')
    assert.deepEqual(
      h.recovering.map((r) => [r.rpc, r.from.nodeId, r.from.error.message]),
      [
        ['second', 'a', 'first'],
        ['third', 'second', 'second'],
      ]
    )
  })

  test('a recovered failure takes precedence over compensation', async () => {
    const h = setup()
    h.register('earlier', h.undoable())
    h.register('a', { ...h.boom(), compensate: async () => {} })
    h.register('fallback', h.ok())
    h.defineGraph('prec', 'earlier', {
      earlier: { next: 'a' },
      a: { recover: 'fallback' },
      fallback: {},
    })
    const runId = await h.start('prec')
    assert.equal((await h.run(runId)).status, 'completed')
    assert.deepEqual(h.undone, [])
  })

  test('a failing recover node falls through to compensation', async () => {
    const h = setup()
    h.register('earlier', h.undoable())
    h.register('a', h.boom('first'))
    h.register('fallback', h.boom('second'))
    h.defineGraph('fall', 'earlier', {
      earlier: { next: 'a' },
      a: { recover: 'fallback' },
      fallback: {},
    })
    const runId = await h.start('fall')
    assert.equal((await h.run(runId)).status, 'compensated')
    assert.deepEqual(h.undone, ['undo:earlier'])
  })

  test('a node reading a recovered failure is skipped, not waited on', async () => {
    const h = setup()
    h.register('a', h.boom())
    h.register('fallback', h.ok())
    h.register('reader', h.ok())
    h.defineGraph('dead', 'a', {
      a: { recover: 'fallback', next: 'reader' },
      fallback: {},
      reader: { input: { v: { $ref: 'a', path: 'v' } } },
    })
    const runId = await h.start('dead')
    const run = await h.run(runId)
    assert.equal(run.status, 'completed')
    assert.ok(!h.log.includes('do:reader'))
  })

  test('recovering is undefined on a node reached normally', async () => {
    const h = setup()
    h.register('a', h.ok())
    h.register('b', h.ok())
    h.defineGraph('normal', 'a', { a: { next: 'b' }, b: {} })
    await h.start('normal')
    assert.equal(h.recovering.length, 0)
  })

  test('an unrecovered failure elsewhere still compensates', async () => {
    const h = setup()
    h.register('earlier', h.undoable())
    h.register('a', h.boom())
    h.defineGraph('unrec', 'earlier', { earlier: { next: 'a' }, a: {} })
    const runId = await h.start('unrec')
    assert.equal((await h.run(runId)).status, 'compensated')
  })

  test('a recovery survives a duplicate orchestration job', async () => {
    const h = setup()
    h.register('a', h.boom())
    h.register('fallback', h.ok())
    h.defineGraph('recdup', 'a', { a: { recover: 'fallback' }, fallback: {} })
    const runId = await h.start('recdup')
    h.queue.push({ queue: 'pikku-workflow-orchestrator', data: { runId } })
    await h.pump()
    assert.equal((await h.run(runId)).status, 'completed')
    assert.equal(h.log.filter((l) => l === 'do:fallback').length, 1)
  })
})
