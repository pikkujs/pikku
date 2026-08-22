import assert from 'node:assert/strict'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import {
  KyselyScopeService,
  applyPikkuSchemas,
  scopeSchema,
} from '@pikku/kysely'
import { createKysely } from '../db/local-db.js'
import { personaSync } from './persona-sync.js'

/**
 * Drives the real command against a real sqlite database and a real HTTP target
 * that behaves like the actor plugin: it upserts an `actor: true` user row on
 * sign-in, and nothing else creates one. Both halves matter — the point of the
 * command is that the account and the grants land together.
 */
let root: string
let logs: string[]
let target: Awaited<ReturnType<typeof startTarget>>

const logger = {
  info: (msg: string) => logs.push(msg),
  warn: (msg: string) => logs.push(msg),
  error: (msg: string) => logs.push(msg),
  debug: () => {},
} as any

const SCOPES_META = {
  admin: { name: 'admin', scopes: {} },
  reports: { name: 'reports', scopes: { read: {} } },
}

const ROLES_META = {
  'platform-admin': {
    name: 'platform-admin',
    description: 'Every capability that acts on the application as a whole',
    scopes: ['admin'],
  },
  'report-viewer': {
    name: 'report-viewer',
    scopes: ['reports:read'],
  },
}

/**
 * Three people: one who works everywhere, one pinned to production as the only
 * disposition allowed there, and one who exists to be acted upon.
 */
const PERSONAS = [
  {
    id: 'susan',
    name: 'Susan',
    roles: ['report-viewer'],
    goals: [],
    tags: [],
    runnable: true,
  },
  {
    id: 'mo',
    name: 'Mo',
    roles: ['platform-admin'],
    goals: [],
    tags: [],
    disposition: 'accountable',
    environments: ['prod'],
    runnable: true,
  },
  {
    id: 'target',
    name: 'Target',
    roles: [],
    goals: [],
    tags: [],
    runnable: false,
  },
]

const openDb = async () =>
  createKysely<KyselyPikkuDB>({
    dialect: 'sqlite',
    dbFile: join(root, '.pikku-runtime', 'dev.db'),
    camelCase: true,
    coercionFile: join(root, 'nope.js'),
  } as any)

/** The actor plugin's contract, as much of it as this command touches. */
const startTarget = async () => {
  const signedIn: string[] = []
  /** Off models a target whose user store is a different deployment's. */
  const state = { upserts: true }
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      void (async () => {
        const body = chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString())
          : {}
        if (req.url === '/auth/sign-in/actor') {
          if (body.secret !== 'impersonation-secret') {
            res.writeHead(401).end(JSON.stringify({ message: 'bad secret' }))
            return
          }
          // The upsert: an actor row exists because somebody signed in as it.
          if (state.upserts) {
            const db = await openDb()
            try {
              await (db as Kysely<any>)
                .insertInto('user')
                .values({
                  id: `user-${body.email}`,
                  email: body.email,
                  actor: 1,
                })
                .onConflict((oc: any) => oc.column('id').doNothing())
                .execute()
            } finally {
              await db.destroy()
            }
          }
          signedIn.push(body.email)
          res.setHeader('set-cookie', [`session=s${signedIn.length}; Path=/`])
          res.writeHead(200).end(JSON.stringify({ ok: true }))
          return
        }
        if (req.url === '/auth/get-session') {
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify({ user: { id: 'whoever', role: '' } }))
          return
        }
        res.writeHead(404).end()
      })()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  return {
    apiUrl: `http://127.0.0.1:${port}`,
    signedIn,
    state,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const config = () => ({
  rootDir: root,
  outDir: join(root, '.pikku'),
  runtimeDir: join(root, '.pikku-runtime'),
  srcDirectories: ['src'],
  scopesMetaJsonFile: join(root, '.pikku', 'scopes', 'scopes.gen.json'),
  rolesMetaJsonFile: join(root, '.pikku', 'scopes', 'roles.gen.json'),
  scenarios: { emailDomain: 'e2e.test' },
  environments: {
    local: { apiUrl: target.apiUrl },
    prod: { apiUrl: target.apiUrl, production: true },
  },
})

const run = async (data: any, personas: unknown[] = PERSONAS) =>
  personaSync.func(
    {
      logger,
      config: config(),
      getInspectorState: async () => ({ personas: { definitions: personas } }),
      variables: {
        get: async (key: string) =>
          key === 'SCENARIO_ACTOR_SECRET' ? 'impersonation-secret' : undefined,
      },
    } as any,
    data,
    {} as any
  )

const rolesOf = async (email: string) => {
  const db = await openDb()
  try {
    const rows = await db
      .selectFrom('pikkuUserRole')
      .select('role')
      .where('userId', '=', `user-${email}`)
      .execute()
    return rows.map((r) => r.role).sort()
  } finally {
    await db.destroy()
  }
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pikku-persona-sync-'))
  logs = []
  target = await startTarget()

  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, '.pikku', 'scopes'), { recursive: true })
  mkdirSync(join(root, '.pikku-runtime'), { recursive: true })
  writeFileSync(
    join(root, 'src', 'config.ts'),
    `export const createConfig = async () => ({ sqliteDb: '.pikku-runtime/dev.db' })`,
    'utf8'
  )
  writeFileSync(
    join(root, '.pikku', 'scopes', 'scopes.gen.json'),
    JSON.stringify(SCOPES_META),
    'utf8'
  )
  writeFileSync(
    join(root, '.pikku', 'scopes', 'roles.gen.json'),
    JSON.stringify(ROLES_META),
    'utf8'
  )

  // Better Auth owns and creates the `user` table before the scope service
  // ever runs; a user grant FKs into it.
  const db = await openDb()
  await (db as Kysely<any>).schema
    .createTable('user')
    .ifNotExists()
    .addColumn('id', 'text', (col: any) => col.primaryKey())
    .addColumn('email', 'text')
    .addColumn('actor', 'integer')
    .execute()
  await applyPikkuSchemas(db, [scopeSchema])
  const service = new KyselyScopeService(db)
  await service.init()
  await db.destroy()
})

