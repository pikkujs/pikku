import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import type { CompensatingFor } from './dsl/workflow-dsl.types.js'

type Handler = {
  forward: (data: any) => Promise<any> | any
  compensate?: (data: any, context: CompensatingFor) => Promise<void> | void
}

const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

let handlers: Record<string, Handler>
let log: string[]
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
    const context = wire.workflow?.compensatingFor as
      CompensatingFor | undefined
    contexts.push({ rpc: rpcName, context })
    if (isCompensation) {
      log.push(`undo:${base}`)
      return handler.compensate!(data, context!)
    }
    log.push(`do:${base}`)
    return handler.forward(data)
  },
}

const defineWorkflow = (
  name: string,
  body: (workflow: any, input: any) => Promise<any>
) => {
  pikkuState(null, 'workflows', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    source: 'dsl',
    graphHash: `${name}-hash`,
  } as any
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    sessionless: true,
    permissions: [],
  } as any
  addWorkflow(name, {
    func: async (_services: any, input: any, wire: any) =>
      body(wire.workflow, input),
  } as any)
}

const run = async (name: string, input: any = {}) => {
  const ws = new InMemoryWorkflowService()
  let error: any
  let runId = ''
  try {
    const started = await ws.startWorkflow(
      name,
      input,
      { type: 'test' },
      rpc as any,
      {
        inline: true,
        onRunCreated: (id) => {
          runId = id
        },
      }
    )
    runId = started.runId
  } catch (e) {
    error = e
  }
  const record = await ws.getRun(runId)
  const steps = await ws.getRunSteps(runId)
  return { ws, runId, run: record!, steps, error }
}

const ok = (output: any = {}) => ({ forward: async () => output })

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
  } as any)
  handlers = {}
  log = []
  contexts = []
})

