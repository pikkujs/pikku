import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { rmSync } from 'node:fs'
import {
  PikkuCLIConfigError,
  assertSchemaDirectoriesAreDistinct,
  getPikkuCLIConfig,
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
      join(root, '.pikku', 'workflow', 'pikku-personas.gen.ts')
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
