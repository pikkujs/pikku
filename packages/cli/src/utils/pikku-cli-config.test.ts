import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { rmSync } from 'node:fs'
import {
  DEFAULT_META_LOCALE,
  PikkuCLIConfigError,
  assertSchemaDirectoriesAreDistinct,
  getPikkuCLIConfig,
  normalizeMetaLocale,
  tryGetPikkuCLIConfig,
} from './pikku-cli-config.js'
import { isExpectedError } from '@pikku/core/errors'

describe('getPikkuCLIConfig', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const silentLogger = { error() {}, warn() {}, info() {} } as never

  const writeConfig = async (extra: Record<string, unknown> = {}) => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-config-'))
    tempDirs.push(root)
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
      join(root, 'pikku.config.json'),
      JSON.stringify({
        rootDir: '.',
        srcDirectories: ['src'],
        packageMappings: {},
        tsconfig: 'tsconfig.json',
        backends: { api: { filter: {} } },
        ...extra,
      })
    )
    return root
  }

  test('derives the analytics scaffold outputs and leaves the union in src', async () => {
    const root = await writeConfig({ scaffold: { analytics: true } })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      []
    )

    assert.equal(
      config.analyticsFile,
      join(root, 'src', 'scaffold', 'analytics', 'analytics.gen.ts')
    )
  })

  test('derives no analytics paths when the scaffold is off', async () => {
    const root = await writeConfig()

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      []
    )

    assert.equal(config.analyticsFile, undefined)
  })

  test('rejects the old startServerFnsFile key by name', async () => {
    const root = await writeConfig({
      clientFiles: { startServerFnsFile: './src/lib/pikku-start.gen.ts' },
    })

    await assert.rejects(
      () =>
        getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), []),
      /startServerFnsFile .* is now clientFiles\.tanstackStartFile/
    )
  })

  for (const section of ['dev', 'deploy']) {
    test(`rejects ${section}.contributors by name and says how to migrate`, async () => {
      const root = await writeConfig({
        [section]: { contributors: ['./c.ts'] },
      })

      await assert.rejects(
        () =>
          getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), []),
        (e: Error) => {
          assert.ok(e.message.includes(`${section}.contributors`))
          assert.match(e.message, /defineContributors/)
          assert.match(e.message, /wireAddon/)
          assert.match(e.message, /docs\/contributors\.md/)
          return true
        }
      )
    })
  }

  const load = (root: string) =>
    getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), [])

  describe('backends', () => {
    test('loads the declared backends', async () => {
      const root = await writeConfig({
        backends: {
          api: { filter: { tags: ['api'] }, dev: { port: 4000 } },
          jobs: { filter: { tags: ['jobs'] }, dev: { port: 4001 } },
        },
      })
      const config = await load(root)
      assert.deepEqual(Object.keys(config.backends), ['api', 'jobs'])
      assert.deepEqual(config.backends.api.filter, { tags: ['api'] })
    })

    test('refuses a generated-client path and names .pikku/sdk', async () => {
      const root = await writeConfig({
        clientFiles: { fetchFile: '.pikku/pikku-fetch.gen.ts' },
      })
      await assert.rejects(load(root), /\.pikku\/sdk\/<backend>\//)
    })

    test('refuses a map declaration path', async () => {
      const root = await writeConfig({
        rpcRemoteMapDeclarationFile: '.pikku/remote.d.ts',
      })
      await assert.rejects(load(root), /rpcRemoteMapDeclarationFile/)
    })

    test('keeps frontend glue paths', async () => {
      const root = await writeConfig({
        clientFiles: { tanstackStartFile: 'src/pikku.ts' },
      })
      assert.equal(
        (await load(root)).clientFiles?.tanstackStartFile,
        join(root, 'src/pikku.ts')
      )
    })

    test('refuses a non-boolean publish', async () => {
      const root = await writeConfig({ backends: { api: { publish: 'yes' } } })
      await assert.rejects(load(root), /publish/)
    })

    test('refuses a config with neither backends nor frontends', async () => {
      const root = await writeConfig({ backends: undefined })
      await assert.rejects(
        load(root),
        /declares no backends and no frontends.*at least one of backends or frontends/
      )
    })

    test('refuses empty backends and frontends tables', async () => {
      const root = await writeConfig({ backends: {}, frontends: {} })
      await assert.rejects(load(root), /declares no backends and no frontends/)
    })

    test('accepts backends only', async () => {
      const root = await writeConfig()
      const config = await load(root)
      assert.deepEqual(Object.keys(config.backends ?? {}), ['api'])
      assert.equal(config.frontends, undefined)
    })

    test('accepts frontends only', async () => {
      const root = await writeConfig({
        backends: undefined,
        frontends: { web: { cwd: './web' } },
      })
      const config = await load(root)
      assert.equal(config.backends, undefined)
      assert.deepEqual(Object.keys(config.frontends ?? {}), ['web'])
    })

    test('accepts backends and frontends', async () => {
      const root = await writeConfig({ frontends: { web: { cwd: './web' } } })
      const config = await load(root)
      assert.deepEqual(Object.keys(config.backends ?? {}), ['api'])
      assert.deepEqual(Object.keys(config.frontends ?? {}), ['web'])
    })

    test('a frontend-only project may omit environments.<name>.backends', async () => {
      const root = await writeConfig({
        backends: undefined,
        frontends: { web: { cwd: './web' } },
        environments: {
          local: { frontends: { web: 'http://localhost:5000' } },
        },
      })
      const config = await load(root)
      assert.deepEqual(config.environments?.local?.backends, {})
    })

    test('a project with backends still needs environments.<name>.backends', async () => {
      const root = await writeConfig({
        environments: {
          local: { frontends: { web: 'http://localhost:5000' } },
        },
      })
      await assert.rejects(load(root), /must name at least one backend/)
    })

    test('an addon declares no backends', async () => {
      const root = await writeConfig({ backends: undefined, addon: true })
      await writeFile(join(root, 'package.json'), '{"name":"my-addon"}')
      assert.equal((await load(root)).addon, true)
    })

    test('names backends.<name>.filter as the home of namedFilters', async () => {
      const root = await writeConfig({
        namedFilters: { api: { tags: ['api'] } },
      })
      await assert.rejects(load(root), /namedFilters .* moved to backends/)
    })

    test('names backends.<name>.filter as the home of a config-file filters', async () => {
      const root = await writeConfig({ filters: {} })
      await assert.rejects(load(root), /filters .* backends\.<name>\.filter/)
    })

    test('rejects extends', async () => {
      const root = await writeConfig({ extends: './base.json' })
      await assert.rejects(load(root), /extends .* no longer supported/)
    })

    test('requires dev.port once two backends are declared', async () => {
      const root = await writeConfig({
        backends: { a: { dev: { port: 4000 } }, b: {} },
      })
      await assert.rejects(load(root), /backends\.b\.dev\.port is required/)
    })

    test('lets a single backend leave the port to be picked', async () => {
      const root = await writeConfig({ backends: { only: {} } })
      assert.deepEqual(Object.keys((await load(root)).backends), ['only'])
    })

    test('refuses two backends on one port', async () => {
      const root = await writeConfig({
        backends: { a: { dev: { port: 4000 } }, b: { dev: { port: 4000 } } },
      })
      await assert.rejects(load(root), /both set dev\.port 4000/)
    })
  })

  describe('strict keys', () => {
    const rejects = async (extra: Record<string, unknown>, message: RegExp) =>
      assert.rejects(load(await writeConfig(extra)), message)

    test('an unknown top-level key is named', async () => {
      await rejects(
        { bogus: 1 },
        /bogus in .* is not a pikku\.config\.json key/
      )
    })

    test('an unknown nested key is named with its section', async () => {
      await rejects(
        { scaffold: { nope: true } },
        /scaffold\.nope in .* is not a pikku\.config\.json key/
      )
      await rejects(
        { backends: { api: { filter: {}, typo: 1 } } },
        /backends\.api\.typo/
      )
    })

    test('outDir is fixed beside the config', async () => {
      await rejects({ outDir: '.pikku' }, /outDir .* no longer a config key/)
      const config = await load(await writeConfig())
      assert.equal(config.outDir, join(config.configDir, '.pikku'))
    })

    test('dev moved to backends.<name>.dev', async () => {
      await rejects({ dev: { db: true } }, /dev .* backends\.<name>\.dev/)
    })

    describe('content buckets', () => {
      const withBackend = (content: unknown) => ({
        content: { buckets: ['a', 'b'] },
        backends: { api: { filter: {}, content } },
      })

      test('the accepted shape loads', async () => {
        const config = await load(
          await writeConfig({
            content: {
              contentPath: 'files',
              sizeLimit: '2mb',
              buckets: ['a', 'b'],
            },
            backends: {
              api: {
                filter: {},
                dev: { port: 4001 },
                content: { buckets: ['a'], assetUrlPrefix: '/content' },
              },
              jobs: { filter: {}, dev: { port: 4002 } },
            },
          })
        )
        assert.deepEqual(config.content?.buckets, ['a', 'b'])
        assert.deepEqual(config.backends.api?.content?.buckets, ['a'])
        assert.equal(config.backends.jobs?.content, undefined)
      })

      test('a bucket the root does not declare is refused', async () => {
        await rejects(
          withBackend({ buckets: ['a', 'c'] }),
          /backends\.api\.content\.buckets .* 'c', which is not in the root content\.buckets/
        )
      })

      test('contentPath and sizeLimit in a backend name the root', async () => {
        await rejects(
          withBackend({ buckets: ['a'], contentPath: 'x' }),
          /backends\.api\.content\.contentPath .* root `content`/
        )
        await rejects(
          withBackend({ buckets: ['a'], sizeLimit: '2mb' }),
          /backends\.api\.content\.sizeLimit .* root `content`/
        )
      })

      test('prefixes at the root name the backend', async () => {
        await rejects(
          { content: { buckets: ['a'], uploadUrlPrefix: '/u' } },
          /content\.uploadUrlPrefix .* per backend/
        )
      })

      test('a backend using content with no root buckets is refused', async () => {
        await rejects(
          { backends: { api: { filter: {}, content: { buckets: ['a'] } } } },
          /declares no `content\.buckets`/
        )
        await rejects(
          {
            content: { sizeLimit: '2mb' },
            backends: { api: { filter: {}, content: { buckets: ['a'] } } },
          },
          /content\.buckets .* non-empty list/
        )
      })

      test('a backend without buckets is refused rather than open', async () => {
        await rejects(
          withBackend({ assetUrlPrefix: '/c' }),
          /backends\.api\.content\.buckets .* non-empty list/
        )
      })

      test('empty, duplicate and invalid names are refused', async () => {
        await rejects(withBackend({ buckets: [] }), /non-empty list/)
        await rejects(withBackend({ buckets: ['a', 'a'] }), /'a' twice/)
        for (const bad of ['', '../x', 'a/b', '_public', 7]) {
          await rejects(
            { content: { buckets: [bad] }, backends: { api: { filter: {} } } },
            /invalid bucket name/
          )
        }
      })
    })

    test('a generated path is not configurable', async () => {
      await rejects(
        { scenarioSchemaDirectory: 'x' },
        /scenarioSchemaDirectory .* generated path/
      )
    })

    test('keys nobody reads are refused', async () => {
      for (const key of ['entrypoint', 'showcase', 'fabric', 'node']) {
        await rejects({ [key]: 'x' }, new RegExp(`${key} in .* not read`))
      }
    })

    test('a stray top-level supportsImportAttributes points at schema', async () => {
      await rejects(
        { supportsImportAttributes: true },
        /is now schema\.supportsImportAttributes/
      )
    })

    test('a CLI flag leaked into the config is named as one', async () => {
      await rejects({ security: true }, /`--security` flag/)
    })

    test('addons is not a collection yet', async () => {
      await rejects({ addons: {} }, /addons .* wireAddon/)
    })

    test('an addon is held to the same keys', async () => {
      await rejects({ addon: true, backends: undefined, outDir: 'x' }, /outDir/)
    })
  })

  describe('environments', () => {
    test('expands a url and derives a local one from dev.port', async () => {
      const root = await writeConfig({
        backends: { api: { dev: { port: 4021 } } },
        environments: {
          local: {
            backends: { api: {} },
            frontends: { web: 'http://localhost:5000' },
          },
          prod: {
            backends: {
              api: { url: 'https://api.test', signInPath: '/auth/sign-in/x' },
            },
            production: true,
          },
        },
      })
      const { environments } = await load(root)
      assert.deepEqual(environments?.local, {
        backends: { api: { url: 'http://localhost:4021' } },
        frontends: { web: 'http://localhost:5000' },
      })
      assert.deepEqual(environments?.prod?.backends.api, {
        url: 'https://api.test',
        signInPath: '/auth/sign-in/x',
      })
      assert.equal(environments?.prod?.production, true)
    })

    test('the string shorthand is a url', async () => {
      const root = await writeConfig({
        environments: { stage: { backends: { api: 'https://s.test' } } },
      })
      assert.equal(
        (await load(root)).environments?.stage?.backends.api?.url,
        'https://s.test'
      )
    })

    test('the old flat keys are refused with their new home', async () => {
      for (const [key, home] of [
        ['apiUrl', 'backends'],
        ['appUrl', 'frontends'],
        ['signInPath', 'backends'],
      ] as const) {
        const root = await writeConfig({
          environments: { local: { [key]: 'x' } },
        })
        await assert.rejects(load(root), new RegExp(`${key} .* ${home}`))
      }
    })

    test('a backend with neither url nor dev.port is refused', async () => {
      const root = await writeConfig({
        environments: { local: { backends: { api: {} } } },
      })
      await assert.rejects(load(root), /no url, and backends\.api\.dev\.port/)
    })

    test('an undeclared backend is refused', async () => {
      const root = await writeConfig({
        environments: { local: { backends: { ghost: 'http://x.test' } } },
      })
      await assert.rejects(load(root), /does not declare/)
    })
  })

  test('rejects a console scaffold still carrying the removed auth key', async () => {
    const root = await writeConfig({
      scaffold: { console: { auth: false } },
    })

    await assert.rejects(
      () =>
        getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), []),
      /scaffold\.console no longer takes "auth"/
    )
  })

  test('resolves tanstackStartFile relative to the config', async () => {
    const root = await writeConfig({
      clientFiles: { tanstackStartFile: './src/lib/pikku-start.gen.ts' },
    })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      []
    )

    assert.equal(
      config.clientFiles?.tanstackStartFile,
      join(root, 'src/lib/pikku-start.gen.ts')
    )
  })

  test('preserves db.engine and db.pgVersion from pikku.config.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-config-'))
    tempDirs.push(root)

    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
      join(root, 'pikku.config.json'),
      JSON.stringify(
        {
          rootDir: '.',
          srcDirectories: ['src'],
          packageMappings: {},
          tsconfig: 'tsconfig.json',
          db: {
            engine: 'postgres',
            pgVersion: 18,
          },
          backends: { api: { filter: {} } },
        },
        null,
        2
      )
    )

    const logger = {
      error() {},
      warn() {},
      info() {},
    }

    const config = await getPikkuCLIConfig(
      logger as never,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.deepStrictEqual(config.db, { engine: 'postgres', pgVersion: 18 })
    assert.equal(
      config.virtualUsersWiringFile,
      join(root, '.pikku', 'scenarios', 'pikku-virtual-users.gen.ts')
    )
  })

  test('scenario schemas default to their own directory, not the app register', async () => {
    const root = await writeConfig()

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.equal(config.schemaDirectory, join(root, '.pikku', 'schemas'))
    assert.equal(
      config.scenarioSchemaDirectory,
      join(root, '.pikku', 'scenarios', 'schemas')
    )
  })

  test('metaLocale defaults to English when the config does not name one', async () => {
    const root = await writeConfig()

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      []
    )

    assert.equal(config.metaLocale, DEFAULT_META_LOCALE)
  })

  test('tsconfig defaults to tsconfig.json in the root, as tsc does', async () => {
    const root = await writeConfig({ tsconfig: undefined })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      []
    )

    assert.equal(config.tsconfig, join(root, 'tsconfig.json'))
  })

  test('a declared metaLocale survives the load, canonicalized', async () => {
    const root = await writeConfig({ metaLocale: 'de-de' })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      []
    )

    assert.equal(config.metaLocale, 'de-DE')
  })

  test('the former spelling `locale` is refused with the new name', async () => {
    const root = await writeConfig({ locale: 'de' })

    await assert.rejects(
      () =>
        getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), []),
      (error: unknown) => {
        assert.ok(error instanceof PikkuCLIConfigError)
        assert.match(error.message, /renamed to metaLocale/)
        // The error has to teach the distinction, not just the new spelling —
        // being ignored is what the rename exists to prevent.
        assert.match(error.message, /defaultLocale in active\.json/)
        return true
      }
    )
  })

  test('a metaLocale that is not a language tag names itself in the error', async () => {
    const root = await writeConfig({ metaLocale: 'de_DE' })

    await assert.rejects(
      () =>
        getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), []),
      (error: unknown) => {
        assert.ok(error instanceof PikkuCLIConfigError)
        assert.match(error.message, /metaLocale in pikku\.config\.json/)
        assert.match(error.message, /"de_DE"/)
        return true
      }
    )
  })

  test('a scenario schema directory equal to the app one is rejected', () => {
    // The scenario write owns its directory: it emits register.gen.ts and prunes
    // every schema file its own required-set does not name. Sharing the app's
    // directory would replace the application register with the scenario-only
    // one, which nothing downstream can detect.
    assert.throws(
      () =>
        assertSchemaDirectoriesAreDistinct({
          schemaDirectory: '/p/.pikku/schemas',
          scenarioSchemaDirectory: '/p/.pikku/schemas',
        }),
      /scenarioSchemaDirectory must not be the same directory/
    )
  })

  const loadConfig = (root: string) =>
    getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), [], false)

  const rejectsWith = (root: string, message: RegExp) =>
    assert.rejects(
      loadConfig(root),
      (e: unknown) =>
        e instanceof PikkuCLIConfigError && message.test((e as Error).message)
    )

  test('a frontend cwd is resolved relative to the config file, and dist to its cwd', async () => {
    const root = await writeConfig({ frontends: { web: { cwd: './web' } } })

    const config = await loadConfig(root)

    assert.equal(config.frontends?.web?.cwd, join(root, 'web'))
    assert.equal(config.frontends?.web?.dist, join(root, 'web', 'dist'))
    assert.equal(config.frontends?.web?.serve, undefined)
  })

  test('a frontend dist is resolved relative to its cwd', async () => {
    const root = await writeConfig({
      frontends: { web: { cwd: './web', dist: 'dist/client' } },
    })

    const config = await loadConfig(root)

    assert.equal(
      config.frontends?.web?.dist,
      join(root, 'web', 'dist', 'client')
    )
  })

  test('a served frontend defaults to the root with a SPA fallback', async () => {
    const root = await writeConfig({
      frontends: { web: { cwd: './web', serve: {} } },
    })

    const config = await loadConfig(root)

    assert.deepEqual(config.frontends?.web?.serve, {
      urlPrefix: '/',
      spaFallback: true,
    })
  })

  test('a served frontend urlPrefix keeps no trailing slash', async () => {
    // The mount compares `pathname === prefix || pathname.startsWith(prefix + '/')`,
    // so a stored `/app/` would match nothing at all.
    const root = await writeConfig({
      frontends: { web: { cwd: './web', serve: { urlPrefix: '/app/' } } },
    })

    const config = await loadConfig(root)

    assert.equal(config.frontends?.web?.serve?.urlPrefix, '/app')
  })

  test('a served frontend urlPrefix that is not a path is rejected', async () => {
    const root = await writeConfig({
      frontends: { web: { cwd: './web', serve: { urlPrefix: 'app' } } },
    })

    await rejectsWith(root, /frontends\.web\.serve\.urlPrefix must start with/)
  })

  test('a frontend without a cwd is rejected', async () => {
    const root = await writeConfig({ frontends: { web: { dist: 'dist' } } })

    await rejectsWith(root, /frontends\.web\.cwd is required/)
  })

  test('two served frontends are rejected', async () => {
    const root = await writeConfig({
      frontends: {
        web: { cwd: './web', serve: {} },
        admin: { cwd: './admin', serve: { urlPrefix: '/admin' } },
      },
    })

    await rejectsWith(root, /web and admin both set "serve"/)
  })

  describe('deploy keys', () => {
    const load = async (extra: Record<string, unknown>) => {
      const root = await writeConfig(extra)
      return getPikkuCLIConfig(
        silentLogger,
        join(root, 'pikku.config.json'),
        []
      )
    }

    test('accepts a project default with per-backend and per-frontend overrides', async () => {
      const config = await load({
        deploy: { provider: 'cloudflare', target: 'serverless' },
        backends: {
          api: {
            filter: {},
            dev: { port: 4001 },
            deploy: {
              provider: 'standalone',
              target: 'server',
              grouping: { strategy: 'single' },
            },
          },
          jobs: { filter: {}, dev: { port: 4002 } },
        },
        frontends: {
          web: { cwd: 'apps/web', deploy: { provider: 'bunny' } },
          off: { cwd: 'apps/off', deploy: false },
        },
      })
      assert.equal(config.deploy?.provider, 'cloudflare')
    })

    for (const [key, home] of [
      ['defaultProvider', 'deploy.provider'],
      ['defaultTarget', 'deploy.target'],
      ['grouping', 'backends.<name>.deploy.grouping'],
      ['embed', 'backends.<name>.deploy.embed'],
    ] as const) {
      test(`refuses deploy.${key}, naming ${home}`, async () => {
        await assert.rejects(
          () =>
            load({ deploy: { [key]: key === 'defaultProvider' ? 'x' : {} } }),
          (error: Error) => {
            assert.ok(error instanceof PikkuCLIConfigError)
            assert.ok(error.message.includes(`deploy.${key}`))
            assert.ok(error.message.includes(home))
            return true
          }
        )
      })
    }

    test('refuses a backend deploy key it does not know', async () => {
      await assert.rejects(
        () =>
          load({
            backends: { api: { filter: {}, deploy: { bundler: 'bun' } } },
          }),
        /backends\.api\.deploy\.bundler .* not a deploy key here/
      )
    })

    test('refuses a backend target that is not a target', async () => {
      await assert.rejects(
        () =>
          load({
            backends: { api: { filter: {}, deploy: { target: 'edge' } } },
          }),
        /backends\.api\.deploy\.target .* 'serverless' or 'server'/
      )
    })

    test('refuses a frontend deploy that is neither false nor an object', async () => {
      await assert.rejects(
        () =>
          load({
            frontends: { web: { cwd: 'apps/web', deploy: 'cloudflare' } },
          }),
        /frontends\.web\.deploy .* false or an object/
      )
    })
  })
})

