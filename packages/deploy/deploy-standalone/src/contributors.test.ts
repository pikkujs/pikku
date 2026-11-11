import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { StandaloneProviderAdapter } from './adapter.js'

const ctx = {
  unit: {
    name: 'app',
    role: 'function',
    services: [{ capability: 'kv', sourceServiceName: 'browser' }],
  },
  unitDir: '/build/app',
  bootstrapPath: './.pikku/pikku-bootstrap.gen.js',
  configImport: `import { createConfig } from './config.js'`,
  configVar: 'createConfig',
  servicesImport: `import { createSingletonServices } from './services.js'`,
  servicesVar: 'createSingletonServices',
  singletonServicesImport: '',
  servicesType: 'Record<string, unknown>',
  mcpImport: '',
  mcpServerOption: '',
} as never

describe(`StandaloneProviderAdapter contributors`, () => {
  test('without a generated platform-services file the entry has none', () => {
    const source = new StandaloneProviderAdapter({}).generateEntrySource(ctx)

    assert.doesNotMatch(source, /createPlatformServices/)
    assert.doesNotMatch(source, /platformServices/)
  })

  test('the entry imports the generated file, calls it and spreads it last', () => {
    const source = new StandaloneProviderAdapter({}).generateEntrySource({
      ...(ctx as object),
      platformServices: { importPath: './platform-services.gen.js' },
    } as never)

    assert.match(
      source,
      /import \{ createPlatformServices \} from '\.\/platform-services\.gen\.js'/
    )
    assert.match(
      source,
      /const platformServices = await createPlatformServices\(process\.env as Record<string, string \| undefined>, \{ logger, schedulerService, queueService, workflowService, triggerService, triggerSourceStore, eventHub \}\)/
    )
    assert.match(
      source,
      /eventHub,\n    \.\.\.platformServices,\n  \}\)/,
      'contributed services must be spread last so they override the defaults'
    )
    assert.doesNotMatch(source, /const createPlatformServices = async/)
  })

  test('contributors run after the database is opened and see it as runtime.kysely', () => {
    const source = new StandaloneProviderAdapter({}).generateEntrySource({
      ...(ctx as object),
      db: { engine: 'sqlite' },
      platformServices: { importPath: './platform-services.gen.js' },
    } as never)

    const call = source.indexOf('await createPlatformServices(')
    assert.ok(call > source.indexOf('const kysely ='))
    assert.match(
      source.slice(call),
      /^await createPlatformServices\(process\.env as Record<string, string \| undefined>, \{ logger, kysely, /
    )
  })

  test('contributorSupport offers env bindings only, and the runtime services the entry holds', () => {
    const support = new StandaloneProviderAdapter({}).contributorSupport(
      ctx as never
    )
    assert.deepEqual([...support.supported], ['env'])
    assert.ok(support.runtimeServices.includes('logger'))
    assert.ok(!support.runtimeServices.includes('kysely'))
    assert.ok(
      new StandaloneProviderAdapter({})
        .contributorSupport({
          ...(ctx as object),
          db: { engine: 'sqlite' },
        } as never)
        .runtimeServices.includes('kysely')
    )
  })

  test('the platform is widened with the unit being generated', () => {
    const support = new StandaloneProviderAdapter({}).contributorSupport(
      ctx as never
    )
    const platform = support.widenPlatform!({
      serviceNames: [],
      needsQueue: false,
      needsWorkflow: false,
      needsAgent: false,
    }) as unknown as { unit: { name: string } }
    assert.equal(platform.unit.name, 'app')
  })

  test('a database the entry opens but the contributor platform lacks is an error', () => {
    const adapter = new StandaloneProviderAdapter({})
    const platform = {
      serviceNames: [],
      needsQueue: false,
      needsWorkflow: false,
      needsAgent: false,
    }
    assert.throws(
      () =>
        adapter.contributorSupport({
          ...(ctx as object),
          db: { engine: 'sqlite' },
          contributorPlatform: platform,
        } as never),
      /opens a database but the contributor platform says the project has no one/
    )
    assert.throws(
      () =>
        adapter.contributorSupport({
          ...(ctx as object),
          contributorPlatform: { ...platform, db: { engine: 'sqlite' } },
        } as never),
      /does not open a database but the contributor platform says the project has one/
    )
    assert.doesNotThrow(() =>
      adapter.contributorSupport({
        ...(ctx as object),
        db: { engine: 'sqlite' },
        contributorPlatform: { ...platform, db: { engine: 'sqlite' } },
      } as never)
    )
  })
})

describe(`StandaloneProviderAdapter contributor server hooks`, () => {
  const lifecycle = { importPath: './lifecycle.js', variable: 'lifecycle' }
  const platformServices = { importPath: './platform-services.gen.js' }
  const generate = (extra: object) =>
    new StandaloneProviderAdapter({}).generateEntrySource({
      ...(ctx as object),
      ...extra,
    } as never)
  const at = (source: string, needle: string) => {
    const index = source.indexOf(needle)
    assert.notEqual(index, -1, `missing: ${needle}`)
    return index
  }

  test('runs the server lifecycle', () => {
    assert.equal(
      new StandaloneProviderAdapter({}).contributorSupport(ctx)
        .runsServerLifecycle,
      true
    )
  })

  test('without contributors the entry reads as it did: the app lifecycle alone', () => {
    const source = generate({ lifecycle })
    assert.doesNotMatch(source, /composeServerLifecycle|serverStartHooks/)
    assert.match(source, /__pikkuLifecycle\?\.beforeStart/)
  })

  test('the composed lifecycle starts contributors first and stops them after afterStop, on the signal path too', () => {
    const source = generate({ lifecycle, platformServices })
    assert.match(
      source,
      /const __pikkuServerLifecycle = composeServerLifecycle\(__pikkuLifecycle, \{ start: __pikkuStartHooks, stop: __pikkuStopHooks \}\)/
    )
    assert.ok(
      at(source, '__pikkuServerLifecycle?.beforeStart') <
        at(source, 'await server.start()') &&
        at(source, 'await server.start()') <
          at(source, '__pikkuServerLifecycle?.afterStart')
    )
    assert.match(
      source,
      /server\.enableExitOnSignals\(\{ beforeStop: async \(\) => \{ await __pikkuServerLifecycle\?\.beforeStop\?\.\(singletonServices\) \}, afterStop: async \(\) => \{ await __pikkuServerLifecycle\?\.afterStop\?\.\(singletonServices\) \} \}\)/
    )
  })

  test('contributor hooks run even when the app declares no lifecycle', () => {
    const source = generate({ platformServices })
    assert.match(source, /composeServerLifecycle\(undefined,/)
    assert.match(source, /__pikkuServerLifecycle\?\.beforeStart/)
  })

  test('the pool is closed after the contributors stop', () => {
    const source = generate({
      platformServices,
      db: { engine: 'postgres' },
    })
    assert.match(
      source,
      /afterStop: async \(\) => \{ await __pikkuServerLifecycle\?\.afterStop\?\.\(singletonServices\); await __pikkuPg\.close\(\) \}/
    )
  })
})
