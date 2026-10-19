import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  ContextAwareRPCService,
  RPCNotFoundError,
  AddonNotUsedError,
  RemoteAddonFailedError,
  RemoteAddonTimeoutError,
  resolveNamespace,
  rpcService,
} from './rpc-runner.js'
import { RemoteAddonAuthError } from '../addon/remote-addon-auth.js'
import { wireAddon } from '../addon/wire-addon.js'
import {
  REMOTE_CONTRACT_HEADER,
  wireRemoteAddon,
} from '../addon/wire-remote-addon.js'
import { createSecretValue } from '../../classification/secret-value.js'
import {
  ForbiddenError,
  MissingSessionError,
  NotFoundError,
} from '../../errors/errors.js'
import { PikkuError, addError } from '../../errors/error-handler.js'

const createLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

const registerFunction = (
  funcName: string,
  func: (services: any, data: any, wire: any) => Promise<unknown> | unknown,
  {
    packageName = null,
    expose,
    pikkuFuncId,
    tags,
    scenarioStep,
  }: {
    packageName?: string | null
    expose?: boolean
    pikkuFuncId?: string
    tags?: string[]
    scenarioStep?: boolean
  } = {}
) => {
  addFunction(funcName, { func } as never, packageName)
  pikkuState(packageName, 'function', 'meta')[funcName] = {
    name: funcName,
    pikkuFuncId,
    sessionless: true,
    permissions: [],
    expose,
    tags,
    scenarioStep,
  } as never
}

const createServices = (overrides: Record<string, unknown> = {}) =>
  ({
    logger: createLogger(),
    ...overrides,
  }) as never

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', createServices())
})

describe('resolveNamespace', () => {
  test('returns null for non-namespaced functions', () => {
    assert.equal(resolveNamespace('plainFunction'), null)
  })

  test('returns null when namespace is not registered', () => {
    assert.equal(resolveNamespace('missing:func'), null)
  })

  test('resolves addon namespace to package and function', () => {
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
      auth: true,
      tags: ['addon-tag'],
    } as never)

    assert.deepEqual(resolveNamespace('stripe:createCharge'), {
      package: '@addon/stripe',
      function: 'createCharge',
      addonConfig: {
        package: '@addon/stripe',
        auth: true,
        tags: ['addon-tag'],
      },
    })
  })
})

describe('ContextAwareRPCService.rpc', () => {
  test('runs bare rpc functions through root rpc metadata', async () => {
    pikkuState(null, 'rpc', 'meta').echo = 'echoFunc'
    registerFunction('echoFunc', async (_services, data, wire) => ({
      data,
      traceId: wire.traceId,
    }))

    const service = new ContextAwareRPCService(
      createServices(),
      { traceId: 'trace-1' } as never,
      { requiresAuth: false }
    )

    const result = await service.rpc('echo', { hello: 'world' })

    assert.deepEqual(result, {
      data: { hello: 'world' },
      traceId: 'trace-1',
    })
  })

  test('uses package-scoped function meta before root rpc metadata', async () => {
    pikkuState(null, 'rpc', 'meta').echo = 'rootEchoFunc'
    registerFunction('rootEchoFunc', async () => ({ source: 'root' }))
    registerFunction(
      'packageEchoFunc',
      async () => ({ source: '@addon/pkg' }),
      {
        packageName: '@addon/pkg',
      }
    )
    pikkuState('@addon/pkg', 'function', 'meta').echo = {
      name: 'echo',
      pikkuFuncId: 'packageEchoFunc',
      sessionless: true,
      permissions: [],
    } as never

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {},
      '@addon/pkg'
    )

    const result = await service.rpc('echo', {})

    assert.deepEqual(result, { source: '@addon/pkg' })
  })

  test('falls back from versioned rpc names to the base metadata entry', async () => {
    pikkuState(null, 'rpc', 'meta').echo = 'echoFunc'
    registerFunction('echoFunc', async (_services, data) => data)

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    const result = await service.rpc('echo@v2', { ok: true })

    assert.deepEqual(result, { ok: true })
  })

  test('resolves internal root functions that are registered outside rpc metadata', async () => {
    registerFunction('pikkuWorkflowSleeper', async (_services, data) => ({
      sleeper: true,
      data,
    }))

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    const result = await service.rpc('pikkuWorkflowSleeper', {
      runId: 'run-1',
      stepId: 'step-1',
    })

    assert.deepEqual(result, {
      sleeper: true,
      data: {
        runId: 'run-1',
        stepId: 'step-1',
      },
    })
  })

  test('invokes addon functions with addon auth and tags', async () => {
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
      auth: false,
      tags: ['addon-tag'],
    } as never)
    registerFunction(
      'createCharge',
      async (_services, data, wire) => ({
        data,
        auth: wire.wireType,
      }),
      {
        packageName: '@addon/stripe',
        tags: ['function-tag'],
      }
    )

    pikkuState('@addon/stripe', 'function', 'meta').createCharge = {
      name: 'createCharge',
      sessionless: true,
      permissions: [],
      tags: ['function-tag'],
    } as never

    const service = new ContextAwareRPCService(
      createServices({
        logger: createLogger(),
      }),
      { wireType: 'http', wireId: 'wire-1' } as never,
      { requiresAuth: true }
    )

    const result = await service.rpc('stripe:createCharge', { amount: 10 })

    assert.deepEqual(result, {
      data: { amount: 10 },
      auth: 'http',
    })
  })

  test('an addon may call only the addons it lists in uses', async () => {
    pikkuState(null, 'addons', 'packages').set('mail', {
      package: '@addon/mail',
      uses: { '@addon/stripe': 'stripe' },
    } as never)
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as never)
    pikkuState(null, 'addons', 'packages').set('crm', {
      package: '@addon/crm',
    } as never)
    registerFunction('createCharge', async (_services, data) => data, {
      packageName: '@addon/stripe',
    })
    pikkuState('@addon/stripe', 'function', 'meta').createCharge = {
      name: 'createCharge',
      sessionless: true,
      permissions: [],
    } as never

    const service = new ContextAwareRPCService(
      createServices({ logger: createLogger() }),
      { wireType: 'http', wireId: 'wire-1', addonNamespace: 'mail' } as never,
      { requiresAuth: false }
    )

    assert.deepEqual(
      await service.rpc('@addon/stripe:createCharge', { amount: 1 }),
      { amount: 1 }
    )
    await assert.rejects(
      () => service.rpc('crm:getContact', {}),
      AddonNotUsedError
    )
    await assert.rejects(
      () => service.rpc('stripe:createCharge', {}),
      AddonNotUsedError
    )
  })

  test('falls back to deploymentService when rpc meta is missing', async () => {
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
            return { remote: true }
          },
        },
      }),
      {
        traceId: 'trace-2',
        getSession: async () => ({ userId: 'user-1' }),
      } as never,
      {}
    )

    const result = await service.rpc('missingRpc', { value: 1 })

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(calls, [
      ['missingRpc', { value: 1 }, { userId: 'user-1' }, 'trace-2'],
    ])
  })

  test('throws RPCNotFoundError when rpc is missing and no deploymentService exists', async () => {
    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(() => service.rpc('missingRpc', {}), RPCNotFoundError)
  })
})

