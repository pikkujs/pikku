import { describe, test, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { applyPikkuSchemas, leaseSchema, workflowSchema } from '@pikku/kysely'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import { createSqliteKysely } from '../../db/sqlite/sqlite-kysely.js'
import {
  localServicesPackages,
  serializeLocalServices,
  type LocalCLIServicesOptions,
  type LocalServicesDrivers,
  type SerializeLocalServicesOptions,
} from './serialize-local-services.js'

const noDrivers: LocalServicesDrivers = {
  nodeSqlite: false,
  bunSqlite: false,
  pg: false,
  pgTypes: false,
  mysql: false,
}

const withCLI = (
  overrides: Partial<LocalCLIServicesOptions> = {}
): LocalCLIServicesOptions => ({ drivers: noDrivers, ...overrides })

const emit = (overrides: Partial<SerializeLocalServicesOptions> = {}) =>
  serializeLocalServices({
    localServicesFile: '/project/.pikku/pikku-local-services.gen.ts',
    packageMappings: {},
    requiredServices: [],
    scopes: [],
    systemRoles: [],
    analyticsEvents: [],
    database: true,
    localCLI: withCLI(),
    ...overrides,
  })

const importedModules = (code: string): string[] =>
  [...code.matchAll(/^import [^;]*?from '([^']+)'/gms)].map(
    (match) => match[1]!
  )

/**
 * The file is written into every project, and `pikku serve` loads it from
 * there, so every package it imports has to be one the project declares.
 */
describe('what the file imports', () => {
  test('a project with no database and no CLI imports from @pikku/core alone', () => {
    const code = emit({ database: false, localCLI: undefined })
    for (const module of importedModules(code)) {
      assert.match(module, /^@pikku\/core\//)
    }
    assert.doesNotMatch(code, /import\(/)
  })

  test('a database brings in @pikku/kysely, and only a CLI opens one', () => {
    const code = emit({ localCLI: undefined })
    assert.ok(importedModules(code).includes('@pikku/kysely'))
    assert.match(code, /import type \{ Kysely \} from '@pikku\/kysely'/)
    assert.doesNotMatch(code, /openLocalDatabase/)
    assert.doesNotMatch(code, /node:/)
    assert.doesNotMatch(code, /@pikku\/schedule/)
  })

  test('a local CLI brings in the scheduler and meta services it has no host for', () => {
    const code = emit({ database: false })
    assert.ok(importedModules(code).includes('@pikku/schedule'))
    assert.match(code, /metaService: new LocalMetaService/)
    assert.ok(!importedModules(code).includes('@pikku/kysely'))
    assert.doesNotMatch(code, /openLocalDatabase/)
  })

  test('declares exactly the packages it imports', () => {
    assert.deepStrictEqual(localServicesPackages({ database: false }), [])
    assert.deepStrictEqual(localServicesPackages({ database: true }), [
      '@pikku/kysely',
    ])
    assert.deepStrictEqual(
      localServicesPackages({ database: false, localCLI: withCLI() }),
      ['@pikku/schedule']
    )
  })
})

describe('the workflow services', () => {
  const engines = [
    [
      'sqlite',
      '@pikku/kysely-sqlite',
      'SQLiteKyselyWorkflowService',
      'SQLiteKyselyWorkflowRunService',
      'KyselyLeaseService',
    ],
    [
      'postgres',
      '@pikku/kysely-postgres',
      'PgKyselyWorkflowService',
      'PgKyselyWorkflowRunService',
      'PgKyselyLeaseService',
    ],
    [
      'mysql',
      '@pikku/kysely-mysql',
      'MySQLKyselyWorkflowService',
      'MySQLKyselyWorkflowRunService',
      'MySQLKyselyLeaseService',
    ],
  ] as const

  for (const [engine, pkg, service, runService, leaseService] of engines) {
    test(`${engine}: persists runs in the database and exposes both names`, () => {
      const code = emit({ engine })
      const leaseHere = engine === 'sqlite' ? '' : `, ${leaseService}`
      assert.match(
        code,
        new RegExp(
          `import \\{ ${service}, ${runService}${leaseHere} \\} from '${pkg}'`
        )
      )
      assert.match(
        code,
        new RegExp(`await initOrWarn\\(\\s*new ${service}\\(kysely,`)
      )
      assert.match(code, new RegExp(`new ${runService}\\(kysely\\)`))
      assert.match(code, /\n    workflowService,\n    workflowRunService,\n/)
      assert.deepStrictEqual(
        localServicesPackages({ database: true, engine }),
        ['@pikku/kysely', pkg]
      )
    })
  }

  test('fences runs with leases in the same database, unless the host passes its own', () => {
    const code = emit({ engine: 'sqlite' })
    assert.match(
      code,
      /import \{[^}]*\bKyselyLeaseService,[^}]*\} from '@pikku\/kysely'/
    )
    assert.match(
      code,
      /hostServices\.leaseService as LeaseService \| undefined\) \?\?\s*\(await initOrWarn\(\s*new KyselyLeaseService\(kysely\)/
    )
    assert.match(code, /\)\) \?\?\s*new InMemoryLeaseService\(\)/)
  })

  test('falls back to memory when the table is not migrated', () => {
    assert.match(
      emit({ engine: 'sqlite' }),
      /\?\? new InMemoryWorkflowService\(\)/
    )
  })

  test('no database: in memory, one instance under both names', () => {
    const code = emit({
      database: false,
      localCLI: undefined,
      engine: 'sqlite',
    })
    assert.match(
      code,
      /const workflowService = new InMemoryWorkflowService\(\)/
    )
    assert.match(code, /workflowRunService: workflowService,/)
    assert.doesNotMatch(code, /from '@pikku\/kysely/)
  })

  test('a database of unknown engine keeps runs in memory', () => {
    const code = emit({ engine: undefined })
    assert.match(
      code,
      /const workflowService = new InMemoryWorkflowService\(\)/
    )
    assert.deepStrictEqual(localServicesPackages({ database: true }), [
      '@pikku/kysely',
    ])
  })
})

