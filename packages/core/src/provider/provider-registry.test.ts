import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderError,
  ProviderRegistry,
  defineProvider,
  runProviders,
} from './index.js'

const meta = (needs: string[], provides: string[]) => ({
  common: { needs, provides },
})

const names = (
  registry: ProviderRegistry,
  target: 'dev' | 'deploy',
  baseline?: string[]
) => registry.resolve(target, { baseline }).map((s) => s.name)

describe('ProviderRegistry.resolve', () => {
  test('orders a service after the services it depends on', () => {
    const registry = new ProviderRegistry()
      .add(
        'b',
        defineProvider(async ({ a }: any) => ({ b: a })),
        meta(['a'], ['b'])
      )
      .add(
        'a',
        defineProvider(() => ({ a: 1 })),
        meta([], ['a'])
      )
    assert.deepEqual(names(registry, 'dev'), ['a', 'b'])
  })

  test('keeps registration order when nothing depends on anything', () => {
    const registry = new ProviderRegistry()
      .add(
        'x',
        defineProvider(() => ({ x: 1 })),
        meta([], ['x'])
      )
      .add(
        'y',
        defineProvider(() => ({ y: 1 })),
        meta([], ['y'])
      )
    assert.deepEqual(names(registry, 'deploy'), ['x', 'y'])
  })

  test('a target variant overrides common, and common fills the other target', () => {
    const dev = () => ({ db: 'dev' })
    const common = () => ({ db: 'common' })
    const registry = new ProviderRegistry().add(
      'db',
      defineProvider({ dev, common }),
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
    const registry = new ProviderRegistry().add(
      'nats',
      defineProvider({ deploy: () => ({ nats: 1 }) }),
      { deploy: { needs: [], provides: ['nats'] } }
    )
    assert.deepEqual(names(registry, 'dev'), [])
    assert.deepEqual(names(registry, 'deploy'), ['nats'])
  })

  test('a need on a key a left-out service provides fails on that target only', () => {
    const registry = new ProviderRegistry()
      .add('nats', defineProvider({ deploy: () => ({ nats: 1 }) }), {
        deploy: { needs: [], provides: ['nats'] },
      })
      .add(
        'jobs',
        defineProvider(({ nats }: any) => ({ jobs: nats })),
        meta(['nats'], ['jobs'])
      )
    assert.deepEqual(names(registry, 'deploy'), ['nats', 'jobs'])
    assert.throws(
      () => registry.resolveAll(),
      (e: any) =>
        e instanceof ProviderError &&
        e.kind === 'unsatisfied-need' &&
        /'jobs' needs 'nats' on dev/.test(e.message)
    )
  })

  test('a need nothing provides names the baseline', () => {
    const registry = new ProviderRegistry().add(
      'a',
      defineProvider(() => ({ a: 1 })),
      meta(['ghost'], ['a'])
    )
    assert.throws(
      () => registry.resolve('dev', { baseline: ['logger'] }),
      /needs 'ghost' on dev, which nothing provides\. No provider provides it, and the baseline only has: logger/
    )
  })

  test('a baseline key meets a need', () => {
    const registry = new ProviderRegistry().add(
      'a',
      defineProvider(() => ({ a: 1 })),
      meta(['logger'], ['a'])
    )
    assert.deepEqual(names(registry, 'dev', ['logger']), ['a'])
  })

  test('two providers of one key is an error', () => {
    const registry = new ProviderRegistry()
      .add(
        'a',
        defineProvider(() => ({ k: 1 })),
        meta([], ['k'])
      )
      .add(
        'b',
        defineProvider(() => ({ k: 2 })),
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
    const registry = new ProviderRegistry()
      .add(
        'wrap',
        defineProvider(({ kysely }: any) => ({ kysely })),
        meta(['kysely'], ['kysely'])
      )
      .add(
        'use',
        defineProvider(({ kysely }: any) => ({ u: kysely })),
        meta(['kysely'], ['u'])
      )
    assert.deepEqual(names(registry, 'dev', ['kysely']), ['wrap', 'use'])
  })

  test('two replacements of a baseline key is still an error', () => {
    const registry = new ProviderRegistry()
      .add(
        'a',
        defineProvider(() => ({ kysely: 1 })),
        meta([], ['kysely'])
      )
      .add(
        'b',
        defineProvider(() => ({ kysely: 2 })),
        meta([], ['kysely'])
      )
    assert.throws(
      () => registry.resolve('dev', { baseline: ['kysely'] }),
      /both provide 'kysely'/
    )
  })

  test('a service that reads its own non-baseline key is unsatisfied', () => {
    const registry = new ProviderRegistry().add(
      'a',
      defineProvider(({ k }: any) => ({ k })),
      meta(['k'], ['k'])
    )
    assert.throws(() => registry.resolve('dev'), /provides 'k' itself/)
  })

  test('a cycle is reported with its path', () => {
    const registry = new ProviderRegistry()
      .add(
        'a',
        defineProvider(({ b }: any) => ({ a: b })),
        meta(['b'], ['a'])
      )
      .add(
        'b',
        defineProvider(({ a }: any) => ({ b: a })),
        meta(['a'], ['b'])
      )
    assert.throws(
      () => registry.resolve('dev'),
      (e: any) => e.kind === 'cycle' && /a -> b -> a/.test(e.message)
    )
  })

  test('a name registered twice is an error', () => {
    const registry = new ProviderRegistry().add('a', () => ({}), meta([], []))
    assert.throws(
      () => registry.add('a', () => ({}), meta([], [])),
      (e: any) => e.kind === 'duplicate-name'
    )
  })
})

describe('runProviders', () => {
  test('runs factories in dependency order, each seeing what ran before', async () => {
    const registry = new ProviderRegistry()
      .add(
        'b',
        defineProvider(({ a }: any) => ({ b: a + 1 })),
        meta(['a'], ['b'])
      )
      .add(
        'a',
        defineProvider(async () => ({ a: 1 })),
        meta([], ['a'])
      )
    const services: Record<string, any> = {}
    const { order } = await runProviders(registry, {
      target: 'dev',
      services,
    })
    assert.deepEqual(order, ['a', 'b'])
    assert.deepEqual(services, { a: 1, b: 2 })
  })

  test('hands each factory the env', async () => {
    const registry = new ProviderRegistry().add(
      'e',
      defineProvider((_s, env) => ({ url: env.URL })),
      meta([], ['url'])
    )
    const services: Record<string, any> = {}
    await runProviders(registry, {
      target: 'dev',
      services,
      env: { URL: 'x' },
    })
    assert.equal(services.url, 'x')
  })

  test('a replacement overrides the baseline value', async () => {
    const registry = new ProviderRegistry().add(
      'wrap',
      defineProvider(({ kysely }: any) => ({ kysely: `wrapped(${kysely})` })),
      meta(['kysely'], ['kysely'])
    )
    const services: Record<string, any> = { kysely: 'base' }
    await runProviders(registry, { target: 'dev', services })
    assert.equal(services.kysely, 'wrapped(base)')
  })

  test('collects onServerStart hooks in run order', async () => {
    const calls: string[] = []
    const registry = new ProviderRegistry()
      .add(
        'b',
        defineProvider({
          common: ({ a }: any) => ({ b: a }),
          onServerStart: () => void calls.push('b'),
        }),
        meta(['a'], ['b'])
      )
      .add(
        'a',
        defineProvider({
          common: () => ({ a: 1 }),
          onServerStart: () => void calls.push('a'),
        }),
        meta([], ['a'])
      )
    const { start } = await runProviders(registry, {
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

  test('a throwing factory is a ProviderError naming the service', async () => {
    const registry = new ProviderRegistry().add(
      'boom',
      defineProvider(() => {
        throw new Error('no db')
      }),
      meta([], [])
    )
    await assert.rejects(
      runProviders(registry, { target: 'dev', services: {} }),
      (e: any) =>
        e instanceof ProviderError &&
        e.kind === 'factory-failed' &&
        /Provider 'boom' failed to build: no db/.test(e.message)
    )
  })
})

describe('ProviderRegistry.resolve profiles', () => {
  const variantMeta = (provides: string[]) => ({ needs: [], provides })

  test('a deploy profile variant beats deploy, and deploy beats common', () => {
    const worker = () => ({ db: 'worker' })
    const plain = () => ({ db: 'deploy' })
    const common = () => ({ db: 'common' })
    const registry = new ProviderRegistry().add(
      'db',
      defineProvider({
        'deploy:cloudflare-worker': worker,
        deploy: plain,
        common,
      }),
      {
        'deploy:cloudflare-worker': variantMeta(['db']),
        deploy: variantMeta(['db']),
        common: variantMeta(['db']),
      }
    )
    const pick = (profile?: 'cloudflare-worker' | 'standalone') =>
      registry.resolve('deploy', { profile })[0]!
    assert.equal(pick('cloudflare-worker').variant, 'deploy:cloudflare-worker')
    assert.equal(pick('cloudflare-worker').factory, worker)
    assert.equal(pick('standalone').variant, 'deploy')
    assert.equal(pick().variant, 'deploy')
    assert.equal(registry.resolve('dev')[0]!.variant, 'common')
  })

  test('a profile variant is not used on dev', () => {
    const registry = new ProviderRegistry().add(
      'db',
      defineProvider({ 'deploy:standalone': () => ({ db: 1 }) }),
      { 'deploy:standalone': variantMeta(['db']) }
    )
    assert.deepEqual(names(registry, 'dev'), [])
  })
})

describe('ProviderRegistry.resolve optional needs', () => {
  const optionalMeta = (
    needs: string[],
    optional: string[],
    provides: string[],
    optionalProvides: string[] = []
  ) => ({ common: { needs, optional, provides, optionalProvides } })

  test('an optional need nothing provides is skipped', () => {
    const registry = new ProviderRegistry().add(
      'a',
      defineProvider(({ queueService }: any) => ({ a: queueService })),
      optionalMeta(['queueService'], ['queueService'], ['a'])
    )
    assert.deepEqual(names(registry, 'dev'), ['a'])
  })

  test('an optional need that closes a cycle is a cycle only when its provider is present', () => {
    const needer = defineProvider(({ q }: any) => ({ a: q }))
    const present = new ProviderRegistry()
      .add('a', needer, optionalMeta(['q'], ['q'], ['a']))
      .add(
        'q',
        defineProvider(({ a }: any) => ({ q: a })),
        optionalMeta(['a'], [], ['q'])
      )
    assert.throws(
      () => names(present, 'dev'),
      (e: any) => e.kind === 'cycle'
    )
    const absent = new ProviderRegistry().add(
      'a',
      needer,
      optionalMeta(['q'], ['q'], ['a'])
    )
    assert.deepEqual(names(absent, 'dev'), ['a'])
  })

  test('an optional need something provides orders the needer after it', () => {
    const registry = new ProviderRegistry()
      .add(
        'a',
        defineProvider(({ q }: any) => ({ a: q })),
        optionalMeta(['q'], ['q'], ['a'])
      )
      .add(
        'q',
        defineProvider(() => ({ q: 1 })),
        optionalMeta([], [], ['q'])
      )
    assert.deepEqual(names(registry, 'dev'), ['q', 'a'])
  })

  test('a need that is not optional still fails, with a hint to list it', () => {
    const registry = new ProviderRegistry().add(
      'a',
      defineProvider(({ q }: any) => ({ a: q })),
      optionalMeta(['q'], [], ['a'])
    )
    assert.throws(
      () => registry.resolve('dev', { where: 'pikku dev' }),
      (e: any) =>
        e.kind === 'unsatisfied-need' &&
        /needs 'q' on pikku dev/.test(e.message) &&
        /List it in optional/.test(e.message)
    )
  })

  test('a need on a key provided only sometimes has to be optional', () => {
    const registry = new ProviderRegistry()
      .add(
        'maybe',
        defineProvider(() => ({})),
        optionalMeta([], [], ['sometimes'], ['sometimes'])
      )
      .add(
        'consumer',
        defineProvider(({ sometimes }: any) => ({ consumer: sometimes })),
        optionalMeta(['sometimes'], [], ['consumer'])
      )
    assert.throws(
      () => registry.resolve('dev'),
      (e: any) =>
        e.kind === 'optional-key-needed' &&
        /'maybe' provides only sometimes/.test(e.message)
    )
  })

  test('the optional chain a -> b -> c resolves in order', () => {
    const registry = new ProviderRegistry()
      .add(
        'c',
        defineProvider(({ z }: any) => ({ c: z })),
        optionalMeta(['z'], ['z'], ['c'])
      )
      .add(
        'b',
        defineProvider(({ y }: any) => ({ z: y })),
        optionalMeta(['y'], ['y'], ['z'], ['z'])
      )
      .add(
        'a',
        defineProvider(({ x }: any) => ({ y: x })),
        optionalMeta(['x'], ['x'], ['y'], ['y'])
      )
    assert.deepEqual(names(registry, 'dev'), ['a', 'b', 'c'])
  })
})

describe('ProviderRegistry.resolve entry-owned keys', () => {
  test('a provider of a key the entry owns is refused', () => {
    const registry = new ProviderRegistry().add(
      'db',
      defineProvider({ deploy: () => ({ kysely: 1 }) }),
      { deploy: { needs: [], provides: ['kysely'] } }
    )
    assert.throws(
      () =>
        registry.resolve('deploy', {
          baseline: ['kysely'],
          entryOwned: ['kysely'],
          where: 'the standalone deploy',
        }),
      (e: any) =>
        e.kind === 'entry-owned' &&
        /The standalone deploy opens its own 'kysely'; provider 'db' cannot replace it/.test(
          e.message
        )
    )
  })

  test('a baseline key the entry does not own may still be replaced once', () => {
    const registry = new ProviderRegistry().add(
      'db',
      defineProvider({ deploy: () => ({ kysely: 1 }) }),
      { deploy: { needs: [], provides: ['kysely'] } }
    )
    assert.deepEqual(names(registry, 'deploy', ['kysely']), ['db'])
  })
})