describe('saga compensation — the unwind', () => {
  test('a run that succeeds runs no compensation', async () => {
    register('reserve', { ...ok({ id: 1 }), compensate: async () => {} })
    defineWorkflow('happy', async (workflow) => {
      await workflow.do('Reserve', 'reserve', {})
      return 'done'
    })

    const { run: record, steps } = await run('happy')

    assert.equal(record.status, 'completed')
    assert.deepEqual(log, ['do:reserve'])
    assert.equal(
      steps.filter((s) => s.stepName.endsWith(':compensate')).length,
      0
    )
  })

  test('a failure unwinds earlier steps in reverse order of completion', async () => {
    register('a', { ...ok({ n: 1 }), compensate: async () => {} })
    register('b', { ...ok({ n: 2 }), compensate: async () => {} })
    register('c', { ...ok({ n: 3 }), compensate: async () => {} })
    register('boom', {
      forward: async () => {
        throw new Error('nope')
      },
      compensate: async () => {},
    })
    defineWorkflow('saga', async (workflow) => {
      await workflow.do('A', 'a', { k: 'a' }, { retries: 0 })
      await workflow.do('B', 'b', { k: 'b' }, { retries: 0 })
      await workflow.do('C', 'c', { k: 'c' }, { retries: 0 })
      await workflow.do('Boom', 'boom', { k: 'boom' }, { retries: 0 })
    })

    const { run: record, error } = await run('saga')

    assert.match(error.message, /nope/)
    assert.equal(record.status, 'compensated')
    assert.deepEqual(log, [
      'do:a',
      'do:b',
      'do:c',
      'do:boom',
      'undo:boom',
      'undo:c',
      'undo:b',
      'undo:a',
    ])
  })

  test('the failed step compensates itself with ok:false and its error', async () => {
    register('charge', {
      forward: async () => {
        throw new Error('card declined')
      },
      compensate: async () => {},
    })
    defineWorkflow('failing', async (workflow) => {
      await workflow.do('Charge', 'charge', { orderId: 'o1' }, { retries: 0 })
    })

    await run('failing')

    const undo = contexts.find((c) => c.rpc === 'charge:compensate')!
    assert.equal(undo.context!.ok, false)
    assert.equal(undo.context!.output, null)
    assert.equal(
      (undo.context as Extract<CompensatingFor, { ok: false }>).error.message,
      'card declined'
    )
    assert.equal(undo.context!.stepName, 'Charge')
  })

  test('a succeeded step compensates with ok:true and its output, and the original input', async () => {
    let seenInput: any
    register('charge', {
      forward: async () => ({ chargeId: 'ch_1' }),
      compensate: async (data) => {
        seenInput = data
      },
    })
    register('ship', {
      forward: async () => {
        throw new Error('no courier')
      },
    })
    defineWorkflow('ordering', async (workflow) => {
      await workflow.do('Charge', 'charge', { orderId: 'o1', amount: 5 })
      await workflow.do('Ship', 'ship', {}, { retries: 0 })
    })

    await run('ordering')

    const undo = contexts.find((c) => c.rpc === 'charge:compensate')!
    assert.deepEqual(undo.context, {
      ok: true,
      output: { chargeId: 'ch_1' },
      stepName: 'Charge',
    })
    assert.deepEqual(seenInput, { orderId: 'o1', amount: 5 })
  })

  test('compensatingFor is undefined on a forward run', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('forward', async (workflow) => {
      await workflow.do('A', 'a', {})
    })

    await run('forward')

    assert.equal(contexts[0]!.context, undefined)
  })

  test('functions without a compensation are skipped', async () => {
    register('plain', ok())
    register('a', { ...ok(), compensate: async () => {} })
    register('boom', {
      forward: async () => {
        throw new Error('x')
      },
    })
    defineWorkflow('mixed', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.do('Plain', 'plain', {})
      await workflow.do('Boom', 'boom', {}, { retries: 0 })
    })

    const { run: record } = await run('mixed')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:a']
    )
  })

  test('with nothing to compensate the run simply fails', async () => {
    register('plain', ok())
    register('boom', {
      forward: async () => {
        throw new Error('x')
      },
    })
    defineWorkflow('nothing', async (workflow) => {
      await workflow.do('Plain', 'plain', {})
      await workflow.do('Boom', 'boom', {}, { retries: 0 })
    })

    const { run: record, steps } = await run('nothing')

    assert.equal(record.status, 'failed')
    assert.equal(
      steps.filter((s) => s.stepName.endsWith(':compensate')).length,
      0
    )
  })

  test('{ compensate: false } leaves that step out of the unwind', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    register('b', { ...ok(), compensate: async () => {} })
    register('boom', {
      forward: async () => {
        throw new Error('x')
      },
    })
    defineWorkflow('optout', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.do('B', 'b', {}, { compensate: false })
      await workflow.do('Boom', 'boom', {}, { retries: 0 })
    })

    const { run: record } = await run('optout')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:a']
    )
  })

  test('a non-step error thrown by the body still unwinds what ran', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('bodyError', async (workflow) => {
      await workflow.do('A', 'a', {})
      throw new Error('body blew up')
    })

    const { run: record, error } = await run('bodyError')

    assert.equal(error.message, 'body blew up')
    assert.equal(record.status, 'compensated')
    assert.deepEqual(log, ['do:a', 'undo:a'])
  })

  test('the original error is kept on the compensated run', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('keepsError', async (workflow) => {
      await workflow.do('A', 'a', {})
      throw new Error('the real reason')
    })

    const { run: record } = await run('keepsError')

    assert.equal(record.error?.message, 'the real reason')
  })

  test('compensation rows are named <step>:compensate and flagged on the timeline', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('timeline', async (workflow) => {
      await workflow.do('A', 'a', {})
      throw new Error('x')
    })

    const { ws, runId, steps } = await run('timeline')
    const timeline = await ws.getRunTimeline(runId)

    assert.ok(steps.some((s) => s.stepName === 'A:compensate'))
    const flagged = timeline!.filter((e) => e.compensating)
    assert.ok(flagged.length > 0)
    assert.ok(flagged.every((e) => e.stepName === 'A:compensate'))
    assert.ok(
      timeline!.filter((e) => !e.compensating).every((e) => e.stepName === 'A')
    )
  })
})

