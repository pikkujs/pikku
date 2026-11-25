import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serializeProviderRunner } from './serialize-provider-runner.js'
import type { ResolvedProviderImport } from './resolve-providers.js'

const resolved = (
  overrides: Partial<ResolvedProviderImport> & { name: string }
): ResolvedProviderImport => ({
  variant: 'common',
  needs: [],
  optional: [],
  provides: [],
  optionalProvides: [],
  module: '/p/src/services.ts',
  export: overrides.name,
  onServerStart: false,
  ...overrides,
})

const specifier = (module: string) => module.replace('/p/', './')

describe('serializeProviderRunner', () => {
  test('imports each service and registers it with its chosen variant meta', () => {
    const source = serializeProviderRunner({
      target: 'dev',
      specifier,
      services: [
        resolved({ name: 'cache', needs: ['kysely'], provides: ['cache'] }),
        resolved({ name: 'clock', variant: 'dev', provides: ['clock'] }),
      ],
    })
    assert.match(
      source,
      /import \{ cache as service0 \} from "\.\/src\/services\.ts"/
    )
    assert.match(
      source,
      /registry\.add\("cache", service0, \{"common":\{"needs":\["kysely"\],"optional":\[\],"provides":\["cache"\],"optionalProvides":\[\]\}\}, \{"kind":"singleton"\}\)/
    )
    assert.match(source, /registry\.add\("clock", service1, \{"dev":/)
    assert.match(
      source,
      /runProviders\(registry, \{ target: "dev", services, env \}\)/
    )
  })

  test('an item provider records its collection, and every collection is declared on the registry', () => {
    const source = serializeProviderRunner({
      target: 'dev',
      specifier,
      collections: ['things'],
      services: [resolved({ name: 'one', addTo: 'things' })],
    })
    assert.match(source, /\{"kind":"singleton","addTo":"things"\}\)/)
    assert.match(source, /registry\.collection\("things"\)/)
  })

  test('an addon provider is registered with the env names its addon declares, and the stop order is recorded', () => {
    const source = serializeProviderRunner({
      target: 'deploy',
      specifier,
      services: [
        resolved({
          name: 'nats/nats',
          provides: ['queueService'],
          addon: {
            namespace: 'nats',
            env: ['NATS_URL'],
            envRename: { NATS_URL: 'STAGE_NATS_URL' },
          },
        }),
      ],
    })
    assert.match(
      source,
      /\{"kind":"singleton","addon":\{"namespace":"nats","env":\["NATS_URL"\],"envRename":\{"NATS_URL":"STAGE_NATS_URL"\}\}\}\)/
    )
    assert.match(source, /const \{ stopOrder \} = await runProviders/)
    assert.match(
      source,
      /recordStopOrder\(stopOrder, Object.keys\(services\)\)/
    )
  })

  test('a deploy profile is handed to the runner so it picks the variant it was resolved for', () => {
    const source = serializeProviderRunner({
      target: 'deploy',
      profile: 'cloudflare-worker',
      specifier,
      services: [
        resolved({
          name: 'db',
          variant: 'deploy:cloudflare-worker',
          provides: ['kysely'],
        }),
      ],
    })
    assert.match(
      source,
      /runProviders\(registry, \{ target: "deploy", profile: "cloudflare-worker", services, env \}\)/
    )
    assert.match(source, /\{"deploy:cloudflare-worker":\{/)
  })

  test('a variant in its own module is imported alone, so the others never reach a bundle', () => {
    const source = serializeProviderRunner({
      target: 'deploy',
      specifier,
      services: [
        resolved({
          name: 'mailer',
          variant: 'deploy',
          provides: ['mailer'],
          variantRef: {
            module: '/p/src/mailer.deploy.ts',
            export: 'mailerDeploy',
          },
        }),
      ],
    })
    assert.match(
      source,
      /import \{ mailerDeploy as variant0 \} from "\.\/src\/mailer\.deploy\.ts"/
    )
    assert.match(source, /registry\.add\("mailer", \{ "deploy": variant0 \}, /)
    assert.doesNotMatch(source, /services\.ts/)
  })

  test('a service with onServerStart is imported whole and listed as a start hook', () => {
    const source = serializeProviderRunner({
      target: 'dev',
      specifier,
      services: [
        resolved({
          name: 'queue',
          onServerStart: true,
          variantRef: { module: '/p/src/q.dev.ts', export: 'queueDev' },
        }),
      ],
    })
    assert.match(source, /import \{ queue as service0 \}/)
    assert.doesNotMatch(source, /q\.dev/)
    assert.match(
      source,
      /serverStartHooks: ServerHook\[\] = \[\n  \{ name: "queue", run: \(services\) => service0\.onServerStart!\(services\) \},\n\]/
    )
  })

  test('with nothing to run, the file still has the same exports', () => {
    const source = serializeProviderRunner({
      target: 'dev',
      specifier,
      services: [],
    })
    assert.match(source, /export const createPlatformServices/)
    assert.match(source, /export const serverStartHooks/)
  })

  describe('column coercion', () => {
    const map = { users: { created_at: 'date' } }

    test('wraps the service providing kysely when the map is non-empty', () => {
      const source = serializeProviderRunner({
        target: 'deploy',
        specifier,
        coercionMap: map,
        services: [
          resolved({ name: 'db', provides: ['kysely'] }),
          resolved({ name: 'cache', needs: ['kysely'], provides: ['cache'] }),
        ],
      })
      assert.match(
        source,
        /import \{ createCoercionPlugin \} from '@pikku\/addon-kysely'/
      )
      assert.match(
        source,
        /const coercionMap = \{"users":\{"created_at":"date"\}\}/
      )
      assert.match(
        source,
        /registry\.add\("db", withKyselyCoercion\(service0\), /
      )
      assert.match(source, /registry\.add\("cache", service1, /)
    })

    test('a variant in its own module is wrapped as the variant', () => {
      const source = serializeProviderRunner({
        target: 'deploy',
        specifier,
        coercionMap: map,
        services: [
          resolved({
            name: 'db',
            variant: 'deploy',
            provides: ['kysely'],
            variantRef: { module: '/p/src/db.deploy.ts', export: 'dbDeploy' },
          }),
        ],
      })
      assert.match(
        source,
        /registry\.add\("db", withKyselyCoercion\(\{ "deploy": variant0 \}\), /
      )
    })

    test('emits nothing without a map, with an empty map, or without a kysely provider', () => {
      for (const options of [
        { services: [resolved({ name: 'db', provides: ['kysely'] })] },
        {
          coercionMap: {},
          services: [resolved({ name: 'db', provides: ['kysely'] })],
        },
        {
          coercionMap: map,
          services: [resolved({ name: 'cache', provides: ['cache'] })],
        },
      ]) {
        const source = serializeProviderRunner({
          target: 'deploy',
          specifier,
          ...options,
        })
        assert.doesNotMatch(source, /Coercion|@pikku\/addon-kysely/)
      }
    })

    test('the kysely a service returns carries the plugin before a dependent runs', async () => {
      const base = join(import.meta.dir, '..', '..', '.tmp')
      mkdirSync(base, { recursive: true })
      const dir = mkdtempSync(join(base, 'coercion-'))
      try {
        // The package is not needed to prove the wrap: stand in for the plugin.
        const stub = join(dir, 'node_modules', '@pikku', 'addon-kysely')
        mkdirSync(stub, { recursive: true })
        writeFileSync(
          join(stub, 'package.json'),
          '{"name":"@pikku/addon-kysely","type":"module","main":"index.js"}'
        )
        writeFileSync(
          join(stub, 'index.js'),
          'export const createCoercionPlugin = ({ map }) => ({ map })\n'
        )
        writeFileSync(
          join(dir, 'services.ts'),
          `export const db = {
  deploy: () => ({ kysely: { plugins: [], destroyed: 0, destroy() { this.destroyed++ }, withPlugin(p) { return { ...this, plugins: [...this.plugins, p] } } } }),
}
export const cache = ({ kysely }) => ({ cache: { plugins: kysely.plugins.length } })
`
        )
        writeFileSync(
          join(dir, 'runner.ts'),
          serializeProviderRunner({
            target: 'deploy',
            specifier: () => './services.ts',
            coercionMap: map,
            services: [
              resolved({
                name: 'db',
                variant: 'deploy',
                provides: ['kysely'],
                module: 'x',
              }),
              resolved({
                name: 'cache',
                needs: ['kysely'],
                provides: ['cache'],
                module: 'x',
              }),
            ],
          })
        )
        const runner = await import(pathToFileURL(join(dir, 'runner.ts')).href)
        const services = await runner.createPlatformServices({}, {})
        assert.deepEqual(services.kysely.plugins, [{ map }])
        assert.deepEqual(services.cache, { plugins: 1 })
        await services.kysely.stop()
        assert.equal(services.kysely.destroyed, 1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('the generated file runs', () => {
    let dir: string
    beforeEach(() => {
      // Inside the package so `@pikku/core` resolves; `.tmp/` is git-ignored.
      const base = join(import.meta.dir, '..', '..', '.tmp')
      mkdirSync(base, { recursive: true })
      dir = mkdtempSync(join(base, 'runner-'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    test('builds services in dependency order over the baseline and returns the whole bag', async () => {
      writeFileSync(
        join(dir, 'services.ts'),
        `export const mailer = ({ logger }) => ({ mailer: { from: logger } })
export const inbox = {
  dev: ({ mailer }) => ({ inbox: { via: mailer.from } }),
  onServerStart(services) { services.started = true },
}
`
      )
      const source = serializeProviderRunner({
        target: 'dev',
        specifier: () => './services.ts',
        services: [
          resolved({
            name: 'mailer',
            needs: ['logger'],
            provides: ['mailer'],
            module: 'x',
          }),
          resolved({
            name: 'inbox',
            variant: 'dev',
            needs: ['mailer'],
            provides: ['inbox'],
            onServerStart: true,
            module: 'x',
          }),
        ],
      })
      writeFileSync(join(dir, 'runner.ts'), source)
      const runner = await import(pathToFileURL(join(dir, 'runner.ts')).href)
      const services = await runner.createPlatformServices(
        {},
        { logger: 'log' }
      )
      assert.deepEqual(services, {
        logger: 'log',
        mailer: { from: 'log' },
        inbox: { via: 'log' },
      })
      assert.deepEqual(
        runner.serverStartHooks.map((hook: { name: string }) => hook.name),
        ['inbox']
      )
      await runner.serverStartHooks[0].run(services)
      assert.equal(services.started, true)
    })

    test('a need the entry does not hold fails with the service named', async () => {
      writeFileSync(
        join(dir, 'services.ts'),
        `export const mailer = ({ kysely }) => ({ mailer: kysely })\n`
      )
      writeFileSync(
        join(dir, 'runner.ts'),
        serializeProviderRunner({
          target: 'deploy',
          specifier: () => './services.ts',
          services: [
            resolved({
              name: 'mailer',
              needs: ['kysely'],
              provides: ['mailer'],
              module: 'x',
            }),
          ],
        })
      )
      const runner = await import(pathToFileURL(join(dir, 'runner.ts')).href)
      await assert.rejects(
        runner.createPlatformServices({}, { logger: 1 }),
        /'mailer' needs 'kysely' on deploy/
      )
    })
  })

  test('per-request providers get their own registry, and the runner registers how to build them', () => {
    const source = serializeProviderRunner({
      target: 'deploy',
      profile: 'standalone',
      specifier,
      services: [resolved({ name: 'cache', provides: ['cache'] })],
      wire: [
        resolved({
          name: 'scope',
          needs: ['cache'],
          provides: ['requestScope'],
        }),
      ],
    })
    assert.match(source, /WireProviders/)
    assert.match(
      source,
      /wireRegistry\.add\("scope", service1, \{"common":\{"needs":\["cache"\],"optional":\[\],"provides":\["requestScope"\],"optionalProvides":\[\]\}\}, \{"kind":"wire"\}\)/
    )
    assert.match(
      source,
      /new WireProviders\(wireRegistry, \{ target: "deploy", profile: "standalone", \}\)/
    )
    assert.match(source, /export const createProviderWireServices/)
    assert.match(
      source,
      /pikkuState\(null, 'package', 'wireProviders', createProviderWireServices\)/
    )
    assert.doesNotMatch(source, /registry\.add\("scope"/)
  })

  test('a runner with no per-request providers registers none', () => {
    const source = serializeProviderRunner({
      target: 'dev',
      specifier,
      services: [resolved({ name: 'cache', provides: ['cache'] })],
    })
    assert.doesNotMatch(source, /WireProviders|wireProviders/)
  })
})
