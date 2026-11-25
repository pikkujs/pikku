import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderError,
  ProviderRegistry,
  runProviders,
  scopedEnv,
} from './index.js'

const meta = (
  needs: string[],
  provides: string[],
  extra: { optional?: string[]; optionalProvides?: string[] } = {}
) => ({
  common: {
    needs,
    optional: extra.optional ?? [],
    provides,
    optionalProvides: extra.optionalProvides ?? [],
  },
})

const kindOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    assert.ok(error instanceof ProviderError, String(error))
    return error.kind
  }
  return 'no-error'
}

describe('runProviders enforcement', () => {
  test('a factory reads the needs it declared and nothing else', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      ((services: any) => ({ a: services.logger })) as never,
      meta(['logger'], ['a'])
    )
    const services: Record<string, unknown> = { logger: 'L', secret: 'S' }
    await runProviders(registry, { target: 'dev', services })
    assert.equal(services.a, 'L')
  })

  test('reading an undeclared key is undeclared-read, and names the needs', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      ((services: any) => ({ a: services.secret })) as never,
      meta(['logger'], ['a'])
    )
    await assert.rejects(
      runProviders(registry, {
        target: 'dev',
        services: { logger: 'L', secret: 'S' },
      }),
      (error: ProviderError) =>
        error.kind === 'undeclared-read' &&
        error.message ===
          "Provider 'a' read 'secret', which it does not destructure. Its needs are: logger."
    )
  })

  test('the view lists only declared needs and cannot be changed', async () => {
    let seen: string[] = []
    let mutation: unknown
    const registry = new ProviderRegistry().add(
      'a',
      ((services: any) => {
        seen = Reflect.ownKeys(services) as string[]
        try {
          services.logger = 'X'
        } catch (error) {
          mutation = error
        }
        return { a: 1 }
      }) as never,
      meta(['logger'], ['a'])
    )
    await runProviders(registry, {
      target: 'dev',
      services: { logger: 'L', secret: 'S' },
    })
    assert.deepEqual(seen, ['logger'])
    assert.ok(mutation instanceof TypeError)
  })

  test('an optional need that is absent reads as undefined', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      (({ queue }: any) => ({ a: queue ?? 'none' })) as never,
      meta(['queue'], ['a'], { optional: ['queue'] })
    )
    const services: Record<string, unknown> = {}
    await runProviders(registry, { target: 'dev', services })
    assert.equal(services.a, 'none')
  })

  test('returning a key it did not declare is undeclared-return and nothing is copied', async () => {
    const services: Record<string, unknown> = {}
    const registry = new ProviderRegistry().add(
      'a',
      (() => ({ a: 1, smuggled: 2 })) as never,
      meta([], ['a'])
    )
    assert.equal(
      await kindOf(() => runProviders(registry, { target: 'dev', services })),
      'undeclared-return'
    )
    assert.deepEqual(services, {})
  })

  test('omitting a required key is missing-return; an optional key may be absent', async () => {
    const required = new ProviderRegistry().add(
      'a',
      (() => ({})) as never,
      meta([], ['a'])
    )
    assert.equal(
      await kindOf(() =>
        runProviders(required, { target: 'dev', services: {} })
      ),
      'missing-return'
    )
    const optional = new ProviderRegistry().add(
      'a',
      (() => ({})) as never,
      meta([], ['a'], { optionalProvides: ['a'] })
    )
    const services: Record<string, unknown> = {}
    await runProviders(optional, { target: 'dev', services })
    assert.ok(!('a' in services))
  })

  test('a factory that throws is factory-failed', async () => {
    const registry = new ProviderRegistry().add(
      'a',
      (() => {
        throw new Error('boom')
      }) as never,
      meta([], ['a'])
    )
    assert.equal(
      await kindOf(() =>
        runProviders(registry, { target: 'dev', services: {} })
      ),
      'factory-failed'
    )
  })
})