describe('assertSchemaDirectoriesAreDistinct', () => {
  test('accepts two different directories', () => {
    assertSchemaDirectoriesAreDistinct({
      schemaDirectory: '/app/.pikku/schemas',
      scenarioSchemaDirectory: '/app/.pikku/scenarios/schemas',
    })
  })

  test('rejects paths that differ only in spelling', () => {
    assert.throws(
      () =>
        assertSchemaDirectoriesAreDistinct({
          schemaDirectory: '/app/.pikku/schemas',
          scenarioSchemaDirectory: '/app/.pikku/scenarios/../schemas',
        }),
      PikkuCLIConfigError
    )
  })
})

describe('normalizeMetaLocale', () => {
  test('an absent metaLocale is English rather than an error', () => {
    assert.equal(normalizeMetaLocale(undefined), DEFAULT_META_LOCALE)
    assert.equal(normalizeMetaLocale(null), DEFAULT_META_LOCALE)
  })

  test('canonicalizes so one language is one value downstream', () => {
    assert.equal(normalizeMetaLocale('en'), 'en')
    assert.equal(normalizeMetaLocale(' de '), 'de')
    assert.equal(normalizeMetaLocale('pt-br'), 'pt-BR')
    assert.equal(normalizeMetaLocale('EN-gb'), 'en-GB')
  })

  test('rejects the POSIX underscore people reach for', () => {
    assert.throws(() => normalizeMetaLocale('de_DE'), PikkuCLIConfigError)
  })

  test('rejects what is not a tag at all', () => {
    assert.throws(() => normalizeMetaLocale(''), PikkuCLIConfigError)
    assert.throws(() => normalizeMetaLocale('   '), PikkuCLIConfigError)
    assert.throws(
      () => normalizeMetaLocale('German, please'),
      PikkuCLIConfigError
    )
    assert.throws(() => normalizeMetaLocale(42), PikkuCLIConfigError)
    assert.throws(() => normalizeMetaLocale(['de']), PikkuCLIConfigError)
  })

  test('the error points at the two settings it is not', () => {
    assert.throws(
      () => normalizeMetaLocale('de_DE'),
      /Identifiers stay English regardless.*defaultLocale in active\.json/s
    )
  })
})

