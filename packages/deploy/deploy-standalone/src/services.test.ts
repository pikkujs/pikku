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

describe(`StandaloneProviderAdapter services`, () => {
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
      /const platformServices = await createPlatformServices\(process\.env as Record<string, string \| undefined>, \{ logger, schedulerService, queueService, workflowService, triggerService, triggerSourceStore, eventHub, eventHubRegistry \}\)/
    )
    assert.match(
      source,
      /analyticsSinks: __pikkuAnalyticsSinks,\n    \.\.\.platformServices,\n  \}\)/,
      'provided services must be spread last so they override the defaults'
    )
    assert.doesNotMatch(source, /const createPlatformServices = async/)
  })

  test('services run after the database is opened and see it as runtime.kysely', () => {
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

  test('serviceSupport lists the keys the entry holds, with kysely only when it opens a database', () => {
    const adapter = new StandaloneProviderAdapter({})
    const support = adapter.serviceSupport(ctx as never)
    assert.ok(support.baseline.includes('logger'))
    assert.ok(!support.baseline.includes('kysely'))
    assert.ok(
      adapter
        .serviceSupport({
          ...(ctx as object),
          db: { engine: 'sqlite' },
        } as never)
        .baseline.includes('kysely')
    )
  })
})

describe(`StandaloneProviderAdapter service server hooks`, () => {
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
      new StandaloneProviderAdapter({}).serviceSupport(ctx).runsServerLifecycle,
      true
    )
  })

  test('without services the entry reads as it did: the app lifecycle alone', () => {
    const source = generate({ lifecycle })
    assert.doesNotMatch(source, /composeServerLifecycle|serverStartHooks/)
    assert.match(source, /__pikkuLifecycle\?\.beforeStart/)
  })

  test('the composed lifecycle starts services first, on the signal path too', () => {
    const source = generate({ lifecycle, platformServices })
    assert.match(
      source,
      /const __pikkuServerLifecycle = composeServerLifecycle\(__pikkuLifecycle, \{ start: __pikkuStartHooks \}\)/
    )
    assert.ok(
      at(source, '__pikkuServerLifecycle?.beforeStart') <
        at(source, 'await server.start()') &&
        at(source, 'await server.start()') <
          at(source, '__pikkuServerLifecycle?.afterStart')
    )
    assert.match(
      source,
      /server\.enableExitOnSignals\(\{ beforeStop: async \(\) => \{ await __pikkuServerLifecycle\?\.beforeStop\?\.\(singletonServices\) \}, afterStop: async \(\) => \{ await __pikkuServerLifecycle\?\.afterStop\?\.\(singletonServices\); await __pikkuTelemetry\.close\(\) \} \}\)/
    )
  })

  test('service start hooks run even when the app declares no lifecycle', () => {
    const source = generate({ platformServices })
    assert.match(source, /composeServerLifecycle\(undefined,/)
    assert.match(source, /__pikkuServerLifecycle\?\.beforeStart/)
  })

  test('the pool is closed after the app afterStop', () => {
    const source = generate({
      platformServices,
      db: { engine: 'postgres' },
    })
    assert.match(
      source,
      /afterStop: async \(\) => \{ await __pikkuServerLifecycle\?\.afterStop\?\.\(singletonServices\); await __pikkuPg\.close\(\); await __pikkuTelemetry\.close\(\) \}/
    )
  })
})