describe('saga compensation — retries and stuck steps', () => {
  test('a compensation retries before it gives up', async () => {
    let attempts = 0
    register('a', {
      ...ok(),
      compensate: async () => {
        attempts++
        if (attempts < 3) throw new Error('flaky')
      },
    })
    defineWorkflow('flaky', async (workflow) => {
      await workflow.do('A', 'a', {}, { retries: 4 })
      throw new Error('x')
    })

    const { run: record } = await run('flaky')

    assert.equal(attempts, 3)
    assert.equal(record.status, 'compensated')
  })

  test('a compensation that runs out of retries parks the run as compensation_failed', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    register('b', {
      ...ok(),
      compensate: async () => {
        throw new Error('cannot undo b')
      },
    })
    defineWorkflow('stuck', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.do('B', 'b', {}, { retries: 1 })
      throw new Error('x')
    })

    const { run: record } = await run('stuck')

    assert.equal(record.status, 'compensation_failed')
    assert.deepEqual((record.output as any).stuckSteps, [
      { stepName: 'B', error: 'cannot undo b' },
    ])
    assert.ok(
      !log.includes('undo:a'),
      'steps before a stuck compensation must not be undone'
    )
  })

  test('a failing compensation does not start another rollback', async () => {
    register('b', {
      ...ok(),
      compensate: async () => {
        throw new Error('nope')
      },
    })
    defineWorkflow('noNested', async (workflow) => {
      await workflow.do('B', 'b', {}, { retries: 0 })
      throw new Error('x')
    })

    const { steps } = await run('noNested')

    assert.equal(
      steps.filter((s) => s.stepName.endsWith(':compensate:compensate')).length,
      0
    )
    assert.equal(log.filter((l) => l === 'undo:b').length, 1)
  })

  test('a stuck compensation blocks only the steps before it, not parallel siblings', async () => {
    register('first', { ...ok(), compensate: async () => {} })
    register('left', {
      forward: async () => {
        await new Promise((r) => setTimeout(r, 5))
        return {}
      },
      compensate: async () => {
        throw new Error('left stuck')
      },
    })
    register('right', {
      forward: async () => {
        await new Promise((r) => setTimeout(r, 15))
        return {}
      },
      compensate: async () => {},
    })
    defineWorkflow('parallel', async (workflow) => {
      await workflow.do('First', 'first', {})
      await Promise.all([
        workflow.do('Left', 'left', {}, { retries: 0 }),
        workflow.do('Right', 'right', {}, { retries: 0 }),
      ])
      throw new Error('x')
    })

    const { run: record } = await run('parallel')

    assert.equal(record.status, 'compensation_failed')
    assert.ok(
      log.includes('undo:right'),
      'the sibling must still be compensated'
    )
    assert.ok(
      !log.includes('undo:first'),
      'the step before the parallel group stays put'
    )
    assert.deepEqual(
      (record.output as any).stuckSteps.map((s: any) => s.stepName),
      ['Left']
    )
  })

  test('a stuck step never makes the run look fully compensated', async () => {
    register('a', {
      ...ok(),
      compensate: async () => {
        throw new Error('stuck')
      },
    })
    defineWorkflow('notDone', async (workflow) => {
      await workflow.do('A', 'a', {}, { retries: 0 })
      throw new Error('x')
    })

    const { run: record } = await run('notDone')

    assert.notEqual(record.status, 'compensated')
    assert.notEqual(record.status, 'failed')
  })
})

describe('saga compensation — milestones', () => {
  test('the unwind stops at the last milestone and the run rests there', async () => {
    register('build', { ...ok(), compensate: async () => {} })
    register('apply', { ...ok(), compensate: async () => {} })
    defineWorkflow('milestones', async (workflow) => {
      await workflow.do('Build', 'build', {})
      await workflow.milestone('approved')
      await workflow.do('Apply', 'apply', {})
      throw new Error('x')
    })

    const { run: record } = await run('milestones')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(record.output, { restedAt: 'approved' })
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:apply']
    )
  })

  test('a milestone before any failure changes nothing on success', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('okMilestone', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.milestone('m')
      return 'done'
    })

    const { run: record } = await run('okMilestone')

    assert.equal(record.status, 'completed')
  })

  test('the latest milestone wins', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    register('b', { ...ok(), compensate: async () => {} })
    register('c', { ...ok(), compensate: async () => {} })
    defineWorkflow('two', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.milestone('one')
      await workflow.do('B', 'b', {})
      await workflow.milestone('two')
      await workflow.do('C', 'c', {})
      throw new Error('x')
    })

    const { run: record } = await run('two')

    assert.deepEqual(record.output, { restedAt: 'two' })
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:c']
    )
  })

  test('a failure right after a milestone with nothing to undo rests at the milestone', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    register('boom', {
      forward: async () => {
        throw new Error('x')
      },
    })
    defineWorkflow('restsAtOnce', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.milestone('safe')
      await workflow.do('Boom', 'boom', {}, { retries: 0 })
    })

    const { run: record } = await run('restsAtOnce')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(record.output, { restedAt: 'safe' })
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      []
    )
  })

  test('a failure before any milestone unwinds to the start', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('early', async (workflow) => {
      await workflow.do('A', 'a', {})
      throw new Error('x')
    })

    const { run: record } = await run('early')

    assert.equal(record.status, 'compensated')
    assert.equal(record.output, undefined)
  })
})

