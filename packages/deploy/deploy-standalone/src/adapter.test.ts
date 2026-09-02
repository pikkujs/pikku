import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { StandaloneProviderAdapter } from './adapter.js'

const baseContext = {
  unit: { name: 'app', role: 'function' },
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

const withFrontend = {
  ...(baseContext as object),
  frontend: { urlPrefix: '/', spaFallback: true },
} as never

describe('StandaloneProviderAdapter frontend serving', () => {
  test('a node entry without a frontend mounts nothing', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(baseContext)

    assert.doesNotMatch(source, /staticMounts/)
  })

  test('a bun entry without a frontend imports no asset manifest', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(baseContext)

    assert.doesNotMatch(source, /frontend-assets/)
    assert.doesNotMatch(source, /staticMounts/)
  })

  test('a node entry serves the frontend from a directory beside the bundle', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withFrontend)

    assert.match(source, /staticMounts/)
    assert.match(
      source,
      /import\.meta\.url/,
      'the directory must be resolved from the running bundle, not the build machine'
    )
    assert.doesNotMatch(
      source,
      /assets:/,
      'node reads the copied directory rather than an embed map'
    )
  })

  test('a bun entry serves the frontend from the embedded asset map', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(withFrontend)

    assert.match(source, /from '\.\/frontend-assets\.gen\.js'/)
    assert.match(source, /assets:/)
    assert.doesNotMatch(
      source,
      /import\.meta\.url/,
      'an embedded asset has no directory to resolve'
    )
  })

  test('the mount carries the configured prefix and fallback', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource({
      ...(baseContext as object),
      frontend: { urlPrefix: '/app', spaFallback: false },
    } as never)

    assert.match(source, /urlPrefix: '\/app'/)
    assert.match(source, /spaFallback: false/)
  })

  test('bun externalises the asset manifest so esbuild never parses it', () => {
    // esbuild rejects `with { type: 'file' }` outright; the manifest has to
    // survive to the `bun build --compile` step untouched.
    const externals = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).getExternals()

    assert.ok(externals.includes('./frontend-assets.gen.js'))
  })

  test('the node runtime has no manifest to externalise', () => {
    const externals = new StandaloneProviderAdapter({
      runtime: 'node',
    }).getExternals()

    assert.ok(!externals.includes('./frontend-assets.gen.js'))
  })
})

describe('StandaloneProviderAdapter deploy output', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const builtUnit = async (options: { withFrontend: boolean }) => {
    const buildDir = await mkdtemp(join(tmpdir(), 'pikku-standalone-'))
    tempDirs.push(buildDir)
    const unitDir = join(buildDir, 'app')
    await mkdir(unitDir, { recursive: true })
    await writeFile(join(unitDir, 'bundle.js'), 'console.log("bundle")')
    if (options.withFrontend) {
      await mkdir(join(unitDir, 'frontend', 'assets'), { recursive: true })
      await writeFile(
        join(unitDir, 'frontend', 'index.html'),
        '<!doctype html>'
      )
      await writeFile(join(unitDir, 'frontend', 'assets', 'app.js'), 'app')
      await writeFile(
        join(unitDir, 'frontend-assets.gen.js'),
        'export const frontendAssets = {}\n'
      )
    }
    return { buildDir, outDir: join(buildDir, 'app-dist') }
  }

  const silentLogger = { info: () => {}, error: () => {} }

  test('ships the frontend beside the bundle', async () => {
    // The node entry resolves its mount directory relative to itself, so the
    // copy has to land in the distributable, not just in the build directory.
    const { buildDir, outDir } = await builtUnit({ withFrontend: true })

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, true)
    assert.equal(
      await readFile(join(outDir, 'frontend', 'assets', 'app.js'), 'utf-8'),
      'app'
    )
  })

  test('ships the asset manifest the compile step still has to resolve', async () => {
    // `bun build --compile` follows the import out of the copied bundle, so the
    // manifest has to sit next to it — it was excluded from the esbuild output
    // precisely so it would still be a real file at this point.
    const { buildDir, outDir } = await builtUnit({ withFrontend: true })

    await new StandaloneProviderAdapter({ runtime: 'node' }).deploy({
      buildDir,
      logger: silentLogger,
    })

    assert.match(
      await readFile(join(outDir, 'frontend-assets.gen.js'), 'utf-8'),
      /frontendAssets/
    )
  })

  test('a project without a frontend copies nothing extra', async () => {
    const { buildDir, outDir } = await builtUnit({ withFrontend: false })

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, true)
    assert.equal(existsSync(join(outDir, 'frontend')), false)
    assert.equal(existsSync(join(outDir, 'frontend-assets.gen.js')), false)
  })
})