afterEach(async () => {
  await target.stop()
  rmSync(root, { recursive: true, force: true })
})

describe('pikku persona sync', () => {
  test('creates the account and applies the declared roles', async () => {
    await run({ environment: 'local' })

    assert.deepEqual(target.signedIn.sort(), [
      'susan@e2e.test',
      'target@e2e.test',
    ])
    assert.deepEqual(await rolesOf('susan@e2e.test'), ['report-viewer'])
  })

  // Their account is the whole reason they were declared: other people ban,
  // unban and reset it. Refusing to provision it would break the scenarios
  // that act on them.
  test('provisions a persona that is declared runnable: false', async () => {
    await run({ environment: 'local' })

    assert.ok(target.signedIn.includes('target@e2e.test'))
  })

  // The rule that decides who may run decides who may be provisioned. `mo`
  // names production and nothing else, so `local` is not theirs.
  test('skips a persona that does not act in this environment', async () => {
    await run({ environment: 'local' })

    assert.ok(!target.signedIn.includes('mo@e2e.test'))
    assert.match(logs.join('\n'), /1 persona\(s\) skipped/)
  })

  // The other direction: production takes the accountable persona that named
  // it, and nobody else — the two who left `environments` off default to
  // everywhere *but* production.
  test('provisions only the accountable persona into production', async () => {
    await run({ environment: 'prod' })

    assert.deepEqual(target.signedIn, ['mo@e2e.test'])
    assert.deepEqual(await rolesOf('mo@e2e.test'), ['platform-admin'])
  })

  test('running twice grants nothing new and reports it', async () => {
    await run({ environment: 'local' })
    logs = []
    await run({ environment: 'local' })

    assert.deepEqual(await rolesOf('susan@e2e.test'), ['report-viewer'])
    assert.match(logs.join('\n'), /0 role grant\(s\) applied, 1 already held/)
  })

  // A dry run against production is the one somebody types before the real
  // thing, so it has to touch nothing at all.
  test('--dry-run signs nobody in and writes no grant', async () => {
    await run({ environment: 'prod', dryRun: true })

    assert.deepEqual(target.signedIn, [])
    assert.deepEqual(await rolesOf('mo@e2e.test'), [])
    const output = logs.join('\n')
    assert.match(output, /dry run/)
    assert.match(output, /mo\s+mo@e2e\.test -> platform-admin/)
  })

  test('--dry-run says why each skipped persona was skipped', async () => {
    await run({ environment: 'local', dryRun: true })

    assert.match(logs.join('\n'), /skipped: Refusing to sign in persona 'mo'/)
  })

  test('refuses an environment that is not configured', async () => {
    await assert.rejects(
      () => run({ environment: 'staging' }),
      /Unknown environment 'staging'/
    )
  })

  test('a project with no personas is a no-op, not an error', async () => {
    await run({ environment: 'local' }, [])

    assert.match(logs.join('\n'), /no personas are declared/)
    assert.deepEqual(target.signedIn, [])
  })

  // Pointing the command at one deployment's API and another's database would
  // otherwise report success while the grants landed nowhere.
  test('fails loudly when the database holds no row for a signed-in persona', async () => {
    // The target signs people in against its own store; this database is a
    // different deployment's, and has nobody in it.
    target.state.upserts = false

    await assert.rejects(
      () =>
        run({ environment: 'local' }, [
          {
            id: 'ghost',
            name: 'Ghost',
            roles: ['report-viewer'],
            goals: [],
            tags: [],
            runnable: true,
          },
        ]),
      /is not the one 'local' runs on/
    )
  })
})