/**
 * A generated CLI runs with no inspector, so whatever `pikku serve` reads off
 * one as it starts has to be in the file already.
 */
describe('the answers baked in at codegen', () => {
  test('gates each service on whether the project requires it', () => {
    const code = emit({ requiredServices: new Set(['scopeService', 'jwt']) })
    assert.match(code, /"scopeService": true/)
    assert.match(code, /"webhookService": false/)
    assert.match(code, /"incomingWebhookService": false/)
    assert.match(code, /"agentStorage": false/)
    assert.match(code, /"agentRunState": false/)
    assert.match(code, /"agentRunService": false/)
    assert.doesNotMatch(code, /"jwt"/)
  })

  test('only builds the database-backed agent services the project uses', () => {
    const used = emit({
      requiredServices: new Set(['agentStorage', 'agentRunState']),
    })
    assert.match(
      used,
      /kysely && isRequired\('agentStorage'\)\s*\n\s*\? new KyselyAgentStorageService\(kysely\)/
    )
    assert.match(
      used,
      /kysely && isRequired\('agentRunState'\)\s*\n\s*\? new KyselyAgentRunStateService\(kysely\)/
    )
    assert.match(
      used,
      /kysely && isRequired\('agentRunService'\)\s*\n\s*\? new KyselyAgentRunService\(kysely\)/
    )
    assert.match(used, /"agentStorage": true/)
    assert.match(used, /"agentRunState": true/)
    assert.match(used, /"agentRunService": false/)
  })

  test('prefers what a live inspector passes over what was baked', () => {
    const code = emit()
    assert.match(
      code,
      /options\.requiredServices\s*\?\s*options\.requiredServices\.has\(name\)\s*:\s*requiredServices\[name\]/
    )
    assert.match(code, /syncScopes\(options\.scopes \?\? declaredScopes\)/)
    assert.match(
      code,
      /syncSystemRoles\(options\.systemRoles \?\? declaredSystemRoles\)/
    )
  })

  test('carries the declared scopes and system roles it syncs', () => {
    const code = emit({
      scopes: [{ id: 'todos', description: 'Todos' }],
      systemRoles: [{ name: 'admin', scopes: ['todos'] }],
    })
    assert.match(code, /"id": "todos"/)
    assert.match(code, /"name": "admin"/)
  })

  test('falls back to the sqlite file serve would, only when told to', () => {
    assert.match(
      emit({
        localCLI: withCLI({ conventionalSqliteDb: '.pikku-runtime/dev.db' }),
      }),
      /const conventionalSqliteDb: string \| undefined = '\.pikku-runtime\/dev\.db'/
    )
    assert.match(
      emit(),
      /const conventionalSqliteDb: string \| undefined = undefined/
    )
  })
})

