import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { createScenarioRunner } from '@pikku/core/scenario'
import type { ScenarioActor } from '@pikku/core/services'
import type { ScenarioSurface } from '@pikku/core/workflow'
import { rpcService } from '@pikku/core/rpc'

import '../../.pikku/pikku-bootstrap.gen.js'
// Scenarios are not in the main bootstrap by design — a server must never
// import a step body — so a test that runs one has to opt in explicitly.
import '../../.pikku/pikku-bootstrap-scenarios.gen.js'
import { createConfig, createSingletonServices } from '../services.js'
import {
  resetSurfaceLog,
  surfaceLog,
} from '../workflows/scenario/surface-bindings.steps.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Scenarios emit under `.pikku/scenarios/` — they have their own bootstrap so a
// server never imports a step body — while plain workflows stay under
// `.pikku/workflow/`. Both are searched because this file asserts on each.
const META_DIRS = [
  join(__dirname, '../../.pikku/scenarios/meta'),
  join(__dirname, '../../.pikku/workflow/meta'),
]

async function loadMeta(name: string) {
  const files = META_DIRS.flatMap((dir) => [
    join(dir, `${name}-verbose.gen.json`),
    join(dir, `${name}.gen.json`),
  ])
  for (const f of files) {
    try {
      return JSON.parse(await readFile(f, 'utf-8'))
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err
    }
  }
  throw new Error(`Meta not found for workflow: ${name}`)
}

const fakeActor = (
  name: string
): ScenarioActor & { calls: Array<{ rpcName: string; data: any }> } => {
  const calls: Array<{ rpcName: string; data: any }> = []
  const invokeRaw = async (rpcName: string, data: any) => {
    calls.push({ rpcName, data })
    return {
      status: 200,
      ok: true,
      body: {
        id: data.orderId,
        customerId: 'customer-1',
        items: [],
        total: 0,
        status: 'processing',
        createdAt: 'now',
      },
    }
  }
  return {
    name,
    email: `${name}@actors.local`,
    calls,
    invokeRaw,
    invoke: async (rpcName: string, data: any) =>
      (await invokeRaw(rpcName, data)).body,
    converse: async () => {
      throw new Error(
        `[verifier] actor '${name}' has no agent — this verifier only exercises actor RPC steps`
      )
    },
  }
}