describe('RPCNotFoundError raised from inside a resolved function', () => {
  test('a local function that throws RPCNotFoundError is not re-dispatched remotely', async () => {
    const sideEffects: string[] = []
    const remoteCalls: unknown[][] = []

    pikkuState(null, 'rpc', 'meta').chargeCard = 'chargeCardFunc'
    registerFunction('chargeCardFunc', async () => {
      sideEffects.push('charged')
      throw new RPCNotFoundError('doesNotExist')
    })

    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpc('chargeCard', { amount: 10 }),
      (error: unknown) => {
        assert.ok(error instanceof RPCNotFoundError)
        assert.equal(error.rpcName, 'doesNotExist')
        return true
      }
    )

    assert.deepEqual(sideEffects, ['charged'])
    assert.deepEqual(remoteCalls, [])
  })

  test('an addon function that throws RPCNotFoundError is not retried locally or remotely', async () => {
    const sideEffects: string[] = []
    const remoteCalls: unknown[][] = []

    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as never)
    registerFunction(
      'createCharge',
      async () => {
        sideEffects.push('charged')
        throw new RPCNotFoundError('doesNotExist')
      },
      { packageName: '@addon/stripe' }
    )

    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpc('stripe:createCharge', { amount: 10 }),
      (error: unknown) => {
        assert.ok(error instanceof RPCNotFoundError)
        assert.equal(error.rpcName, 'doesNotExist')
        return true
      }
    )

    assert.deepEqual(sideEffects, ['charged'])
    assert.deepEqual(remoteCalls, [])
  })

  test('rpcWithWire does not re-dispatch a local function that throws RPCNotFoundError', async () => {
    const sideEffects: string[] = []
    const remoteCalls: unknown[][] = []

    pikkuState(null, 'rpc', 'meta').chargeCard = 'chargeCardFunc'
    registerFunction('chargeCardFunc', async () => {
      sideEffects.push('charged')
      throw new RPCNotFoundError('doesNotExist')
    })

    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpcWithWire('chargeCard', { amount: 10 }, {} as never),
      RPCNotFoundError
    )

    assert.deepEqual(sideEffects, ['charged'])
    assert.deepEqual(remoteCalls, [])
  })

  test('a genuinely missing namespaced rpc still throws RPCNotFoundError', async () => {
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as never)

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpc('stripe:missingFunc', {}),
      (error: unknown) => {
        assert.ok(error instanceof RPCNotFoundError)
        assert.equal(
          error.message,
          'RPC function not found: stripe:missingFunc'
        )
        return true
      }
    )
  })

  test('a missing namespaced rpc still reaches deploymentService when one is configured', async () => {
    const remoteCalls: unknown[][] = []
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as never)

    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      { traceId: 'trace-addon' } as never,
      {}
    )

    const result = await service.rpc('stripe:missingFunc', { value: 3 })

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(remoteCalls, [
      ['stripe:missingFunc', { value: 3 }, undefined, 'trace-addon'],
    ])
  })

  test('an unknown namespace still falls through to the local/remote lookup', async () => {
    const remoteCalls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      { traceId: 'trace-ns' } as never,
      {}
    )

    const result = await service.rpc('unknownNs:someFunc', { value: 1 })

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(remoteCalls, [
      ['unknownNs:someFunc', { value: 1 }, undefined, 'trace-ns'],
    ])
  })
})

