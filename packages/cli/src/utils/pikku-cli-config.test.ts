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
        outDir: '.pikku',
        tsconfig: 'tsconfig.json',
        filters: {},
        ...extra,
      })
    )
    return root
  }

  test('rejects the old startServerFnsFile key by name', async () => {
    const root = await writeConfig({
      clientFiles: { startServerFnsFile: './src/lib/pikku-start.gen.ts' },
    })

    await assert.rejects(
      () =>
        getPikkuCLIConfig(silentLogger, join(root, 'pikku.config.json'), []),
      /startServerFnsFile is now clientFiles\.tanstackStartFile/
    )
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
          outDir: '.pikku',
          tsconfig: 'tsconfig.json',
          db: {
            engine: 'postgres',
            pgVersion: 18,
          },
          filters: {},
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
      config.personasWiringFile,
      join(root, '.pikku', 'scenarios', 'pikku-personas.gen.ts')
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

  test('a custom scenarioSchemaDirectory is honoured', async () => {
    const root = await writeConfig({
      scenarioSchemaDirectory: 'generated/scenario-schemas',
    })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.equal(
      config.scenarioSchemaDirectory,
      join(root, 'generated', 'scenario-schemas')
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

  test('a scenario schema directory equal to the app one is rejected', async () => {
    // The scenario write owns its directory: it emits register.gen.ts and prunes
    // every schema file its own required-set does not name. Sharing the app's
    // directory would replace the application register with the scenario-only
    // one, which nothing downstream can detect.
    const root = await writeConfig({
      scenarioSchemaDirectory: '.pikku/schemas',
    })

    await assert.rejects(
      getPikkuCLIConfig(
        silentLogger,
        join(root, 'pikku.config.json'),
        [],
        false
      ),
      (e: unknown) =>
        e instanceof PikkuCLIConfigError &&
        /scenarioSchemaDirectory must not be the same directory/.test(
          (e as Error).message
        )
    )
  })

  test('a frontend directory is resolved relative to the config file', async () => {
    const root = await writeConfig({ frontend: { dir: './web/dist' } })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.equal(config.frontend?.dir, join(root, 'web', 'dist'))
  })

  test('a frontend mount defaults to the root with a SPA fallback', async () => {
    const root = await writeConfig({ frontend: { dir: './web/dist' } })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.equal(config.frontend?.urlPrefix, '/')
    assert.equal(config.frontend?.spaFallback, true)
  })

  test('a frontend urlPrefix keeps no trailing slash', async () => {
    // The mount compares `pathname === prefix || pathname.startsWith(prefix + '/')`,
    // so a stored `/app/` would match nothing at all.
    const root = await writeConfig({
      frontend: { dir: './web/dist', urlPrefix: '/app/' },
    })

    const config = await getPikkuCLIConfig(
      silentLogger,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.equal(config.frontend?.urlPrefix, '/app')
  })

  test('a frontend urlPrefix that is not a path is rejected', async () => {
    const root = await writeConfig({
      frontend: { dir: './web/dist', urlPrefix: 'app' },
    })

    await assert.rejects(
      getPikkuCLIConfig(
        silentLogger,
        join(root, 'pikku.config.json'),
        [],
        false
      ),
      (e: unknown) =>
        e instanceof PikkuCLIConfigError &&
        /frontend\.urlPrefix must start with/.test((e as Error).message)
    )
  })

  test('a frontend without a directory is rejected', async () => {
    const root = await writeConfig({ frontend: { urlPrefix: '/' } })

    await assert.rejects(
      getPikkuCLIConfig(
        silentLogger,
        join(root, 'pikku.config.json'),
        [],
        false
      ),
      (e: unknown) =>
        e instanceof PikkuCLIConfigError &&
        /frontend\.dir is required/.test((e as Error).message)
    )
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
    assert.throws(() => normalizeMetaLocale('German, please'), PikkuCLIConfigError)
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
        outDir: '.pikku',
        tsconfig: 'tsconfig.json',
        filters: {},
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
