/**
 * End-to-end verifier for the schema-source registry, on either dialect.
 *
 * Every source `pikku db generate` knows about is present and real: Better Auth
 * configured with plugins that add tables *and* columns, the `@pikku/kysely`
 * runtime declaration, and an addon that ships a table and publishes it with
 * `pikku db export`. Nothing is stubbed — the CLI binary runs against a real
 * database, and the assertions read the migrations it wrote and the database it
 * migrated.
 *
 * A second addon is wired with `wireRemoteAddon`, and it must contribute
 * nothing. Its artifact is on disk and is as complete as the local addon's, so
 * the only thing standing between its table and this project's migrations is
 * the declaration — which is exactly the claim worth running the whole pipeline
 * to make. The unit tests pass `remote: true` in by hand; only here does it come
 * from `wireRemoteAddon` in source, through the inspector, to the registry.
 *
 * `node run.mjs` uses sqlite. `node run.mjs --postgres` uses the server at
 * `DATABASE_URL`, which is worth running separately rather than trusting sqlite
 * to stand in: the auth config asks for uuid keys, which postgres honours and
 * sqlite cannot, so only there does the scope tables' foreign key to `user.id`
 * have a type it must actually agree with — and only there was it silently
 * rejected for as long as it was.
 *
 * The sequence:
 *   1.  addons: pikku all + pikku db export    → publishes .pikku/db, per dialect
 *   2.  link node_modules/<addon> → ./addon    (what a yarn workspace makes)
 *   3.  app:   pikku all                       → records both addon declarations
 *   4.  app:   pikku db generate               → one migration per source, ordered
 *   5.  assert the auth migration carries the plugin tables and columns
 *   6.  assert the runtime migration carries the tables that need `user.id`
 *   7.  assert the addon migration is the addon's own SQL, indexes intact
 *   8.  assert the remote addon got no migration at all
 *   9.  app:   pikku db migrate                → applies all three
 *   10. app:   pikku db check                  → clean, and the remote table is absent
 *   11. app:   pikku db generate               → idempotent, writes nothing
 *   12. app:   tsc + runtime                   → addon reads its table, boot does no DDL
 *   13. app:   pikku db baseline               → adopts a database that already has it
 *   14. app:   pikku db baseline               → refuses one that is actually behind
 */
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const addonDir = join(here, 'addon')
const remoteAddonDir = join(here, 'remote-addon')

const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')
const TSX = join(repoRoot, 'node_modules/.bin/tsx')
const ADDON_PKG = '@pikku/verifier-db-addon'
const REMOTE_ADDON_PKG = '@pikku/verifier-db-remote-addon'
/** The table the remote addon ships, which belongs to the host's database. */
const REMOTE_TABLE = 'notes'

/** The table both migrators record applied migrations in. */
const TRACKING_TABLE = 'sql_migrations'

const usePostgres = process.argv.includes('--postgres')
const postgresUrl = process.env.DATABASE_URL
if (usePostgres && !postgresUrl) {
  console.error('✗ --postgres needs DATABASE_URL to point at a postgres server')
  process.exit(1)
}

const dialect = usePostgres ? 'postgres' : 'sqlite'
const MIGRATIONS_DIR = join(here, 'db', dialect)
const SQLITE_FILE = join(here, '.pikku-runtime', 'dev.db')

/**
 * The environment the CLI and the runtime both read to pick a dialect, so the
 * two passes differ in the database and nothing else.
 */
const env = usePostgres
  ? { ...process.env, PIKKU_VERIFIER_POSTGRES_URL: postgresUrl }
  : { ...process.env, PIKKU_VERIFIER_POSTGRES_URL: undefined }

let failures = 0