describe('ContextAwareRPCService.rpcExposed', () => {
  test('resolves unversioned exposed rpc names through latest rpc metadata', async () => {
    pikkuState(null, 'rpc', 'meta').listCards = 'listCards@v2'
    registerFunction(
      'listCards@v2',
      async (_services, data) => ({ data, version: 2 }),
      {
        expose: true,
      }
    )

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    const result = await service.rpcExposed('listCards', { ok: true })

    assert.deepEqual(result, {
      data: { ok: true },
      version: 2,
    })
  })

  test('throws when the function does not exist', async () => {
    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('missingRpc', {}),
      RPCNotFoundError
    )
  })

  test('throws RPCNotFoundError when the function is not exposed', async () => {
    pikkuState(null, 'rpc', 'meta').hiddenFunc = 'hiddenFunc'
    registerFunction('hiddenFunc', async () => ({ ok: true }), {
      expose: false,
    })

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('hiddenFunc', {}),
      RPCNotFoundError
    )
  })

  test('a scenario step is not callable over the network, even if marked exposed', async () => {
    pikkuState(null, 'rpc', 'meta').seesAddonCard = 'seesAddonCard'
    registerFunction('seesAddonCard', async () => ({ visible: true }), {
      expose: true,
      scenarioStep: true,
    })

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('seesAddonCard', {}),
      RPCNotFoundError
    )
  })

  test('runs exposed addon functions', async () => {
    pikkuState(null, 'addons', 'packages').set('addon', {
      package: '@addon/pkg',
      expose: true,
    } as never)
    registerFunction(
      'visibleFunc',
      async (_services, data) => ({ data, source: 'addon' }),
      {
        packageName: '@addon/pkg',
        expose: true,
      }
    )

    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    const result = await service.rpcExposed('addon:visibleFunc', {
      ok: true,
    })

    assert.deepEqual(result, { data: { ok: true }, source: 'addon' })
  })

  const wireExposeAddon = (expose: boolean | string[] | undefined) => {
    wireAddon({ name: 'shop', package: '@shop/pkg', expose })
    registerFunction('declared', async () => ({ ran: 'declared' }), {
      packageName: '@shop/pkg',
      expose: true,
    })
    registerFunction('undeclared', async () => ({ ran: 'undeclared' }), {
      packageName: '@shop/pkg',
    })
    return new ContextAwareRPCService(createServices(), {} as never, {})
  }

  const reachable = async (service: ContextAwareRPCService, fn: string) => {
    try {
      await service.rpcExposed(`shop:${fn}`, {})
      return true
    } catch (e) {
      if (e instanceof RPCNotFoundError) return false
      throw e
    }
  }

  // [wiring expose, declared reachable, undeclared reachable]
  const matrix: Array<[boolean | string[] | undefined, boolean, boolean]> = [
    [undefined, false, false],
    [false, false, false],
    [true, true, false],
    [['declared'], true, false],
    [['undeclared'], false, false],
    [['declared', 'undeclared'], true, false],
    [[], false, false],
  ]
  for (const [expose, declared, undeclared] of matrix) {
    test(`wireAddon expose ${JSON.stringify(expose)} reaches declared=${declared} undeclared=${undeclared}`, async () => {
      const service = wireExposeAddon(expose)
      assert.equal(await reachable(service, 'declared'), declared)
      assert.equal(await reachable(service, 'undeclared'), undeclared)
    })
  }

  test('two instances of one package expose independently', async () => {
    wireAddon({ name: 'open', package: '@shop/pkg', expose: true })
    const service = wireExposeAddon(false)
    assert.deepEqual(await service.rpcExposed('open:declared', {}), {
      ran: 'declared',
    })
    await assert.rejects(
      () => service.rpcExposed('shop:declared', {}),
      RPCNotFoundError
    )
  })

  test('an exposed function of an auth: true instance still needs a session', async () => {
    wireAddon({
      name: 'shop',
      package: '@shop/pkg',
      auth: true,
      expose: ['declared'],
    })
    registerFunction('declared', async () => ({ ran: 'declared' }), {
      packageName: '@shop/pkg',
      expose: true,
    })

    await assert.rejects(
      () =>
        new ContextAwareRPCService(
          createServices(),
          {} as never,
          {}
        ).rpcExposed('shop:declared', {}),
      MissingSessionError
    )
    assert.deepEqual(
      await new ContextAwareRPCService(
        createServices(),
        { session: { userId: 'u1' } } as never,
        {}
      ).rpcExposed('shop:declared', {}),
      { ran: 'declared' }
    )
  })

  test('an addon whose wiring sets no expose is not forwarded to another deploy unit', async () => {
    const calls: unknown[] = []
    wireAddon({ name: 'shop', package: '@shop/pkg' })
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => calls.push(args),
        },
      }),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('shop:anything', {}),
      RPCNotFoundError
    )
    assert.equal(calls.length, 0)
  })

  test('a function the wiring refuses is not forwarded to another deploy unit', async () => {
    const calls: unknown[] = []
    wireAddon({ name: 'shop', package: '@shop/pkg', expose: ['listed'] })
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
            return { remote: true }
          },
        },
      }),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('shop:unlisted', {}),
      RPCNotFoundError
    )
    assert.deepEqual(await service.rpcExposed('shop:listed', {}), {
      remote: true,
    })
    assert.equal(calls.length, 1)
  })
})

