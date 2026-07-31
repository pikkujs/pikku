import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createScenarioRunner } from './pikku-scenario-service.js'
import type { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import type { ScenarioPersona } from '../../services/personas-service.js'
import type { PikkuWire } from '../../types/core.types.js'
import type { ScenarioSurface } from './scenario-step.types.js'
import { requireActor, requireScenarioEnv } from './scenario-step-guards.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

const fakeActor = (
  name: string,
  handler: (rpcName: string, data: unknown) => Promise<unknown>
): ScenarioPersona & { calls: Array<{ rpcName: string; data: unknown }> } => {
  const calls: Array<{ rpcName: string; data: unknown }> = []
  return {
    name,
    email: `${name}@actors.local`,
    calls,
    invoke: async (rpcName: string, data: unknown) => {
      calls.push({ rpcName, data })
      return handler(rpcName, data)
    },
    invokeRaw: async (rpcName: string, data: unknown) => {
      calls.push({ rpcName, data })
      return { status: 200, ok: true, body: await handler(rpcName, data) }
    },
  }
}

const setup = async (
  ws: InMemoryWorkflowService,
  services: Record<string, unknown> = {}
) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
    ...services,
  } as any)
  const runId = await ws.createRun('scenarioTest', {}, true, 'hash', {
    type: 'test',
  } as any)
  ws.registerInlineRun(runId)
  return runId
}

describe('scenario actor steps (workflow.do with `actor`)', () => {
  beforeEach(() => resetPikkuState())

  test('routes through the actor over the real transport, never internal rpc', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const customer = fakeActor('customer', async () => ({ todoId: 't1' }))
    let internalCalls = 0

    const runId = await setup(ws)
    const rpc = {
      rpcWithWire: async () => {
        internalCalls++
        return {}
      },
    }

    const wire = ws.createWorkflowWire('scenarioTest', runId, rpc)
    const result = await wire.do(
      'customer creates todo',
      'createTodo',
      { title: 'x' },
      { actor: customer }
    )

    assert.deepEqual(result, { todoId: 't1' })
    assert.deepEqual(customer.calls, [
      { rpcName: 'createTodo', data: { title: 'x' } },
    ])
    assert.equal(internalCalls, 0, 'actor steps must NOT dispatch internally')
  })

  test('step is recorded durably and replay returns the cached result without re-invoking', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let invocations = 0
    const yasser = fakeActor('yasser', async () => ({ n: ++invocations }))
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    const first = await wire.do('step', 'someRpc', {}, { actor: yasser })
    assert.deepEqual(first, { n: 1 })

    await (ws as any).beginReplay(runId)
    const replayWire = ws.createWorkflowWire('scenarioTest', runId, {})
    const replayed = await replayWire.do(
      'step',
      'someRpc',
      {},
      { actor: yasser }
    )

    assert.deepEqual(replayed, { n: 1 }, 'replay must return the cached result')
    assert.equal(invocations, 1, 'the actor must not be re-invoked on replay')
  })

  test('actor steps never queue, even when the function is queue-eligible', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let queued = 0
    const customer = fakeActor('customer', async () => ({}))
    const runId = await setup(ws, {
      queueService: {
        add: async () => {
          queued++
        },
      },
    })
    pikkuState(null, 'function', 'meta').queuedRpc = {
      pikkuFuncId: 'queuedRpc',
      workflowQueued: true,
    } as any

    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.do('step', 'queuedRpc', {}, { actor: customer })

    assert.equal(queued, 0, 'actor steps are outbound HTTP — never queued')
    assert.equal(customer.calls.length, 1)
  })

  test('actor step failure surfaces the actor error and fails after retries', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const broken = fakeActor('broken', async () => {
      throw new Error("[scenario] 'createTodo' as 'broken' returned 403: nope")
    })
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.do('step', 'createTodo', {}, { actor: broken, retries: 2 }),
      /returned 403/
    )
    assert.equal(broken.calls.length, 2, 'retries bounds total attempts')
  })
})

const registerStep = (
  name: string,
  config: {
    description?: string
    surfaces?: ScenarioSurface[]
    func: (services: any, data: any, wire: PikkuWire) => Promise<unknown>
  }
) => {
  addFunction(name, config as any)
  pikkuState(null, 'function', 'meta')[name] = {
    pikkuFuncId: name,
    sessionless: true,
  } as any
}