/**
 * Runs the database-file choice the generated entry makes, rather than reading
 * the source it is written in. Asserting on the text cannot tell a working
 * precedence from one that always takes the same branch.
 */
const chooseDatabaseFile = (source: string, env: NodeJS.ProcessEnv): string => {
  const helper = source.match(/function __pikkuRequireDataDir\(\)[\s\S]*?\n\}/)
  const selection = source.match(
    /const __pikkuDbFile =([\s\S]*?)\n\s*__pikkuMkdirSync/
  )
  assert.ok(helper, 'the entry must define the data-dir helper it calls')
  assert.ok(selection, 'the entry must choose a database file')

  const choose = new Function(
    'process',
    '__pikkuJoin',
    `${helper[0]}\nreturn (${selection[1]})`
  ) as (proc: { env: NodeJS.ProcessEnv }, join: typeof join) => string
  return choose({ env }, join)
}

const withDb = {
  ...(baseContext as object),
  db: {
    engine: 'sqlite' as const,
    coercionImportPath: '../../.pikku/db/coercion.gen.js',
  },
} as never

const withPostgres = {
  ...(baseContext as object),
  db: {
    engine: 'postgres' as const,
    coercionImportPath: '../../.pikku/db/coercion.gen.js',
  },
} as never

const withPostgresNoCoercion = {
  ...(baseContext as object),
  db: { engine: 'postgres' as const },
} as never

const withSqliteNoCoercion = {
  ...(baseContext as object),
  db: { engine: 'sqlite' as const },
} as never

for (const runtime of ['node', 'bun'] as const) {
  describe(`StandaloneProviderAdapter postgres wiring (${runtime})`, () => {
    test('the connection is opened from DATABASE_URL', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgres)

      assert.match(
        source,
        /import \{ PikkuKysely \} from '@pikku\/kysely-postgres'/
      )
      assert.match(source, /process\.env\.DATABASE_URL/)
    })

    test('a missing DATABASE_URL fails by name rather than by driver error', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgres)

      assert.match(source, /needs DATABASE_URL set/)
    })

    test('postgres brings none of the sqlite file handling with it', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgres)

      // PIKKU_DATA_DIR describes where a bundled database file lives. A
      // postgres build has no file, and demanding the variable anyway would
      // refuse to boot over a directory it never reads.
      assert.doesNotMatch(source, /PIKKU_DATA_DIR/)
      assert.doesNotMatch(source, /PIKKU_DATABASE_FILE/)
      assert.doesNotMatch(source, /SqliteKysely/)
    })

    test('the connection is handed to the services factory, opened first', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgres)

      assert.match(
        source,
        /createSingletonServices\(config, \{[\s\S]*?\n    kysely,/
      )
      assert.ok(
        source.indexOf('new PikkuKysely') <
          source.indexOf('createSingletonServices(config')
      )
    })

    test('the coercion map is applied to the postgres connection too', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgres)

      // The map comes from db/annotations.ts, not from the dialect: an
      // annotated column needs coercing whichever database holds it.
      assert.match(source, /withPlugin\(\s*createCoercionPlugin/)
    })

    test('an app with no coercion map still gets a database', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgresNoCoercion)

      // Nothing to coerce is a database with no annotated columns, not a
      // reason to boot the app with no connection at all.
      assert.match(source, /new PikkuKysely/)
      assert.doesNotMatch(source, /createCoercionPlugin/)
      assert.match(source, /\n    kysely,/)
    })

    test('sqlite with no coercion map still gets a database', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withSqliteNoCoercion)

      assert.match(source, /SqliteKysely/)
      assert.doesNotMatch(source, /createCoercionPlugin/)
      assert.match(source, /\n    kysely,/)
    })

    test('the pool is closed on shutdown, after the server has stopped', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withPostgres)

      // A pool closed in beforeStop would be gone while the app's own stop
      // hook and the draining server are still entitled to query it.
      assert.match(
        source,
        /afterStop: async \(\) => \{[^}]*__pikkuPg\.close\(\)/
      )
      assert.doesNotMatch(
        source,
        /beforeStop: async \(\) => \{[^}]*__pikkuPg\.close\(\)/
      )
    })

    test('a sqlite build closes no pool', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withDb)

      assert.doesNotMatch(source, /__pikkuPg/)
    })
  })
}