/**
 * A literal import of a package the project does not have fails its type check
 * and any bundler, so only the drivers the project declares are imported.
 */
describe('the database openers', () => {
  test('imports only the sqlite drivers the project declares', () => {
    const code = emit({
      localCLI: withCLI({ drivers: { ...noDrivers, nodeSqlite: true } }),
    })
    assert.match(code, /await import\('@pikku\/kysely-node-sqlite'\)/)
    assert.doesNotMatch(code, /await import\('@pikku\/kysely-bun-sqlite'\)/)
    assert.match(code, /needs @pikku\/kysely-bun-sqlite/)
  })

  test('opens postgres through pg only when it is declared', () => {
    assert.doesNotMatch(emit(), /import\('pg'\)/)
    assert.doesNotMatch(emit(), /PostgresDialect/)
    const code = emit({
      localCLI: withCLI({ drivers: { ...noDrivers, pg: true, pgTypes: true } }),
    })
    assert.match(code, /await import\('pg'\)/)
    assert.match(code, /allowExitOnIdle: true/)
    assert.doesNotMatch(code, /@ts-ignore/)
  })

  test('opens mysql through mysql2 only when it is declared', () => {
    assert.doesNotMatch(emit(), /import\('mysql2'\)/)
    assert.doesNotMatch(emit(), /MysqlDialect/)
    assert.match(
      emit(),
      /database is mysql, and opening it needs the mysql2 driver/
    )
    const code = emit({
      localCLI: withCLI({ drivers: { ...noDrivers, mysql: true } }),
    })
    assert.match(code, /await import\('mysql2'\)/)
    assert.match(
      code,
      /import \{[^}]*MysqlDialect[^}]*\} from '@pikku\/kysely'/
    )
    assert.match(code, /if \(\/\^mysql:/)
    assert.match(code, /return \{ mysqlUrl: url \}/)
    assert.match(code, /if \(target\.mysqlUrl\)/)
    assert.match(code, /new CamelCasePlugin\(\), \.\.\.\[\]/)
    assert.match(code, /pool\.on\('release'/)
  })

  test('waives the missing pg types rather than failing the type check', () => {
    assert.match(
      emit({ localCLI: withCLI({ drivers: { ...noDrivers, pg: true } }) }),
      /\/\/ @ts-ignore -- pg ships no types[^\n]*\n\s*const \{ default: pg \} = await import\('pg'\)/
    )
  })

  test('applies the generated coercion map to what it opens', () => {
    const code = emit({
      localCLI: withCLI({
        coercionFile: '/project/.pikku/db/coercion.gen.ts',
        drivers: { ...noDrivers, nodeSqlite: true },
      }),
    })
    assert.match(
      code,
      /import \{ coercionMap \} from '\.\/db\/coercion\.gen\.js'/
    )
    assert.match(
      code,
      /plugins: \[createCoercionPlugin\(\{ map: coercionMap \}\)\]/
    )
  })

  test('leaves the coercion map out when nothing is opened with it', () => {
    const coercionFile = '/project/.pikku/db/coercion.gen.ts'
    for (const code of [
      emit({ localCLI: withCLI({ coercionFile }) }),
      emit({
        localCLI: undefined,
      }),
    ]) {
      assert.doesNotMatch(code, /coercionMap/)
      assert.doesNotMatch(code, /createCoercionPlugin/)
    }
  })
})

/**
 * The generated file is run, not only read: written inside this package so its
 * imports resolve against the same @pikku packages a project would install.
 */
