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
})

describe(`StandaloneProviderAdapter server lifecycle`, () => {
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

  test('the app lifecycle runs around the server, on the signal path too', () => {
    const source = generate({ lifecycle, platformServices })
    assert.ok(
      at(source, '__pikkuLifecycle?.beforeStart') <
        at(source, 'await server.start()') &&
        at(source, 'await server.start()') <
          at(source, '__pikkuLifecycle?.afterStart')
    )
    assert.match(
      source,
      /server\.enableExitOnSignals\(\{ beforeStop: async \(\) => \{ await __pikkuLifecycle\?\.beforeStop\?\.\(singletonServices\) \}, afterStop: async \(\) => \{ await __pikkuLifecycle\?\.afterStop\?\.\(singletonServices\); await __pikkuTelemetry\.close\(\) \} \}\)/
    )
  })

  test('the pool is closed after the app afterStop', () => {
    const source = generate({
      lifecycle,
      db: { engine: 'postgres' },
    })
    assert.match(
      source,
      /afterStop: async \(\) => \{ await __pikkuLifecycle\?\.afterStop\?\.\(singletonServices\); await __pikkuPg\.close\(\); await __pikkuTelemetry\.close\(\) \}/
    )
  })
})