describe('pikkuScenarioStep (scenario.step/given/when/then)', () => {
  beforeEach(() => resetPikkuState())

  test('the step func is called with the phase, step identity and data on the wire', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const seen: PikkuWire[] = []
    const payloads: unknown[] = []
    registerStep('buysAnApple', {
      func: async (_services, data, wire) => {
        seen.push(wire)
        payloads.push(data)
        return { receipt: 'r1' }
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    const result = await wire.given('shopper buys an apple', 'buysAnApple', {
      qty: 2,
    })

    assert.deepEqual(result, { receipt: 'r1' })
    assert.deepEqual(payloads, [{ qty: 2 }])
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.scenarioStep?.phase, 'given')
    assert.equal(seen[0]!.scenarioStep?.name, 'buysAnApple')
    assert.equal(seen[0]!.scenarioStep?.stepName, 'shopper buys an apple')
    assert.equal(seen[0]!.scenarioStep?.runId, runId)
  })

  test('each phase records itself, and the scenario wire is reachable from the step', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const phases: string[] = []
    registerStep('noop', {
      func: async (_services, _data, wire) => {
        phases.push(wire.scenarioStep!.phase)
        assert.equal(
          wire.scenario?.runId,
          wire.scenarioStep!.runId,
          'a step can call back into the scenario it belongs to'
        )
        return null
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.step('a', 'noop')
    await wire.given('b', 'noop')
    await wire.when('c', 'noop')
    await wire.then('d', 'noop')

    assert.deepEqual(phases, ['step', 'given', 'when', 'then'])
  })

  test('the actor is handed to the step rather than used to dispatch it', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const shopper = fakeActor('shopper', async () => ({ ok: true }))
    let received: unknown
    registerStep('checksOut', {
      func: async (_services, _data, wire) => {
        received = wire.scenarioStep!.actor
        return null
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.when('shopper checks out', 'checksOut', undefined, {
      actor: shopper,
    })

    assert.equal(received, shopper)
    assert.equal(
      shopper.calls.length,
      0,
      'a step runs locally — the actor is context, not the transport'
    )
  })

  test('a repeated step name gets its own durable row (#1), not the cached first result', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let calls = 0
    registerStep('clicksSave', {
      func: async () => ++calls,
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    const first = await wire.when('clicks save', 'clicksSave')
    const second = await wire.when('clicks save', 'clicksSave')

    assert.equal(first, 1)
    assert.equal(second, 2, 'the second reach must actually run')
    assert.equal((await ws.getStepState(runId, 'clicks save')).result, 1)
    assert.equal((await ws.getStepState(runId, 'clicks save#1')).result, 2)
  })

  test('a throwing step is not retried', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let attempts = 0
    registerStep('seesAReceipt', {
      func: async () => {
        attempts++
        throw new Error('expected 1 item, got 0')
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.then('shopper sees a receipt', 'seesAReceipt'),
      /expected 1 item, got 0/
    )
    assert.equal(
      attempts,
      1,
      'retrying a failed assertion is the wrong default for a test primitive'
    )
  })

  test('an explicit retries option still wins over the zero default', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let attempts = 0
    registerStep('flaky', {
      func: async () => {
        if (++attempts < 3) {
          throw new Error('not yet')
        }
        return 'settled'
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    const result = await wire.step('waits for the page', 'flaky', undefined, {
      retries: 3,
      retryDelay: 1,
    })

    assert.equal(result, 'settled')
    assert.equal(attempts, 3)
  })

  test('a browser step fails loudly when no provider is registered', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('browser')
    const shopper = fakeActor('shopper', async () => ({}))
    registerStep('visitsCheckout', {
      surfaces: ['browser'],
      func: async () => null,
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.given('shopper visits checkout', 'visitsCheckout', undefined, {
        actor: shopper,
      }),
      /no browser provider is registered/
    )
  })

  test('a registered provider hands the step a session keyed by the actor', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('browser')
    const shopper = fakeActor('shopper', async () => ({}))
    const requested: string[] = []
    const session = { actor: 'shopper' } as any
    scenarioService.setScenarioBrowserProvider({
      sessionFor: async (actorName: string) => {
        requested.push(actorName)
        return session
      },
    } as any)

    let handed: unknown
    registerStep('visitsCheckout', {
      surfaces: ['browser'],
      func: async (_services, _data, wire) => {
        handed = wire.browser
        return null
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.given('shopper visits checkout', 'visitsCheckout', undefined, {
      actor: shopper,
    })

    assert.deepEqual(requested, ['shopper'])
    assert.equal(handed, session)
  })

  test('an action step falls back to its default binding rather than failing', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('browser')
    const ran: ScenarioSurface[] = []
    registerStep('seedsAnAccount', {
      surfaces: ['default'],
      func: async (_services, _data, wire) => {
        ran.push(wire.scenarioStep!.surface)
        return null
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.given('an account exists', 'seedsAnAccount')

    assert.deepEqual(ran, ['default'], 'setup does not need a UI to be honest')
  })

  test('an action step with no runnable binding fails rather than silently skipping', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('cli')
    registerStep('clicksBuy', {
      surfaces: ['browser'],
      func: async () => null,
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.when('shopper buys it', 'clicksBuy'),
      /declares no binding for 'cli'/
    )
  })

  test('a then step runs every witness, surface first', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('browser')
    scenarioService.setScenarioBrowserProvider({
      sessionFor: async () => ({ actor: 'shopper' }) as any,
    } as any)
    const shopper = fakeActor('shopper', async () => ({}))
    const ran: ScenarioSurface[] = []
    registerStep('seesTheOrderConfirmed', {
      surfaces: ['browser', 'default'],
      func: async (_services, _data, wire) => {
        ran.push(wire.scenarioStep!.surface)
        return { status: 'paid' }
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.then(
      'shopper sees the order confirmed',
      'seesTheOrderConfirmed',
      undefined,
      { actor: shopper }
    )

    assert.deepEqual(ran, ['browser', 'default'])
  })

  test('the page saying something else than the database is a failure', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('browser')
    scenarioService.setScenarioBrowserProvider({
      sessionFor: async () => ({ actor: 'shopper' }) as any,
    } as any)
    const shopper = fakeActor('shopper', async () => ({}))
    registerStep('seesTheOrderConfirmed', {
      surfaces: ['browser', 'default'],
      func: async (_services, _data, wire) =>
        wire.scenarioStep!.surface === 'browser'
          ? { status: 'pending' }
          : { status: 'paid' },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.then(
        'shopper sees the order confirmed',
        'seesTheOrderConfirmed',
        undefined,
        { actor: shopper }
      ),
      /observed different things on different surfaces/
    )
  })

  test('a default run pays for only one witness', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const ran: ScenarioSurface[] = []
    registerStep('seesTheOrderConfirmed', {
      surfaces: ['browser', 'default'],
      func: async (_services, _data, wire) => {
        ran.push(wire.scenarioStep!.surface)
        return { status: 'paid' }
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.then('shopper sees the order confirmed', 'seesTheOrderConfirmed')

    assert.deepEqual(ran, ['default'])
  })

  test('an assertion with no witness for the run fails instead of passing having checked nothing', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    scenarioService.setRunSurface('cli')
    let ran = 0
    registerStep('seesTheBanner', {
      surfaces: ['browser'],
      func: async () => {
        ran++
        return { visible: true }
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.then('shopper sees the banner', 'seesTheBanner'),
      /has no witness to run on 'cli'/
    )
    assert.equal(ran, 0, 'nothing ran — which is exactly why it must not pass')
  })

  test('a browser-only assertion is not silently skipped by the fast suite', async () => {
    // The fast path is where this is most dangerous: `--run default` prints no
    // coverage line, so a skipped assertion would leave no trace at all.
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('seesTheBanner', {
      surfaces: ['browser'],
      func: async () => ({ visible: true }),
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.then('shopper sees the banner', 'seesTheBanner'),
      /has no witness to run on 'default'/
    )
  })

  test('a non-string step target is rejected instead of silently dispatching', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      (wire.step as any)('a name', async () => 'inline'),
      /string/i
    )
  })
})

describe('workflow.expectEventually', () => {
  beforeEach(() => resetPikkuState())

  test('polls as the actor until the predicate passes', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let polls = 0
    const sarah = fakeActor('sarah', async () => ({
      notifications: ++polls >= 3 ? ['ping'] : [],
    }))
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    const result = await wire.expectEventually(
      'sarah sees the notification',
      'getNotifications',
      {},
      (out: any) => out.notifications.length > 0,
      { actor: sarah, within: 2_000, interval: 5 }
    )

    assert.deepEqual(result, { notifications: ['ping'] })
    assert.equal(polls, 3)
  })

  test('fails with the last result when the deadline passes', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const sarah = fakeActor('sarah', async () => ({ notifications: [] }))
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})

    await assert.rejects(
      wire.expectEventually(
        'never arrives',
        'getNotifications',
        {},
        (out: any) => out.notifications.length > 0,
        { actor: sarah, within: 30, interval: 5, retries: 0 }
      ),
      /did not pass within 30ms.*notifications/
    )
  })

  test('polls internally (rpcWithWire) when no actor is given', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let polls = 0
    const runId = await setup(ws)
    const rpc = {
      rpcWithWire: async () => ({ ready: ++polls >= 2 }),
    }
    const wire = ws.createWorkflowWire('scenarioTest', runId, rpc)

    const result = await wire.expectEventually(
      'job finishes',
      'getJob',
      {},
      (out: any) => out.ready,
      { within: 2_000, interval: 5 }
    )
    assert.deepEqual(result, { ready: true })
    assert.equal(polls, 2)
  })
})

describe('scenario step input is recorded on the run', () => {
  beforeEach(() => resetPikkuState())

  test('the run records the input each step was called with', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('seesAddon', { func: async () => ({ visible: true }) })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.then('sees console', 'seesAddon', {
      packageName: '@pikku/addon-console',
      state: 'installed',
    })
    await wire.then('sees todos', 'seesAddon', {
      packageName: '@pikku/addon-todos',
    })

    const steps = await ws.getRunSteps(runId)
    assert.deepEqual(
      steps.map((step) => step.data),
      [
        { packageName: '@pikku/addon-console', state: 'installed' },
        { packageName: '@pikku/addon-todos' },
      ]
    )
  })

  test('a step called with no input records none', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('resets', { func: async () => null })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.given('resets the app', 'resets')

    const steps = await ws.getRunSteps(runId)
    assert.equal(steps[0]!.data ?? null, null)
  })
})

describe('scenario step names its function on the run', () => {
  beforeEach(() => resetPikkuState())

  test('the run records which step function ran, not only the step name', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('seesAddon', { func: async () => ({ visible: true }) })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.then('sees console', 'seesAddon', { packageName: 'console' })

    const steps = await ws.getRunSteps(runId)
    assert.equal(
      steps[0]!.rpcName,
      'seesAddon',
      'a reporter joins a step back to its declaration by function name'
    )
  })

  test('a step name built at runtime still names its function', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('seesAddon', { func: async () => ({ visible: true }) })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    for (const packageName of ['console', 'todos']) {
      await wire.then(`sees ${packageName}`, 'seesAddon', { packageName })
    }

    const steps = await ws.getRunSteps(runId)
    assert.deepEqual(
      steps.map((step) => [step.stepName, step.rpcName]),
      [
        ['sees console', 'seesAddon'],
        ['sees todos', 'seesAddon'],
      ]
    )
  })

  test('a plain inline step still records no function name', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.do('computes', async () => 1)

    const steps = await ws.getRunSteps(runId)
    assert.equal(steps[0]!.rpcName ?? null, null)
  })
})

describe('the scenario environment reaches the step wire', () => {
  beforeEach(() => resetPikkuState())

  test('a step reads the environment the run targets', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let seen: unknown
    registerStep('readsEnv', {
      func: async (_services, _data, wire) => {
        seen = wire.scenarioStep!.env
        return null
      },
    })
    scenarioService.setScenarioEnvironment({
      apiUrl: 'https://staging.example.com/api',
      appUrl: 'https://staging.example.com',
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.when('reads the environment', 'readsEnv')

    assert.deepEqual(seen, {
      apiUrl: 'https://staging.example.com/api',
      appUrl: 'https://staging.example.com',
    })
  })

  test('a run started without one carries no environment', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    let seen: unknown = 'unset'
    registerStep('readsEnv', {
      func: async (_services, _data, wire) => {
        seen = wire.scenarioStep!.env
        return null
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.when('reads the environment', 'readsEnv')

    assert.equal(seen, undefined)
  })
})

describe('requireActor / requireScenarioEnv', () => {
  beforeEach(() => resetPikkuState())

  test('requireActor returns the actor a step was called with', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    const shopper = fakeActor('shopper', async () => null)
    let resolved: unknown
    registerStep('needsAnActor', {
      func: async (_services, _data, wire) => {
        resolved = requireActor(wire.scenarioStep)
        return null
      },
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await wire.when('shopper acts', 'needsAnActor', undefined, {
      actor: shopper,
    })

    assert.equal(resolved, shopper)
  })

  test('requireActor names the step when it was called without one', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('needsAnActor', {
      func: async (_services, _data, wire) => requireActor(wire.scenarioStep),
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await assert.rejects(
      wire.when('nobody acts', 'needsAnActor'),
      /needsAnActor.*actor/s
    )
  })

  test('requireScenarioEnv returns the environment, or says how to declare one', async () => {
    const { workflowService: ws, scenarioService } = createScenarioRunner()
    registerStep('needsAnEnv', {
      func: async (_services, _data, wire) =>
        requireScenarioEnv(wire.scenarioStep),
    })

    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('scenarioTest', runId, {})
    await assert.rejects(
      wire.when('reads the api url', 'needsAnEnv'),
      /needsAnEnv.*environment/s
    )

    scenarioService.setScenarioEnvironment({
      apiUrl: 'http://localhost:4077/api',
    })
    const runId2 = await setup(ws)
    const wire2 = ws.createWorkflowWire('scenarioTest', runId2, {})
    assert.deepEqual(await wire2.when('reads the api url', 'needsAnEnv'), {
      apiUrl: 'http://localhost:4077/api',
    })
  })
})