describe('saga compensation — never twice', () => {
  test('a settled unwind is not started again', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    defineWorkflow('once', async (workflow) => {
      await workflow.do('A', 'a', {})
      throw new Error('x')
    })

    const { ws, runId, run: record } = await run('once')
    assert.equal(record.status, 'compensated')

    await ws.runWorkflowJob(runId, rpc as any)
    await ws.runWorkflowJob(runId, rpc as any)

    assert.equal(log.filter((l) => l === 'undo:a').length, 1)
  })

  test('re-entering a run that is compensating resumes instead of restarting', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    register('b', { ...ok(), compensate: async () => {} })
    defineWorkflow('resume', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.do('B', 'b', {})
      throw new Error('x')
    })

    const { ws, runId } = await run('resume')
    await ws.updateRunStatus(runId, 'compensating')
    log.length = 0

    await ws.runWorkflowJob(runId, rpc as any)

    assert.deepEqual(
      log,
      [],
      'completed compensations are recorded, so none run again'
    )
    assert.equal((await ws.getRun(runId))!.status, 'compensated')
  })

  test('a crash mid-unwind resumes at the next compensation', async () => {
    register('a', { ...ok(), compensate: async () => {} })
    register('b', { ...ok(), compensate: async () => {} })
    let crashed = false
    handlers['b']!.compensate = async () => {
      if (!crashed) {
        crashed = true
        throw new Error('process died')
      }
    }
    defineWorkflow('crash', async (workflow) => {
      await workflow.do('A', 'a', {})
      await workflow.do('B', 'b', {}, { retries: 0 })
      throw new Error('x')
    })

    const first = await run('crash')
    assert.equal(first.run.status, 'compensation_failed')
    assert.ok(!log.includes('undo:a'))
  })
})

describe('saga compensation — nested workflows', () => {
  test('a completed child is undone as a unit when the parent fails', async () => {
    register('inner', { ...ok(), compensate: async () => {} })
    defineWorkflow('child', async (workflow) => {
      await workflow.do('Inner', 'inner', {})
      return { ok: true }
    })
    register('outer', { ...ok(), compensate: async () => {} })
    defineWorkflow('parent', async (workflow) => {
      await workflow.do('Outer', 'outer', {})
      await workflow.do('Child', 'child', {})
      throw new Error('x')
    })

    const { run: record } = await run('parent')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:inner', 'undo:outer']
    )
  })

  test('{ compensate: false } on the parent step keeps the child as it is', async () => {
    register('inner', { ...ok(), compensate: async () => {} })
    defineWorkflow('child2', async (workflow) => {
      await workflow.do('Inner', 'inner', {})
    })
    register('outer', { ...ok(), compensate: async () => {} })
    defineWorkflow('parent2', async (workflow) => {
      await workflow.do('Outer', 'outer', {})
      await workflow.do('Child', 'child2', {}, { compensate: false })
      throw new Error('x')
    })

    await run('parent2')

    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:outer']
    )
  })

  test('a child that fails unwinds itself and the parent then unwinds too', async () => {
    register('inner', { ...ok(), compensate: async () => {} })
    register('bad', {
      forward: async () => {
        throw new Error('child broke')
      },
    })
    defineWorkflow('child3', async (workflow) => {
      await workflow.do('Inner', 'inner', {})
      await workflow.do('Bad', 'bad', {}, { retries: 0 })
    })
    register('outer', { ...ok(), compensate: async () => {} })
    defineWorkflow('parent3', async (workflow) => {
      await workflow.do('Outer', 'outer', {})
      await workflow.do('Child', 'child3', {}, { retries: 0 })
    })

    const { run: record } = await run('parent3')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(
      log.filter((l) => l.startsWith('undo')),
      ['undo:inner', 'undo:outer']
    )
  })

  test('a stuck child leaves the parent compensation_failed, without undoing its earlier steps', async () => {
    register('inner', {
      ...ok(),
      compensate: async () => {
        throw new Error('inner stuck')
      },
    })
    register('bad', {
      forward: async () => {
        throw new Error('child broke')
      },
    })
    defineWorkflow('child4', async (workflow) => {
      await workflow.do('Inner', 'inner', {}, { retries: 0 })
      await workflow.do('Bad', 'bad', {}, { retries: 0 })
    })
    register('outer', { ...ok(), compensate: async () => {} })
    defineWorkflow('parent4', async (workflow) => {
      await workflow.do('Outer', 'outer', {})
      await workflow.do('Child', 'child4', {}, { retries: 0 })
    })

    const { run: record } = await run('parent4')

    assert.equal(record.status, 'compensation_failed')
    assert.ok(!log.includes('undo:outer'))
  })

  test('a child resting at its own milestone leaves the parent compensated at that boundary', async () => {
    register('inner', { ...ok(), compensate: async () => {} })
    register('bad', {
      forward: async () => {
        throw new Error('child broke')
      },
    })
    defineWorkflow('child5', async (workflow) => {
      await workflow.do('Inner', 'inner', {})
      await workflow.milestone('childSafe')
      await workflow.do('Bad', 'bad', {}, { retries: 0 })
    })
    register('outer', { ...ok(), compensate: async () => {} })
    defineWorkflow('parent5', async (workflow) => {
      await workflow.do('Outer', 'outer', {})
      await workflow.do('Child', 'child5', {}, { retries: 0 })
    })

    const { run: record } = await run('parent5')

    assert.equal(record.status, 'compensated')
    assert.deepEqual(record.output, { restedAt: 'childSafe' })
    assert.ok(!log.includes('undo:outer'))
  })
})