describe('pikkuScenario verification', () => {
  test('meta: scenario is inspected with source scenario and all steps', async () => {
    const meta = await loadMeta('orderHealthScenario')
    assert.equal(meta.source, 'scenario')

    const nodes: Record<string, any> = meta.nodes || {}
    assert.ok(
      nodes['customer fetches the order'],
      `actor step captured, got: ${Object.keys(nodes).join(', ')}`
    )
    assert.ok(nodes['internal re-read'], 'internal step captured')

    const rpcNodes = Object.values(nodes).filter((n: any) => n.rpcName)
    assert.ok(rpcNodes.length >= 2, 'both do-steps are rpc nodes')
    assert.ok(
      rpcNodes.every((n: any) => n.rpcName === 'orderGet'),
      'rpc steps resolve to the real RPC name'
    )
  })

  test('codegen: pikku.config.json scenarios.actors generates the typed registry', async () => {
    const gen =
      await import('../../.pikku/workflow/pikku-scenario-actors.gen.js')
    assert.deepEqual(Object.keys(gen.scenarioActorConfigs).sort(), [
      'customer',
      'ops',
    ])
    assert.equal(gen.scenarioActorConfigs.customer.jobTitle, 'Customer')

    const actors = gen.createScenarioActors({
      apiUrl: 'http://localhost:9999/api',
      secret: 'unused',
    })
    assert.equal(actors.customer.name, 'customer')
    assert.equal(typeof actors.ops.invoke, 'function')
  })

  test('runtime: actor steps route through injected actors, internal steps stay in-process', async () => {
    const customer = fakeActor('customer')
    const ops = fakeActor('ops')

    const { workflowService } = createScenarioRunner()
    const singletonServices = await createSingletonServices(
      await createConfig(),
      { workflowService }
    )
    const rpc = rpcService.getContextRPCService(
      singletonServices as any,
      {},
      false
    )

    const { runId } = await workflowService.startWorkflow(
      'orderHealthScenario',
      { orderId: 'order-7' },
      { type: 'test' },
      rpc,
      { actors: { customer, ops } }
    )

    const deadline = Date.now() + 10_000
    let run = await workflowService.getRun(runId)
    while (run && run.status !== 'completed' && run.status !== 'failed') {
      if (Date.now() > deadline) {
        throw new Error(`scenario timed out (status: ${run.status})`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
      run = await workflowService.getRun(runId)
    }

    assert.equal(run?.status, 'completed', `run failed: ${run?.error}`)
    assert.deepEqual(run?.output, { status: 'processing', sameOrder: true })

    assert.deepEqual(
      customer.calls,
      [{ rpcName: 'orderGet', data: { orderId: 'order-7' } }],
      'customer step went through the actor exactly once'
    )
    assert.ok(ops.calls.length >= 1, 'expectEventually polled as ops')
    assert.ok(
      ops.calls.every((c) => c.rpcName === 'orderGet'),
      'ops polled the expected RPC'
    )
  })
})

/**
 * Drives a scenario to completion on a given run surface and hands back the
 * finished run, so each surface test is one call rather than its own poll loop.
 */
const runScenario = async (
  workflowName: string,
  input: unknown,
  surface: ScenarioSurface
) => {
  resetSurfaceLog()
  const { workflowService, scenarioService } = createScenarioRunner()
  scenarioService.setRunSurface(surface)
  const singletonServices = await createSingletonServices(
    await createConfig(),
    {
      workflowService,
    }
  )
  const rpc = rpcService.getContextRPCService(
    singletonServices as any,
    {},
    false
  )

  // The in-memory engine runs the scenario inline and rethrows whatever the
  // step threw. Half of these tests are about a step that must throw, so the
  // throw is captured rather than escaping the helper.
  let thrown: unknown
  let runId: string | undefined
  try {
    ;({ runId } = await workflowService.startWorkflow(
      workflowName,
      input,
      { type: 'test' },
      rpc
    ))
  } catch (err) {
    thrown = err
  }

  if (!runId) {
    return { run: undefined, thrown }
  }

  const deadline = Date.now() + 10_000
  let run = await workflowService.getRun(runId)
  while (run && run.status !== 'completed' && run.status !== 'failed') {
    if (Date.now() > deadline) {
      throw new Error(`scenario timed out (status: ${run.status})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
    run = await workflowService.getRun(runId)
  }
  return { run, thrown }
}

describe('pikkuScenarioStep surface bindings', () => {
  test('meta: the surfaces a step declares are recorded for the coverage report', async () => {
    const meta = JSON.parse(
      await readFile(
        join(
          __dirname,
          '../../.pikku/scenarios/pikku-scenario-functions-meta.gen.json'
        ),
        'utf-8'
      )
    )
    assert.deepEqual(meta['submitsTheOrder']?.scenarioStepSurfaces, [
      'cli',
      'default',
    ])
    assert.deepEqual(meta['cancelsTheOrder']?.scenarioStepSurfaces, ['cli'])
  })

  test('an action runs exactly one binding — the run surface when it has one', async () => {
    const { run } = await runScenario(
      'surfaceBindingScenario',
      { orderId: 'order-1' },
      'cli'
    )
    assert.equal(run?.status, 'completed', `run failed: ${run?.error}`)
    assert.ok(
      surfaceLog.includes('submitsTheOrder:cli'),
      `expected the cli binding to run, got: ${surfaceLog.join(', ')}`
    )
    assert.ok(
      !surfaceLog.includes('submitsTheOrder:default'),
      'an action must not also run the fallback it did not need'
    )
  })

  test('an action falls back to default when the run surface has no binding', async () => {
    const { run } = await runScenario(
      'surfaceBindingScenario',
      { orderId: 'order-2' },
      'default'
    )
    assert.equal(run?.status, 'completed', `run failed: ${run?.error}`)
    assert.ok(
      surfaceLog.includes('submitsTheOrder:default'),
      `expected the default binding, got: ${surfaceLog.join(', ')}`
    )
  })

  test('an assertion runs every witness it has, surface first', async () => {
    const { run } = await runScenario(
      'surfaceBindingScenario',
      { orderId: 'order-3' },
      'cli'
    )
    assert.equal(run?.status, 'completed', `run failed: ${run?.error}`)
    const witnesses = surfaceLog.filter((entry) =>
      entry.startsWith('seesTheOrderSettled:')
    )
    assert.deepEqual(
      witnesses,
      ['seesTheOrderSettled:cli', 'seesTheOrderSettled:default'],
      'a then is not an alternative — both witnesses run, and the surface goes first so a wrong page is what fails'
    )
    assert.deepEqual(run?.output, { status: 'settled' })
  })

  test('a default run pays for one witness, not two', async () => {
    const { run } = await runScenario(
      'surfaceBindingScenario',
      { orderId: 'order-4' },
      'default'
    )
    assert.equal(run?.status, 'completed', `run failed: ${run?.error}`)
    assert.deepEqual(
      surfaceLog.filter((entry) => entry.startsWith('seesTheOrderSettled:')),
      ['seesTheOrderSettled:default']
    )
  })

  test('witnesses that disagree fail the run rather than reporting a pass', async () => {
    const { thrown } = await runScenario(
      'surfaceDisagreementScenario',
      { orderId: 'order-5' },
      'cli'
    )
    assert.match(
      String((thrown as Error)?.message),
      /observed different things on different surfaces/,
      'a page and a database that disagree is the bug the phase exists to catch'
    )
    assert.deepEqual((thrown as any)?.expected, {
      surface: 'cli',
      observed: { status: 'paid' },
    })
    assert.deepEqual((thrown as any)?.actual, {
      surface: 'default',
      observed: { status: 'pending' },
    })
  })

  test('an action with no binding for the run and no default fails loudly', async () => {
    const { thrown } = await runScenario(
      'surfaceUnrunnableScenario',
      { orderId: 'order-6' },
      'default'
    )
    assert.match(
      String((thrown as Error)?.message),
      /declares no binding for 'default'/
    )
    assert.deepEqual((thrown as any)?.declared, ['cli'])
  })
})
