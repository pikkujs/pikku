import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  ContextAwareRPCService,
  RPCNotFoundError,
  resolveNamespace,
  rpcService,
} from './rpc-runner.js'

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
  }: {
    packageName?: string | null
    expose?: boolean
    pikkuFuncId?: string
    tags?: string[]
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

    const seenTags: string[][] = []
    const addonTagGroup = pikkuState('@addon/stripe', 'permissions', 'tagGroup')
    addonTagGroup['addon-tag'] = [
      async (_services: any, _data: any, wire: any) => {
        seenTags.push(['addon-tag', wire.wireType])
        return true
      },
    ] as never
    addonTagGroup['function-tag'] = [
      async (_services: any, _data: any, wire: any) => {
        seenTags.push(['function-tag', wire.wireType])
        return true
      },
    ] as never

    const result = await service.rpc('stripe:createCharge', { amount: 10 })

    assert.deepEqual(result, {
      data: { amount: 10 },
      auth: 'http',
    })
    assert.deepEqual(seenTags, [['addon-tag', 'http']])
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

  test('runs exposed addon functions', async () => {
    pikkuState(null, 'addons', 'packages').set('addon', {
      package: '@addon/pkg',
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

describe('ContextAwareRPCService.remote', () => {
  test('throws when deploymentService is unavailable', async () => {
    const service = new ContextAwareRPCService(
      createServices(),
      {} as never,
      {}
    )

    await assert.rejects(
      () => service.remote('remoteFunc', {}),
      /No DeploymentService configured for remote RPC: remoteFunc/
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

    const result = await service.remote('remoteFunc', { hi: true })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(calls, [
      ['remoteFunc', { hi: true }, { userId: 'user-4' }, 'trace-4'],
    ])
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