describe('ContextAwareRPCService.rpcWithWire', () => {
  test('merges wire data for local rpc calls', async () => {
    pikkuState(null, 'rpc', 'meta').echo = 'echoFunc'
    registerFunction('echoFunc', async (_services, _data, wire) => ({
      traceId: wire.traceId,
      custom: wire.custom,
    }))

    const service = new ContextAwareRPCService(
      createServices(),
      { traceId: 'base-trace' } as never,
      {}
    )

    const result = await service.rpcWithWire('echo', {}, {
      custom: 'merged',
    } as never)

    assert.deepEqual(result, {
      traceId: 'base-trace',
      custom: 'merged',
    })
  })

  test('falls back to deploymentService for rpcWithWire when local rpc is missing', async () => {
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
            return { remote: true }
          },
        },
      }),
      { traceId: 'trace-3', session: { userId: 'user-2' } } as never,
      {}
    )

    const result = await service.rpcWithWire('missingRpc', { value: 2 }, {
      custom: 'wire',
    } as never)

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(calls, [
      ['missingRpc', { value: 2 }, { userId: 'user-2' }, 'trace-3'],
    ])
  })

  test('a missing namespaced rpc still reaches deploymentService through rpcWithWire', async () => {
    const remoteCalls: unknown[][] = []
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as never)

    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      { traceId: 'trace-addon-wire' } as never,
      {}
    )

    const result = await service.rpcWithWire(
      'stripe:missingFunc',
      { value: 3 },
      { custom: 'wire' } as never
    )

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(remoteCalls, [
      ['stripe:missingFunc', { value: 3 }, undefined, 'trace-addon-wire'],
    ])
  })

  test('an unknown namespace still falls through to the local/remote lookup', async () => {
    const remoteCalls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      { traceId: 'trace-ns-wire' } as never,
      {}
    )

    const result = await service.rpcWithWire(
      'unknownNs:someFunc',
      { value: 1 },
      { custom: 'wire' } as never
    )

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(remoteCalls, [
      ['unknownNs:someFunc', { value: 1 }, undefined, 'trace-ns-wire'],
    ])
  })

  test('the deployment fallback runs under the wire the caller passed, not the ambient one', async () => {
    const remoteCalls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            remoteCalls.push(args)
            return { remote: true }
          },
        },
      }),
      {
        traceId: 'ambient-trace',
        session: { userId: 'ambient-user' },
      } as never,
      {}
    )

    const result = await service.rpcWithWire(
      'unknownNs:someFunc',
      { value: 1 },
      {
        traceId: 'caller-trace',
        session: { userId: 'caller-user' },
      } as never
    )

    assert.deepEqual(result, { remote: true })
    assert.deepEqual(
      remoteCalls,
      [
        [
          'unknownNs:someFunc',
          { value: 1 },
          { userId: 'caller-user' },
          'caller-trace',
        ],
      ],
      'the remote hop ran under the ambient wire, so an explicit wire is honoured locally but dropped across the deployment boundary'
    )
  })
})

describe('ContextAwareRPCService.startWorkflow', () => {
  test('throws when workflowService is unavailable', async () => {
    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.startWorkflow('workflowA', {}),
      /WorkflowService service not available/
    )
  })

  test('passes derived wire metadata into workflowService.startWorkflow', async () => {
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        workflowService: {
          startWorkflow: async (...args: unknown[]) => {
            calls.push(args)
            return { runId: 'run-1' }
          },
        },
      }),
      {
        wireType: 'rpc',
        wireId: 'rpc-1',
        pikkuUserId: 'user-3',
        workflowStep: { runId: 'parent-run-1' },
      } as never,
      {}
    )

    const result = await service.startWorkflow('workflowA', { ok: true })

    assert.deepEqual(result, { runId: 'run-1' })
    assert.deepEqual(calls[0]?.slice(0, 3), [
      'workflowA',
      { ok: true },
      {
        type: 'rpc',
        id: 'rpc-1',
        parentRunId: 'parent-run-1',
        pikkuUserId: 'user-3',
      },
    ])
  })
})

describe('ContextAwareRPCService.mesh', () => {
  test('throws when deploymentService is unavailable', async () => {
    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.mesh('remoteFunc', {}),
      /No DeploymentService configured for mesh RPC: remoteFunc/
    )
  })

  test('uses deploymentService with session and trace id', async () => {
    const calls: unknown[][] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (...args: unknown[]) => {
            calls.push(args)
            return { ok: true }
          },
        },
      }),
      {
        traceId: 'trace-4',
        getSession: async () => ({ userId: 'user-4' }),
      } as never,
      {}
    )

    const result = await service.mesh('remoteFunc', { hi: true })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(calls, [
      ['remoteFunc', { hi: true }, { userId: 'user-4' }, 'trace-4'],
    ])
  })
})