describe('StandaloneProviderAdapter database wiring', () => {
  test('a node entry without a database opens none', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(baseContext)

    assert.doesNotMatch(source, /createNodeSqliteKysely/)
    assert.doesNotMatch(source, /PIKKU_DATA_DIR/)
  })

  test('a node entry hands the connection to the services factory', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.match(source, /createNodeSqliteKysely/)
    // The whole point: app code receives `kysely` the way a hosted runtime
    // would give it, rather than the factory finding nothing there.
    assert.match(
      source,
      /createSingletonServices\(config, \{[\s\S]*?\n    kysely,/,
      'kysely must be passed into the services factory, not merely constructed'
    )
  })

  test('the connection is opened before the services that need it', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.ok(
      source.indexOf('createNodeSqliteKysely') <
        source.indexOf('createSingletonServices(config'),
      'a connection built after the factory ran would arrive too late to be used'
    )
  })

  test('the generated coercion map is applied to the connection', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.match(source, /from '\.\.\/\.\.\/\.pikku\/db\/coercion\.gen\.js'/)
    // Without it a `date` column reads back as a string and a `bool` as 0/1,
    // so the deployed app disagrees with `pikku dev` about its own row shapes.
    assert.match(
      source,
      /createCoercionPlugin\(\{ map: __pikkuCoercionMap \}\)/
    )
  })

  test('the database file lives outside the release directory', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.match(source, /PIKKU_DATA_DIR/)
    // A path derived from the bundle's own location would be swapped out —
    // and deleted — by the next release.
    assert.doesNotMatch(
      source,
      /filename: __pikkuJoin\(__pikkuDirname\(__pikkuFileURLToPath/
    )
  })

  test('an explicit database file overrides the data directory', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    // `pikku db migrate` has to open the same file this does; without an
    // override the two can only agree by coincidence.
    assert.equal(
      chooseDatabaseFile(source, {
        PIKKU_DATA_DIR: '/var/lib/pikku',
        PIKKU_DATABASE_FILE: '/srv/shared/app.db',
      }),
      '/srv/shared/app.db',
      'the override has to win over the data directory, not merely be mentioned'
    )
  })

  test('the data directory is used when nothing overrides it', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.equal(
      chooseDatabaseFile(source, { PIKKU_DATA_DIR: '/var/lib/pikku' }),
      join('/var/lib/pikku', 'pikku.db')
    )
  })

  test('a missing data directory fails by name', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.throws(
      () => chooseDatabaseFile(source, {}),
      /Set PIKKU_DATA_DIR to a writable directory/,
      'the error has to name the variable, not surface as a path of undefined'
    )
  })

  test('the directory is created rather than required to exist', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withDb)

    assert.match(
      source,
      /__pikkuMkdirSync\(__pikkuDirname\(__pikkuDbFile\), \{ recursive: true \}\)/
    )
  })

  test('a database and a frontend do not fight over their path aliases', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource({
      ...(baseContext as object),
      frontend: { urlPrefix: '/', spaFallback: true },
      db: {
        engine: 'sqlite' as const,
        coercionImportPath: './coercion.gen.js',
      },
    } as never)

    // Two imports of node:path are legal; two bindings of one name are not.
    const bound = source.match(/(?:dirname|join) as (\w+)/g) ?? []
    assert.equal(
      new Set(bound).size,
      bound.length,
      `each path helper must bind a distinct name, got ${bound.join(', ')}`
    )
    assert.match(source, /__pikkuJoin\(__pikkuDirname\(__pikkuFileURLToPath/)
    assert.match(source, /__pikkuJoin\(__pikkuRequireDataDir\(\)/)
  })
})

