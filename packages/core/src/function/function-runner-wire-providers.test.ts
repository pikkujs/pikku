import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import { ProviderRegistry, WireProviders } from '../provider/index.js'
import type { ProviderError } from '../provider/index.js'

beforeEach(() => {
  resetPikkuState()
})

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

const meta = (
  needs: string[],
  provides: string[],
  extra: { optional?: string[] } = {}
) => ({
  common: {
    needs,
    optional: extra.optional ?? [],
    provides,
    optionalProvides: [],
  },
})

const register = (registry: ProviderRegistry) => {
  const wireProviders = new WireProviders(registry, { target: 'dev' })
  pikkuState(null, 'package', 'wireProviders', (singletons, wire, options) =>
    wireProviders.run(singletons, wire, options)
  )
}

const addTestFunction = (name: string, func: any, extra: object = {}) => {
  addFunction(name, { func } as any)
  pikkuState(null, 'function', 'meta')[name] = {
    pikkuFuncId: name,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
    ...extra,
  } as any
}

const call = (name: string, options: object = {}) =>
  runPikkuFunc('rpc', name, name, {
    singletonServices: { logger } as any,
    data: () => ({}),
    auth: false,
    wire: {},
    ...options,
  })

describe('runPikkuFunc with wire providers', () => {
  test('a function receives what a wire provider built, and it is stopped when the call ends', async () => {
    const events: string[] = []
    register(
      new ProviderRegistry().add(
        'scope',
        (() => ({
          requestScope: { stop: () => events.push('stopped') },
        })) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    addTestFunction(
      'usesScope',
      async ({ requestScope }: any) => {
        events.push('ran')
        return typeof requestScope
      },
      { services: { optimized: true, services: ['requestScope'] } }
    )
    assert.equal(await call('usesScope'), 'object')
    assert.deepEqual(events, ['ran', 'stopped'])
  })

  test('it is stopped when the function throws', async () => {
    let stopped = false
    register(
      new ProviderRegistry().add(
        'scope',
        (() => ({ requestScope: { stop: () => (stopped = true) } })) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    addTestFunction(
      'throws',
      async () => {
        throw new Error('boom')
      },
      { services: { optimized: true, services: ['requestScope'] } }
    )
    await assert.rejects(call('throws'), /boom/)
    assert.equal(stopped, true)
  })

  test('a function that does not reach a provider does not build it', async () => {
    let built = 0
    register(
      new ProviderRegistry().add(
        'scope',
        (() => {
          built++
          return { requestScope: 1 }
        }) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    addTestFunction('plain', async () => 'ok', {
      services: { optimized: true, services: ['logger'] },
    })
    assert.equal(await call('plain'), 'ok')
    assert.equal(built, 0)
  })

  test('a singletonServicesOnly function builds no wire providers', async () => {
    let built = 0
    register(
      new ProviderRegistry().add(
        'scope',
        (() => {
          built++
          return { requestScope: 1 }
        }) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    addTestFunction('single', async () => 'ok', { singletonServicesOnly: true })
    assert.equal(await call('single'), 'ok')
    assert.equal(built, 0)
  })

  test('core builds auditLog before the wire providers, which may need it', async () => {
    const written: unknown[] = []
    register(
      new ProviderRegistry().add(
        'events',
        (({ auditLog }: any) => ({
          events: { audited: auditLog !== undefined },
        })) as never,
        meta(['auditLog'], ['events'], { optional: ['auditLog'] }),
        { kind: 'wire' }
      )
    )
    addTestFunction('audited', async () => undefined, {
      services: { optimized: true, services: ['events'] },
    })
    addFunction('audited', {
      func: async ({ events }: any) => events.audited,
      audit: true,
    } as any)
    const audit = { audit: async (event: unknown) => written.push(event) }
    assert.equal(
      await call('audited', { singletonServices: { logger, audit } }),
      true
    )
    assert.equal(await call('audited'), false)
  })

  test('the project createWireServices receives the provided keys, and may not return one of them', async () => {
    register(
      new ProviderRegistry().add(
        'scope',
        (() => ({ requestScope: 'p' })) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    addTestFunction('both', async (s: any) => `${s.requestScope}-${s.extra}`, {
      services: { optimized: true, services: ['requestScope', 'extra'] },
    })
    assert.equal(
      await call('both', {
        createWireServices: async (s: any) => ({ extra: s.requestScope }),
      }),
      'p-p'
    )
    await assert.rejects(
      call('both', {
        createWireServices: async () => ({ requestScope: 'again' }),
      }),
      (error: ProviderError) => error.kind === 'duplicate-provider'
    )
  })

  test('wire service stop() runs in reverse order', async () => {
    const order: string[] = []
    addTestFunction('two', async () => 'ok')
    await call('two', {
      createWireServices: async () => ({
        first: { stop: () => order.push('first') },
        second: { stop: () => order.push('second') },
      }),
    })
    assert.deepEqual(order, ['second', 'first'])
  })

  test('two concurrent invocations each get their own instance', async () => {
    register(
      new ProviderRegistry().add(
        'scope',
        (async (_s: any, wire: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return { requestScope: { who: wire.who } }
        }) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    addTestFunction('who', async ({ requestScope }: any) => requestScope.who, {
      services: { optimized: true, services: ['requestScope'] },
    })
    const [one, two] = await Promise.all([
      call('who', { wire: { who: 'one' } }),
      call('who', { wire: { who: 'two' } }),
    ])
    assert.deepEqual([one, two], ['one', 'two'])
  })

  test('an addon function does not see the wire providers of the host', async () => {
    let built = 0
    register(
      new ProviderRegistry().add(
        'scope',
        (() => {
          built++
          return { requestScope: 1 }
        }) as never,
        meta([], ['requestScope']),
        { kind: 'wire' }
      )
    )
    pikkuState('@addon/x', 'package', 'factories', {
      createSingletonServices: async () => ({ logger }),
    } as any)
    addFunction(
      'addonFunc',
      { func: async (s: any) => s.requestScope } as any,
      '@addon/x'
    )
    pikkuState('@addon/x', 'function', 'meta').addonFunc = {
      pikkuFuncId: 'addonFunc',
      sessionless: true,
      services: { optimized: true, services: ['requestScope'] },
    } as any
    const result = await call('addonFunc', { packageName: '@addon/x' })
    assert.equal(result, undefined)
    assert.equal(built, 0)
  })
})