describe('multi-instance addons', () => {
  const createSecretService = () => ({
    getSecret: async (key: string) => createSecretValue(`secret:${key}`),
    hasSecret: async () => true,
    setSecret: async () => {},
    deleteSecret: async () => {},
    getSecrets: async () => ({}),
  })

  test('resolves per-instance secretOverrides and caches singletons per namespace', async () => {
    const createdServices: any[] = []
    pikkuState('@addon/slack', 'package', 'factories', {
      createSingletonServices: async (_config: any, parent: any) => {
        const token = (await parent.secrets.getSecret('slackToken')).reveal()
        const svc = { logger: createLogger(), token }
        createdServices.push(svc)
        return svc
      },
    } as never)
    pikkuState('@addon/slack', 'package', 'declaredSecrets', ['slackToken'])
    registerFunction(
      'send',
      async (services: any) => ({ token: services.token }),
      {
        packageName: '@addon/slack',
      }
    )

    wireAddon({
      name: 'slack-marketing',
      package: '@addon/slack',
      secretOverrides: { slackToken: 'marketing_secret' },
    })
    wireAddon({
      name: 'slack-support',
      package: '@addon/slack',
      secretOverrides: { slackToken: 'support_secret' },
    })

    const service = new ContextAwareRPCService(
      createServices({ secrets: createSecretService() }),
      {} as never,
      { requiresAuth: false }
    )

    const marketing = await service.rpc('slack-marketing:send', {})
    const support = await service.rpc('slack-support:send', {})

    assert.deepEqual(marketing, { token: 'secret:marketing_secret' })
    assert.deepEqual(support, { token: 'secret:support_secret' })
    assert.equal(createdServices.length, 2)
    assert.notEqual(createdServices[0], createdServices[1])
  })

  test('reuses the same per-namespace singleton across intra-addon sibling calls', async () => {
    let factoryCalls = 0
    pikkuState('@addon/slack', 'package', 'factories', {
      createSingletonServices: async (_config: any, parent: any) => {
        factoryCalls++
        return {
          logger: createLogger(),
          token: (await parent.secrets.getSecret('slackToken')).reveal(),
        }
      },
    } as never)
    pikkuState('@addon/slack', 'package', 'declaredSecrets', ['slackToken'])

    registerFunction(
      'leaf',
      async (services: any) => ({ token: services.token }),
      {
        packageName: '@addon/slack',
      }
    )
    registerFunction(
      'root',
      async (_services: any, _data: any, wire: any) =>
        wire.rpc.invoke('leaf', {}),
      { packageName: '@addon/slack' }
    )

    wireAddon({
      name: 'slack-marketing',
      package: '@addon/slack',
      secretOverrides: { slackToken: 'marketing_secret' },
    })

    const service = new ContextAwareRPCService(
      createServices({ secrets: createSecretService() }),
      {} as never,
      { requiresAuth: false }
    )

    const result = await service.rpc('slack-marketing:root', {})

    assert.deepEqual(result, { token: 'secret:marketing_secret' })
    assert.equal(factoryCalls, 1)
  })

  test('resolves per-instance credentialOverrides via wire.getCredential', async () => {
    pikkuState('@addon/slack', 'package', 'factories', {
      createSingletonServices: async () => ({ logger: createLogger() }),
    } as never)
    registerFunction(
      'whoami',
      async (_services: any, _data: any, wire: any) => ({
        cred: await wire.getCredential('slack'),
      }),
      { packageName: '@addon/slack' }
    )

    wireAddon({
      name: 'slack-marketing',
      package: '@addon/slack',
      credentialOverrides: { slack: 'marketing_cred' },
    })
    wireAddon({
      name: 'slack-support',
      package: '@addon/slack',
      credentialOverrides: { slack: 'support_cred' },
    })

    const credentialService = {
      getAll: async (_userId: string) => ({
        marketing_cred: { token: 'm' },
        support_cred: { token: 's' },
      }),
    }

    const service = new ContextAwareRPCService(
      createServices({ credentialService }),
      { pikkuUserId: 'user-1' } as never,
      { requiresAuth: false }
    )

    const marketing = await service.rpc('slack-marketing:whoami', {})
    const support = await service.rpc('slack-support:whoami', {})

    assert.deepEqual(marketing, { cred: { token: 'm' } })
    assert.deepEqual(support, { cred: { token: 's' } })
  })
})

