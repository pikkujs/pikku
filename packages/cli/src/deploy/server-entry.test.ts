import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateServerEntrySource } from './server-entry.js'

const ctx = (extra: Record<string, unknown> = {}) =>
  ({
    unit: { name: 'api', role: 'function' },
    configImport: `import { createConfig } from './config.js'`,
    servicesImport: `import { createSingletonServices } from './services.js'`,
    mcpImport: '',
    mcpServerOption: '',
    bootstrapPath: './bootstrap.js',
    configVar: 'createConfig',
    servicesVar: 'createSingletonServices',
    ...extra,
  }) as never

const lifecycle = { importPath: './lifecycle.js', variable: 'lifecycle' }
const platformServices = { importPath: './platform-services.gen.js' }

describe('generateServerEntrySource', () => {
  test('without services the entry is the app lifecycle alone', () => {
    const source = generateServerEntrySource(ctx({ lifecycle }))
    assert.match(source, /__pikkuLifecycle\?\.beforeStart/)
    assert.doesNotMatch(source, /createPlatformServices/)
    assert.match(
      source,
      /createSingletonServices\(config\)/,
      'services are built exactly as before'
    )
  })

  test('platform services reach the app, and its lifecycle runs around server.start()', () => {
    const source = generateServerEntrySource(
      ctx({ lifecycle, platformServices })
    )
    assert.match(
      source,
      /const platformServices = await createPlatformServices\(process\.env/
    )
    assert.match(source, /createSingletonServices\(config, platformServices\)/)
    assert.ok(
      source.indexOf('await createPlatformServices(') <
        source.indexOf('await createConfig('),
      'services exist before the config is read'
    )
    assert.match(
      source,
      /await createConfig\(platformServices\.variables as any\)/
    )
    const at = (needle: string) => source.indexOf(needle)
    assert.ok(
      at('__pikkuLifecycle?.beforeStart') < at('server.start()') &&
        at('server.start()') < at('__pikkuLifecycle?.afterStart'),
      'the start hooks run around server.start()'
    )
    assert.match(
      source,
      /enableExitOnSignals\(\{ beforeStop: \(\) => __pikkuLifecycle\?\.beforeStop.*afterStop: \(\) => __pikkuLifecycle\?\.afterStop/
    )
  })
})