describe('StandaloneProviderAdapter database wiring (bun)', () => {
  test('a bun entry opens SQLite through the bun driver', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(withDb)

    // node:sqlite is not available inside a compiled bun binary, so reaching
    // for the node factory here produces an artifact that cannot start.
    assert.match(source, /createBunSqliteKysely/)
    assert.doesNotMatch(source, /kysely-node-sqlite/)
  })

  test('a bun entry hands the connection to the services factory', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(withDb)

    assert.match(
      source,
      /createSingletonServices\(config, \{[\s\S]*?\n    kysely,/
    )
  })

  test('a bun entry defines the data-dir helper it calls', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(withDb)

    // Calling it without defining it is a ReferenceError at first boot.
    assert.match(source, /function __pikkuRequireDataDir\(\)/)
  })

  test('a bun entry without a database opens none', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(baseContext)

    assert.doesNotMatch(source, /createBunSqliteKysely/)
    assert.doesNotMatch(source, /PIKKU_DATA_DIR/)
  })
})

const withLifecycle = {
  ...(baseContext as object),
  lifecycle: { importPath: './lifecycle.js', variable: 'lifecycle' },
} as never

for (const runtime of ['node', 'bun'] as const) {
  describe(`StandaloneProviderAdapter server lifecycle (${runtime})`, () => {
    test('an app that declares no lifecycle gets no hook calls', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(baseContext)

      assert.doesNotMatch(source, /__pikkuLifecycle/)
      assert.match(source, /server\.enableExitOnSignals\(\)/)
    })

    test('the lifecycle is imported under a reserved name', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withLifecycle)

      assert.match(
        source,
        /import \{ lifecycle as __pikkuLifecycle \} from '\.\/lifecycle\.js'/
      )
    })

    test('beforeStart runs after init and before the port opens', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withLifecycle)

      const init = source.indexOf('await server.init()')
      const before = source.indexOf('__pikkuLifecycle?.beforeStart?.')
      const start = source.indexOf('await server.start()')

      assert.ok(init !== -1 && before !== -1 && start !== -1)
      assert.ok(
        init < before && before < start,
        'work a hook must finish before the first request has to run before the port opens'
      )
    })

    test('afterStart runs once the server is listening', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withLifecycle)

      assert.ok(
        source.indexOf('await server.start()') <
          source.indexOf('__pikkuLifecycle?.afterStart?.')
      )
    })

    test('the hooks are handed the services the app was built with', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withLifecycle)

      for (const hook of [
        'beforeStart',
        'afterStart',
        'beforeStop',
        'afterStop',
      ]) {
        assert.match(
          source,
          new RegExp(
            `__pikkuLifecycle\\?\\.${hook}\\?\\.\\(singletonServices\\)`
          ),
          `${hook} must receive singletonServices`
        )
      }
    })

    test('the stop hooks are given to the signal handler that owns shutdown', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withLifecycle)

      assert.match(
        source,
        /server\.enableExitOnSignals\(\{ beforeStop:/,
        'a separate signal listener would race the server teardown'
      )
    })

    test('the lifecycle import is optional and never emitted twice', () => {
      const source = new StandaloneProviderAdapter({
        runtime,
      }).generateEntrySource(withLifecycle)

      assert.equal(
        source.split('as __pikkuLifecycle').length - 1,
        1,
        'a duplicate binding would not compile'
      )
    })
  })
}