const check = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`)
  if (!ok) failures++
  return ok
}

const contains = (haystack, needle, label) =>
  check(haystack.includes(needle), `${label}: ${needle}`)

function run(label, file, args, cwd = here) {
  console.log(`\n▶ ${label}`)
  execFileSync(file, args, { cwd, stdio: 'inherit', env })
}

function capture(label, file, args, cwd = here) {
  console.log(`\n▶ ${label}`)
  const output = execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  process.stdout.write(output)
  return output
}

/**
 * Run a command that is supposed to fail, and hand back why.
 *
 * A refusal is behaviour under test here, not an accident, so it has to be
 * observed rather than thrown.
 */
function expectFailure(label, args, cwd = here) {
  console.log(`\n▶ ${label}`)
  try {
    const output = execFileSync('node', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    process.stdout.write(output)
    return { status: 0, output }
  } catch (error) {
    console.log(`  (exited ${error.status})`)
    return { status: error.status ?? 1 }
  }
}

/**
 * What the verifier needs from the database itself, either dialect: put it back
 * to empty, read or clear the migrator's own tracking table, and ask whether a
 * table is there.
 */
const store = usePostgres
  ? (() => {
      const sql = postgres(postgresUrl, { max: 1 })
      return {
        reset: async () => {
          await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE')
          await sql.unsafe('CREATE SCHEMA public')
        },
        clearHistory: async () => {
          await sql.unsafe(`DELETE FROM ${TRACKING_TABLE}`)
        },
        appliedCount: async () => {
          const [row] = await sql.unsafe(
            `SELECT count(*)::int AS n FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = '${TRACKING_TABLE}'`
          )
          if (row.n === 0) return 0
          const [applied] = await sql.unsafe(
            `SELECT count(*)::int AS n FROM ${TRACKING_TABLE}`
          )
          return applied.n
        },
        hasTable: async (table) => {
          const [row] = await sql.unsafe(
            `SELECT count(*)::int AS n FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = '${table}'`
          )
          return row.n > 0
        },
        close: async () => await sql.end(),
      }
    })()
  : {
      reset: async () => {
        rmSync(join(here, '.pikku-runtime'), { recursive: true, force: true })
      },
      clearHistory: async () => {
        const db = new DatabaseSync(SQLITE_FILE)
        db.exec(`DELETE FROM ${TRACKING_TABLE}`)
        db.close()
      },
      appliedCount: async () => {
        if (!existsSync(SQLITE_FILE)) return 0
        const db = new DatabaseSync(SQLITE_FILE)
        try {
          const { n } = db
            .prepare(
              `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`
            )
            .get(TRACKING_TABLE)
          if (n === 0) return 0
          return db.prepare(`SELECT count(*) AS n FROM ${TRACKING_TABLE}`).get()
            .n
        } finally {
          db.close()
        }
      },
      hasTable: async (table) => {
        if (!existsSync(SQLITE_FILE)) return false
        const db = new DatabaseSync(SQLITE_FILE)
        try {
          const { n } = db
            .prepare(
              `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`
            )
            .get(table)
          return n > 0
        } finally {
          db.close()
        }
      },
      close: async () => {},
    }

console.log(`\n══ db-schema verifier (${dialect}) ══`)

rmSync(MIGRATIONS_DIR, { recursive: true, force: true })
rmSync(join(here, '.pikku'), { recursive: true, force: true })
rmSync(join(addonDir, '.pikku'), { recursive: true, force: true })
rmSync(join(remoteAddonDir, '.pikku'), { recursive: true, force: true })
// Generated, but outside `.pikku` — and left behind, the next run inspects a
// project whose auth wiring already exists, which is not the run CI does. The
// two answers differed once (`kysely` required on the second run, unused on the
// first); the verifier only sees that if it starts where a checkout starts.
rmSync(join(here, 'src', 'scaffold'), { recursive: true, force: true })
await store.reset()

// 1. Both addons publish what they need. Neither creates it.
run('addon: pikku all', 'node', [PIKKU, 'all'], addonDir)
run('addon: pikku db export', 'node', [PIKKU, 'db', 'export'], addonDir)
run('remote addon: pikku all', 'node', [PIKKU, 'all'], remoteAddonDir)
run(
  'remote addon: pikku db export',
  'node',
  [PIKKU, 'db', 'export'],
  remoteAddonDir
)

console.log('\n▶ assert: the published artifact describes the addon’s table')
const artifactPath = join(addonDir, '.pikku', 'db', 'pikku-db-meta.gen.json')
check(existsSync(artifactPath), 'pikku db export wrote .pikku/db')
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
check(
  Object.keys(artifact).sort().join(',') === 'postgres,sqlite',
  `every dialect the addon has migrations for is published (${Object.keys(artifact).join(',') || 'none'})`
)
const exported = artifact[dialect]
check(
  exported?.tables?.labels?.map((c) => c.name).join(',') === 'id,name,color',
  `the ${dialect} artifact carries the introspected columns of \`labels\``
)
contains(
  exported?.sql ?? '',
  'CREATE UNIQUE INDEX labels_name_unique',
  'the artifact carries the SQL that creates it, indexes included'
)