describe('wireRemoteAddon dispatch', () => {
  const realFetch = globalThis.fetch
  let calls: Array<{ url: string; init: any }> = []

  const stubFetch = (
    response: { status?: number; body?: unknown; raw?: string } = {}
  ): void => {
    const { status = 200, body = { ok: true }, raw } = response
    calls = []
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () =>
          raw ?? (body === undefined ? '' : JSON.stringify(body)),
      }
    }) as any
  }

  const wireRegistry = (extra: Record<string, unknown> = {}) =>
    wireRemoteAddon({
      name: 'registry',
      package: '@acme/addon-registry',
      serverUrl: 'https://api.example.com',
      ...extra,
    })

  const restoreFetch = () => {
    globalThis.fetch = realFetch
  }

  const secretService = () =>
    ({
      getSecret: async (key: string) =>
        createSecretValue(`secret-value-for-${key}`),
      getSecrets: async () => ({}),
      hasSecret: async () => true,
      setSecret: async () => {},
      deleteSecret: async () => {},
    }) as never

  test('POSTs to the public /rpc/<fn> route with { rpcName, data } and a platform bearer token', async () => {
    stubFetch({ body: { echoed: 42 } })
    try {
      wireRemoteAddon({
        name: 'registry',
        package: '@pikkustudio/addon-registry',
        serverUrl: 'https://api.example.com/',
        auth: { secretId: 'REGISTRY_TOKEN' },
      })

      const service = new ContextAwareRPCService(
        createServices({ secrets: secretService() }),
        { traceId: 'trace-r' } as never,
        {}
      )

      const result = await service.rpc('registry:getOpenApi', {
        name: 'stripe',
      })

      assert.deepEqual(result, { echoed: 42 })
      assert.equal(calls.length, 1)
      assert.equal(calls[0]!.url, 'https://api.example.com/rpc/getOpenApi')
      assert.equal(calls[0]!.init.method, 'POST')
      assert.deepEqual(JSON.parse(calls[0]!.init.body), {
        rpcName: 'getOpenApi',
        data: { name: 'stripe' },
      })
      assert.equal(
        calls[0]!.init.headers.authorization,
        'Bearer secret-value-for-REGISTRY_TOKEN'
      )
      assert.equal(
        calls[0]!.init.headers['x-request-id'],
        'trace-r',
        'a remote RPC must send the trace id under the header the receiving ' +
          'runner reads, or the trace chain breaks at the hop'
      )
      assert.equal(
        calls[0]!.init.headers[REMOTE_CONTRACT_HEADER],
        '1',
        'the host holds the call to its remote contract only when told'
      )
    } finally {
      restoreFetch()
    }
  })

  test('resolves a per-user credential token via wire.getCredential', async () => {
    stubFetch()
    try {
      wireRemoteAddon({
        name: 'registry',
        package: '@pikkustudio/addon-registry',
        serverUrl: () => 'https://api.example.com',
        auth: { credentialId: 'cloudRegistryToken' },
      })

      const service = new ContextAwareRPCService(
        createServices(),
        {
          pikkuUserId: 'user-9',
          getCredential: async (name: string) =>
            name === 'cloudRegistryToken' ? 'user-token-9' : null,
        } as never,
        {}
      )

      await service.rpc('registry:getOpenApi', {})
      assert.equal(calls[0]!.init.headers.authorization, 'Bearer user-token-9')
    } finally {
      restoreFetch()
    }
  })

  test('omits the Authorization header for a public (no auth) surface', async () => {
    stubFetch()
    try {
      wireRemoteAddon({
        name: 'registry',
        package: '@pikkustudio/addon-registry',
        serverUrl: 'https://api.example.com',
      })

      const service = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )

      await service.rpc('registry:listOpenApis', {})
      assert.equal(calls[0]!.init.headers.authorization, undefined)
    } finally {
      restoreFetch()
    }
  })

  test('fails closed when a bound credential resolves empty', async () => {
    stubFetch()
    try {
      wireRemoteAddon({
        name: 'registry',
        package: '@pikkustudio/addon-registry',
        serverUrl: 'https://api.example.com',
        auth: { credentialId: 'cloudRegistryToken' },
      })

      const service = new ContextAwareRPCService(
        createServices(),
        { getCredential: async () => null } as never,
        {}
      )

      await assert.rejects(
        () => service.rpc('registry:getOpenApi', {}),
        RemoteAddonAuthError
      )
      assert.equal(calls.length, 0)
    } finally {
      restoreFetch()
    }
  })

  test("a call without a version goes to the latest version in the consumer's SDK", async () => {
    stubFetch()
    try {
      wireRegistry()
      // What codegen registers from the SDK the consumer built against.
      pikkuState('@acme/addon-registry', 'rpc', 'meta', {
        getOpenApi: 'getOpenApi@v2',
      })
      const service = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )

      await service.rpc('registry:getOpenApi', {})

      assert.equal(calls[0]!.url, 'https://api.example.com/rpc/getOpenApi%40v2')
      assert.equal(JSON.parse(calls[0]!.init.body).rpcName, 'getOpenApi@v2')
    } finally {
      restoreFetch()
    }
  })

  test('an explicit version is sent as it is', async () => {
    stubFetch()
    try {
      wireRegistry()
      pikkuState('@acme/addon-registry', 'rpc', 'meta', {
        getOpenApi: 'getOpenApi@v2',
      })
      const service = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )

      await service.rpc('registry:getOpenApi@v1', {})

      assert.equal(JSON.parse(calls[0]!.init.body).rpcName, 'getOpenApi@v1')
    } finally {
      restoreFetch()
    }
  })

  test('remaps the function name and encodes it into the path', async () => {
    stubFetch()
    try {
      wireRegistry({ remoteName: (fn: string) => `v2/${fn}` })
      const service = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )

      await service.rpc('registry:getOpenApi', { name: 'x' })

      assert.equal(calls[0]!.url, 'https://api.example.com/rpc/v2%2FgetOpenApi')
      assert.deepEqual(JSON.parse(calls[0]!.init.body), {
        rpcName: 'v2/getOpenApi',
        data: { name: 'x' },
      })
    } finally {
      restoreFetch()
    }
  })

  test('adds the headers hook, but never over the auth, trace or contract headers', async () => {
    stubFetch()
    try {
      wireRegistry({
        auth: { secretId: 'REGISTRY_TOKEN' },
        headers: async (_services: unknown, wire: any) => ({
          'x-tenant': wire.traceId,
          Authorization: 'Bearer forged',
          'X-Pikku-Remote-Contract': '0',
          'X-Request-Id': 'forged',
        }),
      })
      const service = new ContextAwareRPCService(
        createServices({ secrets: secretService() }),
        { traceId: 'trace-h' } as never,
        {}
      )

      await service.rpc('registry:getOpenApi', {})

      const headers = calls[0]!.init.headers
      assert.equal(headers['x-tenant'], 'trace-h')
      assert.equal(
        headers.authorization,
        'Bearer secret-value-for-REGISTRY_TOKEN'
      )
      assert.equal(headers.Authorization, undefined)
      assert.equal(headers['X-Pikku-Remote-Contract'], undefined)
      assert.equal(headers['X-Request-Id'], undefined)
      assert.equal(headers[REMOTE_CONTRACT_HEADER], '1')
      assert.equal(headers['x-request-id'], 'trace-h')
    } finally {
      restoreFetch()
    }
  })

  test('aborts a call that outlives timeoutMs with RemoteAddonTimeoutError', async () => {
    calls = []
    globalThis.fetch = ((url: any, init: any) => {
      calls.push({ url: String(url), init })
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      })
    }) as any
    try {
      wireRegistry({ timeoutMs: 20 })
      const service = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )

      await assert.rejects(
        () => service.rpc('registry:getOpenApi', {}),
        RemoteAddonTimeoutError
      )
    } finally {
      restoreFetch()
    }
  })

  test('returns undefined for an empty 2xx body', async () => {
    stubFetch({ status: 204, body: undefined })
    try {
      wireRegistry()
      const service = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )

      assert.equal(await service.rpc('registry:ping', {}), undefined)
    } finally {
      restoreFetch()
    }
  })
})