for (const runtime of ['node', 'bun'] as const) {
  describe(`StandaloneProviderAdapter command line (${runtime})`, () => {
    const generate = (ctx: unknown) =>
      new StandaloneProviderAdapter({ runtime }).generateEntrySource(
        ctx as never
      )

    test('argv is parsed before the config factory or the database', () => {
      const source = generate(withDb)

      assert.ok(
        source.indexOf('parseStandaloneCommand') <
          source.indexOf('async function main()'),
        'version and help have to answer on a machine where neither works yet'
      )
      assert.match(source, /if \(__pikkuCommand\.kind === 'exit'\) process\.exit/)
    })

    test('the version reported is the project’s own', () => {
      assert.match(
        generate({ ...(withDb as object), version: '4.5.6' }),
        /version: '4\.5\.6'/
      )
      assert.match(generate(withDb), /version: 'unknown'/)
    })

    test('a command runs against the database the app itself opened', () => {
      const source = generate(withDb)

      assert.ok(
        source.indexOf('const kysely =') <
          source.indexOf('await runStandaloneCommand('),
        'the database is opened first so a migration cannot target another one'
      )
      assert.match(source, /databaseFile: __pikkuDbFile,/)
    })

    test('a completed command returns before a port is bound', () => {
      const source = generate(withDb)
      const dispatch = source.indexOf('await runStandaloneCommand(')

      assert.ok(dispatch < source.indexOf('createSingletonServices(config'))
      assert.match(source, /=== 'done'\) \{\n {4}return\n {2}\}/)
    })

    test('a postgres build closes its pool before the process ends', () => {
      assert.match(
        generate(withPostgres),
        /=== 'done'\) \{\n {4}await __pikkuPg\.close\(\)\n {4}return\n {2}\}/
      )
    })

    test('the postgres command target is handed the live connection', () => {
      assert.match(generate(withPostgres), /sql: __pikkuPg\.sql,/)
    })

    test('migrations are read from the engine directory the build wrote', () => {
      assert.match(
        generate(withDb),
        /resolveMigrationsDir\(__pikkuJoin\(.*, 'db', 'sqlite'\)\)/
      )
      assert.match(
        generate(withPostgres),
        /resolveMigrationsDir\(__pikkuJoin\(.*, 'db', 'postgres'\)\)/
      )
    })

    test('a build with no database announces none and answers no db command', () => {
      const source = generate(baseContext)

      assert.match(source, /hasDb: false,/)
      assert.doesNotMatch(source, /engine:/)
      assert.doesNotMatch(source, /runStandaloneCommand/)
      assert.match(source, /if \(__pikkuCommand\.kind !== 'serve'\) process\.exit\(0\)/)
    })
  })
}

describe('StandaloneProviderAdapter migrations path per runtime', () => {
  test('a node bundle reads them from its own directory', () => {
    assert.match(
      new StandaloneProviderAdapter({ runtime: 'node' }).generateEntrySource(
        withDb
      ),
      /resolveMigrationsDir\(__pikkuJoin\(__pikkuDirname\(__pikkuFileURLToPath\(import\.meta\.url\)\), 'db', 'sqlite'\)\)/
    )
  })

  test('a compiled bun binary reads them beside the executable', () => {
    // import.meta.url points inside the embedded filesystem, which holds no
    // migrations — the operator unpacked them next to the binary instead.
    assert.match(
      new StandaloneProviderAdapter({ runtime: 'bun' }).generateEntrySource(
        withDb
      ),
      /resolveMigrationsDir\(__pikkuJoin\(__pikkuDirname\(process\.execPath\), 'db', 'sqlite'\)\)/
    )
  })
})
