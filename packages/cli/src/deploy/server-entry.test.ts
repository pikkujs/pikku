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

/** Runs the entry's own address declaration against a given env and config. */
const listenAddress = (
  source: string,
  env: Record<string, string>,
  config: { hostname?: string }
): string => {
  const declaration = source.match(/const HOST = (.+)$/m)
  assert.ok(declaration, 'the entry declares no listen address')
  assert.ok(
    source.indexOf('const config = await') < declaration.index!,
    'the address is resolved once the config exists'
  )
  return new Function('process', 'config', `return ${declaration[1]}`)(
    { env },
    config
  )
}

describe('generateServerEntrySource listen address', () => {
  test('HOST wins over the configured hostname', () => {
    assert.equal(
      listenAddress(
        generateServerEntrySource(ctx()),
        { HOST: '10.0.0.1' },
        { hostname: '127.0.0.1' }
      ),
      '10.0.0.1'
    )
  })

  test('the configured hostname applies when HOST is unset or empty', () => {
    for (const env of [{}, { HOST: '' }] as Record<string, string>[]) {
      assert.equal(
        listenAddress(generateServerEntrySource(ctx()), env, {
          hostname: '127.0.0.1',
        }),
        '127.0.0.1'
      )
    }
  })

  test('every interface is the default when neither names an address', () => {
    assert.equal(
      listenAddress(generateServerEntrySource(ctx()), {}, {}),
      '0.0.0.0'
    )
  })
})
