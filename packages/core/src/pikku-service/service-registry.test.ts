import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PikkuServiceError,
  ServiceRegistry,
  pikkuService,
  runPikkuServices,
} from './index.js'

const meta = (needs: string[], provides: string[]) => ({
  common: { needs, provides },
})

const names = (
  registry: ServiceRegistry,
  target: 'dev' | 'deploy',
  baseline?: string[]
) => registry.resolve(target, { baseline }).map((s) => s.name)

describe('ServiceRegistry.resolve', () => {
  test('orders a service after the services it depends on', () => {
    const registry = new ServiceRegistry()
      .add(
        'b',
        pikkuService(async ({ a }: any) => ({ b: a })),
        meta(['a'], ['b'])
      )
      .add(
        'a',
        pikkuService(() => ({ a: 1 })),
        meta([], ['a'])
      )
    assert.deepEqual(names(registry, 'dev'), ['a', 'b'])
  })

  test('keeps registration order when nothing depends on anything', () => {
    const registry = new ServiceRegistry()
      .add(
        'x',
        pikkuService(() => ({ x: 1 })),
        meta([], ['x'])
      )
      .add(
        'y',
        pikkuService(() => ({ y: 1 })),
        meta([], ['y'])
      )
    assert.deepEqual(names(registry, 'deploy'), ['x', 'y'])
  })

  test('a target variant overrides common, and common fills the other target', () => {
    const dev = () => ({ db: 'dev' })
    const common = () => ({ db: 'common' })
    const registry = new ServiceRegistry().add(
      'db',
      pikkuService({ dev, common }),
      {
        dev: { needs: [], provides: ['db'] },
        common: { needs: ['env'], provides: ['db'] },
      }
    )
    const onDev = registry.resolve('dev', { baseline: ['env'] })
    const onDeploy = registry.resolve('deploy', { baseline: ['env'] })
    assert.equal(onDev[0]!.variant, 'dev')
    assert.equal(onDev[0]!.factory, dev)
    assert.equal(onDeploy[0]!.variant, 'common')
    assert.equal(onDeploy[0]!.factory, common)
  })

  test('a service with no variant for a target is left out of it', () => {
    const registry = new ServiceRegistry().add(
      'nats',
      pikkuService({ deploy: () => ({ nats: 1 }) }),
      { deploy: { needs: [], provides: ['nats'] } }
    )
    assert.deepEqual(names(registry, 'dev'), [])
    assert.deepEqual(names(registry, 'deploy'), ['nats'])
  })

  test('a need on a key a left-out service provides fails on that target only', () => {
    const registry = new ServiceRegistry()
      .add('nats', pikkuService({ deploy: () => ({ nats: 1 }) }), {
        deploy: { needs: [], provides: ['nats'] },
      })
      .add(
        'jobs',
        pikkuService(({ nats }: any) => ({ jobs: nats })),
        meta(['nats'], ['jobs'])
      )
    assert.deepEqual(names(registry, 'deploy'), ['nats', 'jobs'])
    assert.throws(
      () => registry.resolveAll(),
      (e: any) =>
        e instanceof PikkuServiceError &&
        e.kind === 'unsatisfied-need' &&
        /'jobs' needs 'nats' on dev/.test(e.message)
    )
  })

  test('a need nothing provides names the baseline', () => {
    const registry = new ServiceRegistry().add(
      'a',
      pikkuService(() => ({ a: 1 })),
      meta(['ghost'], ['a'])
    )
    assert.throws(
      () => registry.resolve('dev', { baseline: ['logger'] }),
      /needs 'ghost' on dev, which nothing provides\. No service provides it, and the baseline only has: logger/
    )
  })

  test('a baseline key meets a need', () => {
    const registry = new ServiceRegistry().add(
      'a',
      pikkuService(() => ({ a: 1 })),
      meta(['logger'], ['a'])
    )
    assert.deepEqual(names(registry, 'dev', ['logger']), ['a'])
  })

  test('two providers of one key is an error', () => {
    const registry = new ServiceRegistry()
      .add(
        'a',
        pikkuService(() => ({ k: 1 })),
        meta([], ['k'])
      )
      .add(
        'b',
        pikkuService(() => ({ k: 2 })),
        meta([], ['k'])
      )
    assert.throws(
      () => registry.resolve('dev'),
      (e: any) =>
        e.kind === 'duplicate-provider' &&
        /'a' and 'b' both provide 'k' on dev/.test(e.message)
    )
  })

  test('one service may replace a baseline key and can read the baseline value', () => {
    const registry = new ServiceRegistry()
      .add(
        'wrap',
        pikkuService(({ kysely }: any) => ({ kysely })),
        meta(['kysely'], ['kysely'])
      )
      .add(
        'use',
        pikkuService(({ kysely }: any) => ({ u: kysely })),
        meta(['kysely'], ['u'])
      )
    assert.deepEqual(names(registry, 'dev', ['kysely']), ['wrap', 'use'])
  })

  test('two replacements of a baseline key is still an error', () => {
    const registry = new ServiceRegistry()
      .add(
        'a',
        pikkuService(() => ({ kysely: 1 })),
        meta([], ['kysely'])
      )
      .add(
        'b',
        pikkuService(() => ({ kysely: 2 })),
        meta([], ['kysely'])
      )
    assert.throws(
      () => registry.resolve('dev', { baseline: ['kysely'] }),
      /both provide 'kysely'/
    )
  })

  test('a service that reads its own non-baseline key is unsatisfied', () => {
    const registry = new ServiceRegistry().add(
      'a',
      pikkuService(({ k }: any) => ({ k })),
      meta(['k'], ['k'])
    )
    assert.throws(() => registry.resolve('dev'), /provides 'k' itself/)
  })

  test('a cycle is reported with its path', () => {
    const registry = new ServiceRegistry()
      .add(
        'a',
        pikkuService(({ b }: any) => ({ a: b })),
        meta(['b'], ['a'])
      )
      .add(
        'b',
        pikkuService(({ a }: any) => ({ b: a })),
        meta(['a'], ['b'])
      )
    assert.throws(
      () => registry.resolve('dev'),
      (e: any) => e.kind === 'cycle' && /a -> b -> a/.test(e.message)
    )
  })

  test('a name registered twice is an error', () => {
    const registry = new ServiceRegistry().add('a', () => ({}), meta([], []))
    assert.throws(
      () => registry.add('a', () => ({}), meta([], [])),
      (e: any) => e.kind === 'duplicate-name'
    )
  })
})