// The remote addon's artifact has to be just as complete, or the fact that no
// migration comes out of it later proves nothing — an addon with nothing to
// contribute is skipped for the wrong reason.
const remoteArtifactPath = join(
  remoteAddonDir,
  '.pikku',
  'db',
  'pikku-db-meta.gen.json'
)
check(
  existsSync(remoteArtifactPath),
  'the remote addon published a schema too — its table is real, and not this project’s'
)
const remoteExported = JSON.parse(readFileSync(remoteArtifactPath, 'utf8'))[
  dialect
]
check(
  remoteExported?.tables?.[REMOTE_TABLE]?.map((c) => c.name).join(',') ===
    'id,body',
  `the ${dialect} artifact carries the introspected columns of \`${REMOTE_TABLE}\``
)

// 2. The symlink `yarn install` would make for a workspace member, so that
//    `wireAddon({ package })` and `require.resolve` both find the addon by name.
const linkPath = join(here, 'node_modules', ...ADDON_PKG.split('/'))
rmSync(linkPath, { recursive: true, force: true })
mkdirSync(dirname(linkPath), { recursive: true })
symlinkSync(relative(dirname(linkPath), addonDir), linkPath, 'dir')
console.log(`\n▶ linked node_modules/${ADDON_PKG} → ./addon`)

// The remote addon is not linked here: `wireRemoteAddon` requires the package
// to be a devDependency (it ships types only, its handlers run on the host), and
// `pikku all` fails the project if it is not — so it is declared in
// package.json and yarn links it, which is also the only way that rule gets
// exercised.
check(
  existsSync(
    createRequire(join(here, 'package.json')).resolve(
      `${REMOTE_ADDON_PKG}/.pikku/db/pikku-db-meta.gen.json`
    )
  ),
  'the remote addon resolves by package name, so nothing is hidden from db generate'
)

// 3-4. The consumer discovers the addon because it is wired, then writes one
//      migration per source.
run('app: pikku all', 'node', [PIKKU, 'all'])
const generated = capture('app: pikku db generate', 'node', [
  PIKKU,
  'db',
  'generate',
])

console.log('\n▶ assert: one migration per source, in dependency order')
const files = readdirSync(MIGRATIONS_DIR).sort()
check(files.length === 3, `three migrations written (${files.join(', ')})`)
const [authFile, runtimeFile, addonFile] = files
check(
  /auth/.test(authFile ?? ''),
  `auth is first, because everything else references user.id (${authFile})`
)
check(
  /runtime|pikku/.test(runtimeFile ?? ''),
  `runtime is second (${runtimeFile})`
)
check(
  /db-addon|addon/.test(addonFile ?? ''),
  `the addon is last (${addonFile})`
)