describe('runProviders env', () => {
  const registryFor = (
    factory: (services: any, env: any) => unknown,
    registration: Parameters<ProviderRegistry['add']>[3]
  ) =>
    new ProviderRegistry().add(
      'nats/nats',
      factory as never,
      meta([], ['a']),
      registration
    )
  const addon = (env: string[], envRename?: Record<string, string>) => ({
    kind: 'singleton' as const,
    addon: { namespace: 'nats', env, envRename },
  })

  test('an addon provider reads a name its addon declares', async () => {
    const services: Record<string, unknown> = {}
    await runProviders(
      registryFor((_s, env) => ({ a: env.NATS_URL }), addon(['NATS_URL'])),
      { target: 'dev', services, env: { NATS_URL: 'nats://x', OTHER: 'y' } }
    )
    assert.equal(services.a, 'nats://x')
  })

  test('an addon provider reading an undeclared name is env-denied', async () => {
    await assert.rejects(
      runProviders(
        registryFor((_s, env) => ({ a: env.AWS_SECRET }), addon(['NATS_URL'])),
        { target: 'dev', services: {}, env: { AWS_SECRET: 'x' } }
      ),
      (error: ProviderError) =>
        error.kind === 'env-denied' &&
        error.message ===
          "Addon provider 'nats/nats' read env 'AWS_SECRET', which addon 'nats' does not declare with defineVariable or defineSecret."
    )
  })

  test('an override makes the addon read the host name behind it', async () => {
    const services: Record<string, unknown> = {}
    await runProviders(
      registryFor(
        (_s, env) => ({ a: env.NATS_URL }),
        addon(['NATS_URL'], { NATS_URL: 'STAGE_NATS_URL' })
      ),
      {
        target: 'dev',
        services,
        env: { NATS_URL: 'wrong', STAGE_NATS_URL: 'right' },
      }
    )
    assert.equal(services.a, 'right')
  })

  test('listing the env shows only the allowed names the host has set', async () => {
    const services: Record<string, unknown> = {}
    await runProviders(
      registryFor((_s, env) => ({ a: Object.keys(env) }), addon(['A', 'B'])),
      { target: 'dev', services, env: { A: '1', C: '3' } }
    )
    assert.deepEqual(services.a, ['A'])
  })

  test('a project provider reads the raw env', async () => {
    const services: Record<string, unknown> = {}
    await runProviders(
      new ProviderRegistry().add(
        'p',
        ((_s: unknown, env: any) => ({ a: env.ANYTHING })) as never,
        meta([], ['a'])
      ),
      { target: 'dev', services, env: { ANYTHING: 'ok' } }
    )
    assert.equal(services.a, 'ok')
  })

  test('scopedEnv does not stringify bindings', () => {
    const binding = { prepare: () => 1 }
    const env = scopedEnv(
      { DB: binding },
      { namespace: 'x', env: ['DB'] },
      'x/y'
    ) as Record<string, unknown>
    assert.equal(env.DB, binding)
  })
})

describe('runProviders stop order', () => {
  const stubs = (names: [string, string[], string[]][]) => {
    const registry = new ProviderRegistry()
    for (const [name, needs, provides] of names) {
      registry.add(
        name,
        (() =>
          Object.fromEntries(provides.map((key) => [key, { key }]))) as never,
        meta(needs, provides)
      )
    }
    return registry
  }

  test('lists the provided keys latest provider first', async () => {
    const registry = stubs([
      ['c', ['b'], ['c']],
      ['b', ['a'], ['b']],
      ['a', [], ['a']],
    ])
    const { stopOrder } = await runProviders(registry, {
      target: 'dev',
      services: {},
    })
    assert.deepEqual(stopOrder, ['c', 'b', 'a'])
  })

  test('a provider that replaces a baseline key stops by provider order, not baseline position', async () => {
    const registry = stubs([['replacement', ['logger'], ['queueService']]])
    const services: Record<string, unknown> = {
      queueService: { old: true },
      logger: {},
    }
    const { stopOrder } = await runProviders(registry, {
      target: 'dev',
      services,
    })
    assert.deepEqual(stopOrder, ['queueService'])
  })

  test('one object under two keys is listed once', async () => {
    const shared = {}
    const registry = new ProviderRegistry().add(
      'nats',
      (() => ({ queueService: shared, schedulerService: shared })) as never,
      meta([], ['queueService', 'schedulerService'])
    )
    const { stopOrder } = await runProviders(registry, {
      target: 'dev',
      services: {},
    })
    assert.equal(stopOrder.length, 1)
  })
})
