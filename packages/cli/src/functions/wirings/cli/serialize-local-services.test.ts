import { describe, test, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  serializeLocalServices,
  type LocalServicesDrivers,
  type SerializeLocalServicesOptions,
} from './serialize-local-services.js'

const noDrivers: LocalServicesDrivers = {
  nodeSqlite: false,
  bunSqlite: false,
  pg: false,
  pgTypes: false,
}

const emit = (overrides: Partial<SerializeLocalServicesOptions> = {}) =>
  serializeLocalServices({
    localServicesFile: '/project/.pikku/pikku-local-services.gen.ts',
    packageMappings: {},
    requiredServices: [],
    scopes: [],
    systemRoles: [],
    drivers: noDrivers,
    ...overrides,
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
    assert.doesNotMatch(code, /"jwt"/)
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
      emit({ conventionalSqliteDb: '.pikku-runtime/dev.db' }),
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
    const code = emit({ drivers: { ...noDrivers, nodeSqlite: true } })
    assert.match(code, /await import\('@pikku\/kysely-node-sqlite'\)/)
    assert.doesNotMatch(code, /await import\('@pikku\/kysely-bun-sqlite'\)/)
    assert.match(code, /needs @pikku\/kysely-bun-sqlite/)
  })

  test('opens postgres through pg only when it is declared', () => {
    assert.doesNotMatch(emit(), /import\('pg'\)/)
    assert.doesNotMatch(emit(), /PostgresDialect/)
    const code = emit({ drivers: { ...noDrivers, pg: true, pgTypes: true } })
    assert.match(code, /await import\('pg'\)/)
    assert.match(code, /allowExitOnIdle: true/)
    assert.doesNotMatch(code, /@ts-ignore/)
  })

  test('waives the missing pg types rather than failing the type check', () => {
    assert.match(
      emit({ drivers: { ...noDrivers, pg: true } }),
      /\/\/ @ts-ignore -- pg ships no types[^\n]*\n\s*const \{ default: pg \} = await import\('pg'\)/
    )
  })

  test('applies the generated coercion map to what it opens', () => {
    const code = emit({
      coercionFile: '/project/.pikku/db/coercion.gen.ts',
      drivers: { ...noDrivers, nodeSqlite: true },
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
    const code = emit({ coercionFile: '/project/.pikku/db/coercion.gen.ts' })
    assert.doesNotMatch(code, /coercionMap/)
    assert.doesNotMatch(code, /createCoercionPlugin/)
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
})