describe('the generated createLocalServices', async () => {
  const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url))
  const dir = mkdtempSync(join(packageRoot, '.local-services-test-'))
  after(() => rmSync(dir, { recursive: true, force: true }))

  const load = async (
    name: string,
    options: Partial<SerializeLocalServicesOptions>
  ) => {
    const file = join(dir, `${name}.gen.ts`)
    writeFileSync(file, emit({ localServicesFile: file, ...options }))
    return import(pathToFileURL(file).href)
  }

  test('boots the in-memory set serve does when there is no database', async () => {
    const { createLocalServices } = await load('no-db', {})
    const services = await createLocalServices({}, { kysely: null })
    for (const name of [
      'emailService',
      'metaService',
      'schedulerService',
      'queueService',
      'webhookService',
      'incomingWebhookService',
      'workflowService',
      'triggerService',
      'triggerSourceStore',
      'agentRunState',
    ]) {
      assert.ok(services[name], `${name} is missing`)
    }
    assert.strictEqual(services.workflowRunService, services.workflowService)
    assert.strictEqual(
      services.webhookService.constructor.name,
      'QueueWebhookService'
    )
    assert.strictEqual(services.kysely, undefined)
    assert.strictEqual(services.scopeService, undefined)
    assert.strictEqual(services.featureFlags, undefined)
  })

  /**
   * Two processes, each with its own createLocalServices on one SQLite file: the
   * run the first holds is refused to the second until the first lets go.
   */
  test('a second process on the same database cannot take a run the first holds', async () => {
    const services = join(dir, 'fenced.gen.ts')
    writeFileSync(
      services,
      emit({
        localServicesFile: services,
        engine: 'sqlite',
        localCLI: undefined,
      })
    )
    const database = join(dir, 'fenced.db')
    const setup = createSqliteKysely({
      db: (await loadSqliteRuntime()).open(database),
    })
    await applyPikkuSchemas(setup, [workflowSchema, leaseSchema])
    await setup.destroy()

    const child = join(dir, 'fenced-process.ts')
    writeFileSync(
      child,
      `import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import { createSqliteKysely } from ${JSON.stringify(fileURLToPath(new URL('../../db/sqlite/sqlite-kysely.ts', import.meta.url)))}
import { createLocalServices } from './fenced.gen.ts'

const [database, hold] = process.argv.slice(2)
const kysely = createSqliteKysely({ db: (await loadSqliteRuntime()).open(database) })
const { workflowService } = await createLocalServices({}, { kysely }, { logger: { warn: () => {} } })
try {
  await workflowService.withRunLease('run-1', async () => {
    console.log('held')
    if (hold) await new Promise((done) => process.stdin.on('data', done))
  })
  console.log('released')
} catch (error) {
  console.log(error.constructor.name)
}
await kysely.destroy()
process.exit(0)
`
    )
    const run = (hold: boolean) =>
      spawn(process.execPath, [child, database, ...(hold ? ['hold'] : [])], {
        cwd: dir,
        stdio: ['pipe', 'pipe', 'inherit'],
      })
    const lines = (child: ReturnType<typeof run>) => {
      const seen: string[] = []
      let buffer = ''
      child.stdout!.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        seen.push(...buffer.split('\n').slice(0, -1))
        buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
      })
      return seen
    }
    const exited = (child: ReturnType<typeof run>) =>
      new Promise<number | null>((done) => child.once('exit', done))
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 300 && !check(); i++)
        await new Promise((done) => setTimeout(done, 50))
    }

    const first = run(true)
    const firstSaid = lines(first)
    const firstExit = exited(first)
    try {
      await until(() => firstSaid.includes('held'))
      assert.deepStrictEqual(firstSaid, ['held'])

      const second = run(false)
      const secondSaid = lines(second)
      assert.strictEqual(await exited(second), 0)
      assert.deepStrictEqual(secondSaid, ['LeaseTakenError'])
    } finally {
      first.stdin!.end('go\n')
    }
    assert.strictEqual(await firstExit, 0)
    assert.deepStrictEqual(firstSaid, ['held', 'released'])

    const third = run(false)
    const thirdSaid = lines(third)
    assert.strictEqual(await exited(third), 0)
    assert.deepStrictEqual(thirdSaid, ['held', 'released'])
  })

  test('lets what the host provides win over what it assembles', async () => {
    const { createLocalServices } = await load('host', {})
    const eventHub = {}
    const logger = { warn: () => {} }
    const services = await createLocalServices(
      {},
      { kysely: null, eventHub, logger }
    )
    assert.strictEqual(services.eventHub, eventHub)
    assert.strictEqual(services.logger, logger)
  })

  test('a project with no database gets the same in-memory set, with no CLI', async () => {
    const { createLocalServices } = await load('no-database', {
      database: false,
      localCLI: undefined,
    })
    const schedulerService = {}
    const services = await createLocalServices({}, { schedulerService })
    assert.strictEqual(services.schedulerService, schedulerService)
    assert.strictEqual(services.metaService, undefined)
    assert.strictEqual(services.workflowRunService, services.workflowService)
    assert.strictEqual(
      services.webhookService.constructor.name,
      'QueueWebhookService'
    )
    assert.strictEqual(
      services.agentRunState.constructor.name,
      'InMemoryAgentRunStateService'
    )
    assert.ok('agentStorage' in services)
  })

  test('says so when handed a database it was generated without', async () => {
    const { createLocalServices } = await load('unexpected-database', {
      database: false,
      localCLI: undefined,
    })
    const warnings: string[] = []
    const kysely = {}
    const services = await createLocalServices(
      {},
      { kysely },
      { logger: { warn: (message: string) => warnings.push(message) } }
    )
    assert.strictEqual(services.kysely, kysely)
    assert.strictEqual(warnings.length, 1)
    assert.match(warnings[0]!, /generated for a project without one/)
  })

  test('names the driver to install when it cannot open the database', async () => {
    const { createLocalServices } = await load('no-driver', {})
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL = join(dir, 'runtime', 'app.db')
    try {
      await assert.rejects(
        createLocalServices({}),
        /needs @pikku\/kysely-(bun|node)-sqlite/
      )
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previous
    }
  })

  test('refuses two database dialects at once', async () => {
    const { openLocalDatabase } = await load('two-dialects', {})
    const previous = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      await assert.rejects(
        openLocalDatabase({ sqliteDb: 'a.db', postgresUrl: 'postgres://x' }),
        /Configure exactly one database dialect/
      )
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous
    }
  })

  test('a mysql:// DATABASE_URL is mysql, not a sqlite file path', async () => {
    const { createLocalServices } = await load('no-mysql-driver', {})
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'mysql://root:root@127.0.0.1:1/x'
    try {
      await assert.rejects(createLocalServices({}), /database is mysql/)
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previous
    }
  })

  test('refuses mysqlUrl beside another dialect', async () => {
    const { openLocalDatabase } = await load('mysql-and-sqlite', {})
    const previous = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      await assert.rejects(
        openLocalDatabase({ sqliteDb: 'a.db', mysqlUrl: 'mysql://x/y' }),
        /Configure exactly one database dialect/
      )
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous
    }
  })

  test(
    'opens a live mysql database from DATABASE_URL and from config.mysqlUrl',
    { skip: !process.env.PIKKU_TEST_MYSQL_URL },
    async () => {
      const { openLocalDatabase } = await load('mysql-live', {
        localCLI: withCLI({ drivers: { ...noDrivers, mysql: true } }),
      })
      const url = process.env.PIKKU_TEST_MYSQL_URL!
      const previous = process.env.DATABASE_URL
      try {
        for (const viaEnv of [true, false]) {
          if (viaEnv) process.env.DATABASE_URL = url
          else delete process.env.DATABASE_URL
          const db = await openLocalDatabase(viaEnv ? {} : { mysqlUrl: url })
          assert.ok(db)
          try {
            const { sql } = await import('kysely')
            const { rows } = await sql<{
              someValue: number
            }>`select 7 as some_value, cast(1.5 as decimal(4,2)) as d`.execute(
              db
            )
            // CamelCasePlugin maps the result's snake_case keys.
            assert.equal(rows[0]!.someValue, 7)
            assert.equal((rows[0] as any).d, 1.5)
          } finally {
            await db.destroy()
          }
        }
      } finally {
        if (previous === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = previous
      }
    }
  )
})