describe('tryGetPikkuCLIConfig', () => {
  const tempDirs: string[] = []
  const cwd = process.cwd()

  after(() => {
    process.chdir(cwd)
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const silentLogger = { error() {}, warn() {}, info() {} } as never

  test('returns null in a repo that is not a Pikku project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-no-config-'))
    tempDirs.push(root)
    // The upward walk stops at a repo root, so this pins the search to `root`
    // instead of letting it escape into whatever contains the temp directory.
    await mkdir(join(root, '.git'), { recursive: true })

    process.chdir(root)
    assert.equal(await tryGetPikkuCLIConfig(silentLogger, undefined, []), null)
  })

  test('returns the config when the project has one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-config-'))
    tempDirs.push(root)
    await mkdir(join(root, '.git'), { recursive: true })
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
      join(root, 'pikku.config.json'),
      JSON.stringify({
        rootDir: '.',
        srcDirectories: ['src'],
        packageMappings: {},
        tsconfig: 'tsconfig.json',
        backends: { api: { filter: {} } },
      })
    )

    process.chdir(root)
    const config = await tryGetPikkuCLIConfig(silentLogger, undefined, [])
    assert.deepEqual(config?.srcDirectories, ['src'])
  })

  test('still throws when a config exists but cannot be loaded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-bad-config-'))
    tempDirs.push(root)
    await mkdir(join(root, '.git'), { recursive: true })
    await writeFile(join(root, 'pikku.config.json'), '{ not json')

    process.chdir(root)
    await assert.rejects(() =>
      tryGetPikkuCLIConfig(silentLogger, undefined, [])
    )
  })
})

describe('getPikkuCLIConfig outside a project', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const silentLogger = { error() {}, warn() {}, info() {} } as never

  test('a missing config is an instruction, not a stack trace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-no-config-'))
    tempDirs.push(root)
    await mkdir(join(root, '.git'), { recursive: true })

    process.chdir(root)
    await assert.rejects(
      () => getPikkuCLIConfig(silentLogger, undefined, []),
      (error: unknown) => {
        assert.ok(
          error instanceof PikkuCLIConfigError,
          "a missing config must be an expected error, or formatCLIError prints the loader's frames in front of the one sentence that says what to do"
        )
        assert.ok(isExpectedError(error))
        assert.match((error as Error).message, /No pikku\.config\.json/)
        assert.match((error as Error).message, /--config <path>/)
        return true
      }
    )
  })
})
