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
  test('without contributors the entry is the app lifecycle alone', () => {
    const source = generateServerEntrySource(ctx({ lifecycle }))
    assert.match(source, /__pikkuLifecycle\?\.beforeStart/)
    assert.doesNotMatch(source, /createPlatformServices|composeServerLifecycle/)
    assert.match(
      source,
      /createSingletonServices\(config\)/,
      'services are built exactly as before'
    )
  })

  test('with contributors, platform services reach the app and the composed lifecycle brackets the app lifecycle', () => {
    const source = generateServerEntrySource(
      ctx({ lifecycle, platformServices })
    )
    assert.match(
      source,
      /const platformServices = await createPlatformServices\(process\.env/
    )
    assert.match(source, /createSingletonServices\(config, platformServices\)/)
    assert.match(
      source,
      /const __pikkuServerLifecycle = composeServerLifecycle\(__pikkuLifecycle, \{ start: __pikkuStartHooks, stop: __pikkuStopHooks \}\)/
    )
    const at = (needle: string) => source.indexOf(needle)
    assert.ok(
      at('__pikkuServerLifecycle?.beforeStart') < at('server.start()') &&
        at('server.start()') < at('__pikkuServerLifecycle?.afterStart'),
      'start hooks run around server.start()'
    )
    assert.match(
      source,
      /enableExitOnSignals\(\{ beforeStop: \(\) => __pikkuServerLifecycle\?\.beforeStop.*afterStop: \(\) => __pikkuServerLifecycle\?\.afterStop/
    )
  })

  test('contributor hooks run even when the app declares no lifecycle', () => {
    const source = generateServerEntrySource(ctx({ platformServices }))
    assert.match(
      source,
      /composeServerLifecycle\(undefined, \{ start: __pikkuStartHooks/
    )
    assert.match(source, /__pikkuServerLifecycle\?\.beforeStart/)
  })
})