describe('wireRemoteAddon error mapping', () => {
  const realFetch = globalThis.fetch
  let logged: string[] = []

  const answer = (status: number, raw: string) => {
    globalThis.fetch = (async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => raw,
    })) as any
  }

  const call = () => {
    wireRemoteAddon({
      name: 'registry',
      package: '@acme/addon-registry',
      serverUrl: 'https://api.example.com',
    })
    logged = []
    const service = new ContextAwareRPCService(
      createServices({
        logger: { ...createLogger(), error: (m: string) => logged.push(m) },
      }),
      {} as never,
      {}
    )
    return service.rpc('registry:getOpenApi', {})
  }

  const rejection = async (): Promise<any> => {
    try {
      await call()
    } catch (e) {
      return e
    } finally {
      globalThis.fetch = realFetch
    }
    assert.fail('the call should have thrown')
  }

  test('rebuilds a registered PikkuError with the host status and message', async () => {
    class SpecNotFoundError extends PikkuError {}
    addError(SpecNotFoundError, { status: 404, message: 'No such spec.' })
    answer(
      404,
      JSON.stringify({
        name: 'SpecNotFoundError',
        message: 'No spec named stripe',
        payload: { secret: 'x' },
      })
    )

    const error = await rejection()

    assert.ok(error instanceof SpecNotFoundError)
    assert.equal(error.name, 'SpecNotFoundError')
    assert.equal(error.message, 'No spec named stripe')
    assert.equal(
      error.payload,
      undefined,
      'the host body is not passed through'
    )
  })

  test('rebuilds a standard error by name', async () => {
    answer(403, JSON.stringify({ name: 'ForbiddenError', message: 'Nope' }))

    const error = await rejection()

    assert.ok(error instanceof ForbiddenError)
    assert.equal(error.message, 'Nope')
  })

  test('does not trust a registered name sent with another status', async () => {
    answer(500, JSON.stringify({ name: 'ForbiddenError', message: 'Nope' }))

    const error = await rejection()

    assert.ok(error instanceof RemoteAddonFailedError)
    assert.ok(!(error instanceof ForbiddenError))
  })

  test('gives an unknown 4xx the generic error for its status, without the body', async () => {
    answer(
      404,
      JSON.stringify({ name: 'HostOnlyError', message: 'table users missing' })
    )

    const error = await rejection()

    assert.ok(error instanceof NotFoundError)
    assert.doesNotMatch(error.message, /table users/)
  })

  test('gives an unparseable 4xx body the generic error for its status', async () => {
    answer(403, '<html>at /srv/app.js:12</html>')

    const error = await rejection()

    assert.ok(error instanceof ForbiddenError)
    assert.doesNotMatch(error.message, /srv/)
  })

  test('turns a 5xx into RemoteAddonFailedError, logging the body here only', async () => {
    answer(500, JSON.stringify({ message: 'at Db.query (/srv/db.js:9)' }))

    const error = await rejection()

    assert.ok(error instanceof RemoteAddonFailedError)
    assert.doesNotMatch(error.message, /srv/)
    assert.equal(logged.length, 1)
    assert.match(logged[0]!, /answered 500: .*srv\/db\.js/)
  })

  test('turns an unreachable host into RemoteAddonFailedError', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed')
    }) as any

    const error = await rejection()

    assert.ok(error instanceof RemoteAddonFailedError)
    assert.match(logged[0]!, /could not be reached: fetch failed/)
  })

  test('turns a 2xx body that is not JSON into RemoteAddonFailedError', async () => {
    answer(200, 'not json')

    assert.ok((await rejection()) instanceof RemoteAddonFailedError)
  })
})

