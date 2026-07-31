import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createScenarioRunner } from './pikku-scenario-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import type { ScenarioPersonas } from '../../services/personas-service.js'

const noopLogger = {
  error() {},
  info() {},
  warn() {},
  debug() {},
}

const actors = {
  admin: {
    name: 'admin',
    email: 'admin@actors.local',
    invoke: async () => ({}),
    invokeRaw: async () => ({ status: 200, ok: true, body: {} }),
  },
} as unknown as ScenarioPersonas

type ScenarioHooks = {
  before?: (services: any, data: any, wire: any) => Promise<void> | void
  after?: (services: any, data: any, wire: any) => Promise<void> | void
}

const runScenario = async (
  name: string,
  config: ScenarioHooks & { func: (...args: any[]) => any },
  { input = {}, source = 'scenario' as 'scenario' | 'dsl' } = {}
) => {
  const { workflowService: ws, scenarioService } = createScenarioRunner()

  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
    marker: 'singleton',
  } as any)

  const metaState = pikkuState(null, 'workflows', 'meta')
  metaState[name] = {
    name,
    pikkuFuncId: name,
    source,
    graphHash: `${name}-hash`,
  } as any

  const functionMetaState = pikkuState(null, 'function', 'meta')
  functionMetaState[name] = {
    name,
    sessionless: true,
    permissions: [],
  } as any

  addWorkflow(name, config as any)

  let error: any
  try {
    await ws.startWorkflow(name, input, {} as any, {}, { actors })
  } catch (e: any) {
    error = e
  }
  const runs = await ws.listRuns({ workflowName: name })
  const run = runs[0]
  return { error, run, ws }
}

describe('scenario before/after hooks', () => {
  beforeEach(() => resetPikkuState())

  test('before runs, then the scenario, then after', async () => {
    const order: string[] = []
    await runScenario('hooksOrder', {
      before: async () => {
        order.push('before')
      },
      after: async () => {
        order.push('after')
      },
      func: async () => {
        order.push('func')
        return { ok: true }
      },
    })
    assert.deepEqual(order, ['before', 'func', 'after'])
  })

  test('after still runs when the scenario throws', async () => {
    const order: string[] = []
    const { error, run } = await runScenario('hooksAfterOnFailure', {
      after: async () => {
        order.push('after')
      },
      func: async () => {
        order.push('func')
        throw new Error('scenario blew up')
      },
    })
    assert.deepEqual(order, ['func', 'after'])
    assert.equal(error?.message, 'scenario blew up')
    assert.equal(run?.status, 'failed')
  })

  test('before throwing skips the scenario but still runs after', async () => {
    const order: string[] = []
    const { error, run } = await runScenario('hooksBeforeThrows', {
      before: async () => {
        order.push('before')
        throw new Error('setup failed')
      },
      after: async () => {
        order.push('after')
      },
      func: async () => {
        order.push('func')
        return { ok: true }
      },
    })
    assert.deepEqual(order, ['before', 'after'], 'the func must not run')
    assert.match(String(error?.message), /setup failed/)
    assert.equal(run?.status, 'failed')
  })

  test('after throwing fails a run that would otherwise have passed', async () => {
    const { error, run } = await runScenario('hooksAfterThrows', {
      after: async () => {
        throw new Error('teardown failed')
      },
      func: async () => ({ ok: true }),
    })
    assert.match(String(error?.message), /teardown failed/)
    assert.equal(run?.status, 'failed')
  })

  test('after throwing never masks the original failure', async () => {
    const { error } = await runScenario('hooksAfterMasks', {
      after: async () => {
        throw new Error('teardown failed')
      },
      func: async () => {
        throw new Error('the real failure')
      },
    })
    assert.equal(
      error?.message,
      'the real failure',
      'the scenario failure must be what the caller sees'
    )
    assert.match(
      String((error as any)?.cause?.message),
      /teardown failed/,
      'the teardown failure must survive as the cause'
    )
  })

  test('hooks receive the services, the input and the run actors', async () => {
    const seen: any[] = []
    await runScenario(
      'hooksArgs',
      {
        before: async (services, data, wire) => {
          seen.push({
            marker: services.marker,
            data,
            actor: wire?.actors?.admin?.name,
          })
        },
        after: async (services, data, wire) => {
          seen.push({
            marker: services.marker,
            data,
            actor: wire?.actors?.admin?.name,
          })
        },
        func: async () => ({ ok: true }),
      },
      { input: { seed: 7 } }
    )
    assert.deepEqual(seen, [
      { marker: 'singleton', data: { seed: 7 }, actor: 'admin' },
      { marker: 'singleton', data: { seed: 7 }, actor: 'admin' },
    ])
  })

  test('hooks are scenario-only — a plain DSL workflow never runs them', async () => {
    const order: string[] = []
    await runScenario(
      'hooksNotForWorkflows',
      {
        before: async () => {
          order.push('before')
        },
        after: async () => {
          order.push('after')
        },
        func: async () => {
          order.push('func')
          return { ok: true }
        },
      },
      { source: 'dsl' }
    )
    assert.deepEqual(order, ['func'])
  })
})