const sqlOf = (file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

// 5. Plugins are the point. A generator that hardcodes the four core tables, or
//    that creates tables but never adds columns to them, fails right here.
console.log('\n▶ assert: the auth migration is what Better Auth materialized')
const authSql = sqlOf(authFile)
for (const table of ['user', 'session', 'account', 'verification']) {
  contains(authSql, `"${table}"`, 'core table')
}
for (const table of ['organization', 'member', 'invitation']) {
  contains(authSql, `"${table}"`, 'organization() table')
}
contains(authSql, '"two_factor"', 'twoFactor() table')
for (const column of [
  '"banned"',
  '"ban_reason"',
  '"ban_expires"',
  '"two_factor_enabled"',
]) {
  contains(authSql, column, 'plugin column on an existing table')
}
check(
  usePostgres
    ? /create table "user" \("id" uuid\b/i.test(authSql)
    : /create table "user" \("id" text\b/i.test(authSql),
  usePostgres
    ? 'postgres made user.id a uuid, as generateId: uuid asks'
    : 'sqlite made user.id text — it has no uuid type to ask for'
)

// 6. The cross-source assertion: these two exist only because the auth source
//    ran into the same scratch database first and satisfied `user.id`. The
//    column type has to have been taken from `user.id` too — on postgres a
//    `text` column referencing a `uuid` one is rejected outright, which is how
//    this went unnoticed for so long.
console.log('\n▶ assert: the runtime migration cleared its auth prerequisite')
const runtimeSql = sqlOf(runtimeFile)
for (const table of ['pikku_user_role', 'pikku_user_scope']) {
  contains(runtimeSql, table, 'requires user.id')
}
check(
  new RegExp(
    `"user_id" ${usePostgres ? 'uuid' : 'text'} not null references "user"`,
    'i'
  ).test(runtimeSql),
  usePostgres
    ? 'user_id took its type from user.id (uuid), not the text it used to declare'
    : 'user_id took its type from user.id (text)'
)
for (const table of ['workflow_runs', 'agent_run', 'secrets']) {
  contains(runtimeSql, table, 'runtime table')
}
check(
  !generated.includes('could not be recognised'),
  'no runtime schema was skipped for an unmet requirement'
)

// 7. Nothing covered means the source's own SQL, verbatim — a column diff would
//    have silently dropped the unique index.
console.log('\n▶ assert: the addon migration is the addon’s own SQL')
const addonSql = sqlOf(addonFile)
contains(addonSql, 'CREATE TABLE labels', 'the table')
contains(addonSql, 'CREATE UNIQUE INDEX labels_name_unique', 'and its index')

// 8. The remote addon is the same channel, the same artifact, and the opposite
//    answer. Three migrations above already says there is no fourth; this says
//    its table did not get folded into one of the three either.
console.log('\n▶ assert: the remote addon contributed nothing')
check(
  !files.some((file) => file.includes('remote')),
  'no migration was written for the remote addon'
)
check(
  !files.some((file) => sqlOf(file).includes(REMOTE_TABLE)),
  `no migration mentions \`${REMOTE_TABLE}\` — the host's table stayed the host's`
)
check(
  !generated.includes(REMOTE_ADDON_PKG),
  'db generate did not report the remote addon as a source at all'
)

// 9-10. Apply it all, then ask the database whether it agrees. On postgres this
//       is where a foreign key that only compiles is separated from one that the
//       server will actually accept.
run('app: pikku db migrate', 'node', [PIKKU, 'db', 'migrate'])
const checked = capture('app: pikku db check', 'node', [PIKKU, 'db', 'check'])
check(
  checked.includes('db check: the database matches its migrations'),
  'db check reports the database matches its migrations'
)
check(
  !(await store.hasTable(REMOTE_TABLE)),
  `\`${REMOTE_TABLE}\` is not in this database — the remote addon reads it on another one`
)

// 11. Running it again must be a no-op, or every deploy grows a migration.
const again = capture('app: pikku db generate (again)', 'node', [
  PIKKU,
  'db',
  'generate',
])
check(
  readdirSync(MIGRATIONS_DIR).length === 3,
  'a second generate wrote nothing'
)
check(
  again.includes('already covered by existing migrations'),
  'every source reported itself already covered'
)

// 12. What the migrated database is worth at runtime.
run('app: tsc --noEmit', TSC, ['--noEmit', '-p', 'tsconfig.json'])
run('app: runtime checks', TSX, ['src/start.ts'])

// 13. Baselining: the deployment that already has the tables but no record of
//     how they got there — the shape you get when a runtime created them at boot
//     and the migration writing them down was authored afterwards. Dropping the
//     tracking rows reproduces it exactly: same schema, no history.
console.log(
  '\n▶ baseline: a database that already has what the migrations describe'
)
await store.clearHistory()

const wouldFail = expectFailure('app: pikku db migrate (history wiped)', [
  PIKKU,
  'db',
  'migrate',
])
check(
  wouldFail.status !== 0,
  'migrate cannot rescue it — the tables it would create are already there'
)

const baselined = capture('app: pikku db baseline', 'node', [
  PIKKU,
  'db',
  'baseline',
])
check(
  baselined.includes('recorded 3 migration(s) as applied without running them'),
  'baseline adopted all three without executing any SQL'
)

const settled = capture('app: pikku db migrate (baselined)', 'node', [
  PIKKU,
  'db',
  'migrate',
])
check(
  !settled.includes(`applied ${authFile}`),
  'migrate now has nothing pending, so the history has caught up with reality'
)

// 14. And it must refuse the database it would be lying about. Baselining one
//     that is genuinely behind would bury a real gap under a history claiming
//     everything is applied.
console.log('\n▶ baseline: refuses a database that is actually behind')
await store.reset()
const refused = expectFailure('app: pikku db baseline (empty database)', [
  PIKKU,
  'db',
  'baseline',
])
check(
  refused.status !== 0,
  'baseline refused an empty database rather than recording a fiction'
)
check(
  (await store.appliedCount()) === 0,
  'the refusal recorded nothing (a partial baseline is the worst outcome)'
)

await store.close()

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed on ${dialect}`)
  process.exit(1)
}
console.log(
  `\n✓ ${dialect}: schema sources, addon channel, migrate/check/baseline all verified`
)