describe('runPikkuServices', () => {
  test('runs factories in dependency order, each seeing what ran before', async () => {
    const registry = new ServiceRegistry()
      .add(
        'b',
        pikkuService(({ a }: any) => ({ b: a + 1 })),
        meta(['a'], ['b'])
      )
      .add(
        'a',
        pikkuService(async () => ({ a: 1 })),
        meta([], ['a'])
      )
    const services: Record<string, any> = {}
    const { order } = await runPikkuServices(registry, {
      target: 'dev',
      services,
    })
    assert.deepEqual(order, ['a', 'b'])
    assert.deepEqual(services, { a: 1, b: 2 })
  })

  test('hands each factory the env', async () => {
    const registry = new ServiceRegistry().add(
      'e',
      pikkuService((_s, env) => ({ url: env.URL })),
      meta([], ['url'])
    )
    const services: Record<string, any> = {}
    await runPikkuServices(registry, {
      target: 'dev',
      services,
      env: { URL: 'x' },
    })
    assert.equal(services.url, 'x')
  })

  test('a replacement overrides the baseline value', async () => {
    const registry = new ServiceRegistry().add(
      'wrap',
      pikkuService(({ kysely }: any) => ({ kysely: `wrapped(${kysely})` })),
      meta(['kysely'], ['kysely'])
    )
    const services: Record<string, any> = { kysely: 'base' }
    await runPikkuServices(registry, { target: 'dev', services })
    assert.equal(services.kysely, 'wrapped(base)')
  })

  test('collects onServerStart hooks in run order', async () => {
    const calls: string[] = []
    const registry = new ServiceRegistry()
      .add(
        'b',
        pikkuService({
          common: ({ a }: any) => ({ b: a }),
          onServerStart: () => void calls.push('b'),
        }),
        meta(['a'], ['b'])
      )
      .add(
        'a',
        pikkuService({
          common: () => ({ a: 1 }),
          onServerStart: () => void calls.push('a'),
        }),
        meta([], ['a'])
      )
    const { start } = await runPikkuServices(registry, {
      target: 'deploy',
      services: {},
    })
    assert.deepEqual(
      start.map((h) => h.name),
      ['a', 'b']
    )
    for (const hook of start) await hook.run({})
    assert.deepEqual(calls, ['a', 'b'])
  })

  test('a throwing factory is a PikkuServiceError naming the service', async () => {
    const registry = new ServiceRegistry().add(
      'boom',
      pikkuService(() => {
        throw new Error('no db')
      }),
      meta([], [])
    )
    await assert.rejects(
      runPikkuServices(registry, { target: 'dev', services: {} }),
      (e: any) =>
        e instanceof PikkuServiceError &&
        e.kind === 'factory-failed' &&
        /Service 'boom' failed to build: no db/.test(e.message)
    )
  })
})