describe('saga compensation — cancellation', () => {
  const suspendedRun = async (name: string) => {
    const result = await run(name)
    assert.equal(result.run.status, 'suspended')
    return result
  }

  test('cancelling a suspended run unwinds what it completed', async () => {
    register('reserve', { ...ok({ id: 1 }), compensate: async () => {} })
    defineWorkflow('parked', async (workflow) => {
      await workflow.do('Reserve', 'reserve', {})
      await workflow.suspend('wait for a human')
    })
    const { ws, runId } = await suspendedRun('parked')

    assert.equal(await ws.cancelRun(runId, rpc as any), 'compensated')

    const record = (await ws.getRun(runId))!
    assert.equal(record.status, 'compensated')
    assert.equal(record.error?.code, 'WORKFLOW_CANCELLED')
    assert.deepEqual(log, ['do:reserve', 'undo:reserve'])
  })

  test('the cancel reason is kept on the run', async () => {
    register('look', ok())
    defineWorkflow('reasoned', async (workflow) => {
      await workflow.do('Look', 'look', {})
      await workflow.suspend('wait')
    })
    const { ws, runId } = await suspendedRun('reasoned')

    await ws.cancelRun(runId, rpc as any, 'customer withdrew')

    const record = (await ws.getRun(runId))!
    assert.equal(record.error?.message, 'customer withdrew')
    assert.equal(record.error?.code, 'WORKFLOW_CANCELLED')
  })

  test('cancelling a run with nothing to undo leaves it cancelled', async () => {
    register('look', ok())
    defineWorkflow('parkedPlain', async (workflow) => {
      await workflow.do('Look', 'look', {})
      await workflow.suspend('wait')
    })
    const { ws, runId } = await suspendedRun('parkedPlain')

    assert.equal(await ws.cancelRun(runId, rpc as any), 'cancelled')
    assert.deepEqual(log, ['do:look'])
  })

  test('cancelling twice undoes once', async () => {
    register('reserve', { ...ok(), compensate: async () => {} })
    defineWorkflow('parkedTwice', async (workflow) => {
      await workflow.do('Reserve', 'reserve', {})
      await workflow.suspend('wait')
    })
    const { ws, runId } = await suspendedRun('parkedTwice')

    await ws.cancelRun(runId, rpc as any)
    await ws.cancelRun(runId, rpc as any)

    assert.deepEqual(undone(), ['undo:reserve'])
  })

  test('a finished run cannot be cancelled', async () => {
    register('reserve', { ...ok(), compensate: async () => {} })
    defineWorkflow('finished', async (workflow) => {
      await workflow.do('Reserve', 'reserve', {})
    })
    const { ws, runId } = await run('finished')

    assert.equal(await ws.cancelRun(runId, rpc as any), 'completed')
    assert.deepEqual(undone(), [])
  })
})

const undone = () => log.filter((l) => l.startsWith('undo'))