describe('rpcExposed and remote addons', () => {
  const realFetch = globalThis.fetch
  let urls: string[] = []

  beforeEach(() => {
    urls = []
    globalThis.fetch = (async (url: any) => {
      urls.push(String(url))
      return { ok: true, status: 200, text: async () => '{"ok":true}' }
    }) as any
  })

  const wireRegistry = (expose?: boolean | string[]) =>
    wireRemoteAddon({
      name: 'registry',
      package: '@acme/addon-registry',
      serverUrl: 'https://api.example.com',
      ...(expose === undefined ? {} : { expose }),
    })

  const exposedService = (wire: Record<string, unknown> = {}) =>
    new ContextAwareRPCService(createServices(), wire as never, {})

  test('forwards a function the wiring exposes', async () => {
    try {
      wireRegistry(['getOpenApi'])

      const result = await exposedService().rpcExposed(
        'registry:getOpenApi',
        {}
      )

      assert.deepEqual(result, { ok: true })
      assert.deepEqual(urls, ['https://api.example.com/rpc/getOpenApi'])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('forwards every contract function when expose is true', async () => {
    try {
      wireRegistry(true)

      await exposedService().rpcExposed('registry:anything', {})

      assert.deepEqual(urls, ['https://api.example.com/rpc/anything'])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  for (const expose of [undefined, false, ['listOpenApis']]) {
    test(`refuses without calling the host when expose is ${JSON.stringify(expose)}`, async () => {
      try {
        wireRegistry(expose)

        await assert.rejects(
          () => exposedService().rpcExposed('registry:getOpenApi', {}),
          RPCNotFoundError
        )
        assert.deepEqual(urls, [])
      } finally {
        globalThis.fetch = realFetch
      }
    })
  }

  test('refuses an addon caller whose uses do not reach the remote addon', async () => {
    try {
      wireRegistry(true)
      wireAddon({ name: 'shop', package: '@acme/addon-shop' })

      await assert.rejects(
        () =>
          exposedService({
            http: {
              request: {
                header: (name: string) =>
                  name === 'x-pikku-addon' ? 'shop' : undefined,
              },
            },
          }).rpcExposed('registry:getOpenApi', {}),
        AddonNotUsedError
      )
      assert.deepEqual(urls, [])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('server-side rpc() is not governed by expose', async () => {
    try {
      wireRegistry()

      await exposedService().rpc('registry:getOpenApi', {})

      assert.deepEqual(urls, ['https://api.example.com/rpc/getOpenApi'])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('rpcExposed on a host answering a remote-addon call', () => {
  const contractWire = {
    http: {
      request: {
        header: (name: string) =>
          name === REMOTE_CONTRACT_HEADER ? '1' : undefined,
      },
    },
  } as never

  const registerExposed = (name: string, remote: boolean) => {
    pikkuState(null, 'rpc', 'meta')[name] = name
    registerFunction(name, async () => ({ ran: name }), { expose: true })
    if (remote) {
      ;(pikkuState(null, 'function', 'meta')[name] as any).remote = true
    }
  }

  test('answers a function in the remote contract', async () => {
    registerExposed('getOpenApi', true)
    const service = new ContextAwareRPCService(
      createServices(),
      contractWire,
      {}
    )

    assert.deepEqual(await service.rpcExposed('getOpenApi', {}), {
      ran: 'getOpenApi',
    })
  })

  test('refuses an exposed function outside the remote contract', async () => {
    registerExposed('deleteEverything', false)
    const service = new ContextAwareRPCService(
      createServices(),
      contractWire,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('deleteEverything', {}),
      RPCNotFoundError
    )
  })

  test('still answers it to an ordinary /rpc caller', async () => {
    registerExposed('deleteEverything', false)
    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    assert.deepEqual(await service.rpcExposed('deleteEverything', {}), {
      ran: 'deleteEverything',
    })
  })

  describe('versions', () => {
    const registerVersions = (versions: number[]) => {
      const rpc = pikkuState(null, 'rpc', 'meta')
      for (const v of versions) {
        const id = `getOpenApi@v${v}`
        rpc[id] = id
        registerFunction(id, async () => ({ ran: id }), { expose: true })
        ;(pikkuState(null, 'function', 'meta')[id] as any).remote = true
      }
      rpc.getOpenApi = `getOpenApi@v${Math.max(...versions)}`
    }
    const service = () =>
      new ContextAwareRPCService(createServices(), contractWire, {})

    test('an existing v1 is still served after v2 is added', async () => {
      registerVersions([1, 2])
      assert.deepEqual(await service().rpcExposed('getOpenApi@v1', {}), {
        ran: 'getOpenApi@v1',
      })
      assert.deepEqual(await service().rpcExposed('getOpenApi', {}), {
        ran: 'getOpenApi@v2',
      })
    })

    test('a removed v1 is a 404 telling the caller to update its SDK, not the latest', async () => {
      registerVersions([2, 3])
      await assert.rejects(
        () => service().rpcExposed('getOpenApi@v1', {}),
        (error: unknown) =>
          error instanceof RPCNotFoundError &&
          error.rpcName === 'getOpenApi@v1' &&
          /Version 1 of 'getOpenApi' is no longer served here; update the SDK/.test(
            error.message
          )
      )
    })

    test('the same refusal holds on the public /rpc route', async () => {
      registerVersions([2])
      const ordinary = new ContextAwareRPCService(
        createServices(),
        {} as never,
        {}
      )
      await assert.rejects(
        () => ordinary.rpcExposed('getOpenApi@v1', {}),
        RPCNotFoundError
      )
    })

    test('an unversioned function answers as its own v1', async () => {
      registerExposed('getOpenApi', true)
      assert.deepEqual(await service().rpcExposed('getOpenApi@v1', {}), {
        ran: 'getOpenApi',
      })
      await assert.rejects(
        () => service().rpcExposed('getOpenApi@v2', {}),
        RPCNotFoundError
      )
    })
  })

  test('does not forward a contract call it has no meta for', async () => {
    const forwarded: string[] = []
    const service = new ContextAwareRPCService(
      createServices({
        deploymentService: {
          invoke: async (name: string) => forwarded.push(name),
        },
      }),
      contractWire,
      {}
    )

    await assert.rejects(
      () => service.rpcExposed('other:getOpenApi', {}),
      RPCNotFoundError
    )
    assert.deepEqual(forwarded, [])
  })
})

describe('rpcService.getContextRPCService', () => {
  test('builds a typed rpc facade with depth and bound methods', async () => {
    pikkuState(null, 'rpc', 'meta').echo = 'echoFunc'
    registerFunction('echoFunc', async (_services, data) => data)

    const rpc = rpcService.getContextRPCService(
      createServices(),
      {} as never,
      false,
      7
    )

    assert.equal(rpc.depth, 7)
    assert.equal(rpc.global, false)
    assert.deepEqual(await rpc.invoke('echo', { ok: true }), { ok: true })
  })
})

describe('ContextAwareRPCService.agent', () => {
  test('refuses when no unit registered the agent runtime', () => {
    const service = new ContextAwareRPCService(
      createServices(),
      { traceId: 'trace-agent' } as never,
      { requiresAuth: false }
    )

    assert.throws(() => service.agent, /import @pikku\/core\/agent/)
  })

  test('builds the facade from the registered factory', () => {
    const built: unknown[] = []
    const facade = { run: async () => 'ran' }
    pikkuState(null, 'agent', 'rpcFactory', ((wire, options) => {
      built.push({ wire, options })
      return facade
    }) as never)

    const service = new ContextAwareRPCService(
      createServices(),
      { traceId: 'trace-agent' } as never,
      { requiresAuth: false }
    )

    assert.equal(service.agent, facade)
    assert.deepEqual(built, [
      { wire: { traceId: 'trace-agent' }, options: { requiresAuth: false } },
    ])
  })
})
