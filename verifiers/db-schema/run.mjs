/**
 * End-to-end verifier for the schema-source registry.
 *
 * Every source `pikku db generate` knows about is present and real: Better Auth
 * configured with plugins that add tables *and* columns, the `@pikku/kysely`
 * runtime declaration, and an addon that ships a table and publishes it with
 * `pikku db export`. Nothing is stubbed — the CLI binary runs against a file
 * database, and the assertions read the migrations it wrote and the database it
 * migrated.
 *
 * The sequence:
 *   1.  addon: pikku all + pikku db export      → publishes .pikku/db
 *   2.  link node_modules/<addon> → ./addon     (what a yarn workspace makes)
 *   3.  app:   pikku all                        → records the wireAddon declaration
 *   4.  app:   pikku db generate                → one migration per source, ordered
 *   5.  assert the auth migration carries the plugin tables and columns
 *   6.  assert the runtime migration carries the tables that need `user.id`
 *   7.  assert the addon migration is the addon's own SQL, indexes intact
 *   8.  app:   pikku db migrate                 → applies all three
 *   9.  app:   pikku db check                   → clean
 *   10. app:   pikku db generate                → idempotent, writes nothing
 *   11. app:   tsc + runtime                    → addon reads its table, boot does no DDL
 *   12. app:   pikku db baseline                → adopts a database that already has it
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
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const addonDir = join(here, 'addon')

const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')
const TSX = join(repoRoot, 'node_modules/.bin/tsx')
const ADDON_PKG = '@pikku/verifier-db-addon'
const MIGRATIONS_DIR = join(here, 'db', 'sqlite')
const DB_FILE = join(here, '.pikku-runtime', 'dev.db')

/** The table the sqlite migrator records applied migrations in. */
const TRACKING_TABLE = 'sql_migrations'

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
  execFileSync(file, args, { cwd, stdio: 'inherit' })
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
    })
    process.stdout.write(output)
    return { status: 0, output }
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    console.log(`  (exited ${error.status})`)
    return { status: error.status ?? 1, output }
  }
}

/** How many migrations the tracking table claims are applied. */
function appliedCount(file) {
  if (!existsSync(file)) return 0
  const db = new DatabaseSync(file)
  try {
    const row = db
      .prepare(
        `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`
      )
      .get(TRACKING_TABLE)
    if (row.n === 0) return 0
    return db.prepare(`SELECT count(*) AS n FROM ${TRACKING_TABLE}`).get().n
  } finally {
    db.close()
  }
}

function capture(label, file, args, cwd = here) {
  console.log(`\n▶ ${label}`)
  const output = execFileSync(file, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  process.stdout.write(output)
  return output
}

rmSync(MIGRATIONS_DIR, { recursive: true, force: true })
rmSync(join(here, '.pikku-runtime'), { recursive: true, force: true })
rmSync(join(here, '.pikku'), { recursive: true, force: true })
rmSync(join(addonDir, '.pikku'), { recursive: true, force: true })

// 1. The addon publishes what it needs. It never creates it.
run('addon: pikku all', 'node', [PIKKU, 'all'], addonDir)
run('addon: pikku db export', 'node', [PIKKU, 'db', 'export'], addonDir)

console.log('\n▶ assert: the published artifact describes the addon’s table')
const artifactPath = join(addonDir, '.pikku', 'db', 'pikku-db-meta.gen.json')
check(existsSync(artifactPath), 'pikku db export wrote .pikku/db')
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
check(
  Object.keys(artifact).join(',') === 'sqlite',
  `exported only the dialects the addon has migrations for (${Object.keys(artifact).join(',') || 'none'})`
)
check(
  artifact.sqlite?.tables?.labels?.map((c) => c.name).join(',') ===
    'id,name,color',
  'the artifact carries the introspected columns of `labels`'
)
contains(
  artifact.sqlite?.sql ?? '',
  'CREATE UNIQUE INDEX labels_name_unique',
  'the artifact carries the SQL that creates it, indexes included'
)

// 2. The symlink `yarn install` would make for a workspace member, so that
//    `wireAddon({ package })` and `require.resolve` both find the addon by name.
const linkPath = join(here, 'node_modules', ...ADDON_PKG.split('/'))
rmSync(linkPath, { recursive: true, force: true })
mkdirSync(dirname(linkPath), { recursive: true })
symlinkSync(relative(dirname(linkPath), addonDir), linkPath, 'dir')
console.log(`\n▶ linked node_modules/${ADDON_PKG} → ./addon`)

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
check(/runtime|pikku/.test(runtimeFile ?? ''), `runtime is second (${runtimeFile})`)
check(/db-addon|addon/.test(addonFile ?? ''), `the addon is last (${addonFile})`)

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
  '"impersonated_by"',
  '"two_factor_enabled"',
]) {
  contains(authSql, column, 'plugin column on an existing table')
}

// 6. The cross-source assertion: these two exist only because the auth source
//    ran into the same scratch database first and satisfied `user.id`.
console.log('\n▶ assert: the runtime migration cleared its auth prerequisite')
const runtimeSql = sqlOf(runtimeFile)
for (const table of ['pikku_user_role', 'pikku_user_scope']) {
  contains(runtimeSql, table, 'requires user.id')
}
for (const table of ['workflow_runs', 'ai_run', 'secrets']) {
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

// 8-9. Apply it all, then ask the database whether it agrees.
run('app: pikku db migrate', 'node', [PIKKU, 'db', 'migrate'])
const checked = capture('app: pikku db check', 'node', [PIKKU, 'db', 'check'])
check(
  checked.includes('db check: the database matches its migrations'),
  'db check reports the database matches its migrations'
)

// 10. Running it again must be a no-op, or every deploy grows a migration.
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

// 11. What the migrated database is worth at runtime.
run('app: tsc --noEmit', TSC, ['--noEmit', '-p', 'tsconfig.json'])
run('app: runtime checks', TSX, ['src/start.ts'])

// 12. Baselining: the deployment that already has the tables but no record of
//     how they got there — the shape you get when a runtime created them at boot
//     and the migration writing them down was authored afterwards. Dropping the
//     tracking rows reproduces it exactly: same schema, no history.
console.log(
  '\n▶ baseline: a database that already has what the migrations describe'
)
const db = new DatabaseSync(DB_FILE)
db.exec(`DELETE FROM ${TRACKING_TABLE}`)
db.close()

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
  !settled.includes('applied 0001-better-auth.sql'),
  'migrate now has nothing pending, so the history has caught up with reality'
)

// 13. And it must refuse the database it would be lying about. Baselining one
//     that is genuinely behind would bury a real gap under a history claiming
//     everything is applied.
console.log('\n▶ baseline: refuses a database that is actually behind')
rmSync(DB_FILE, { force: true })
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
  appliedCount(DB_FILE) === 0,
  'the refusal recorded nothing (a partial baseline is the worst outcome)'
)

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\n✓ schema sources, addon channel, migrate/check/baseline all verified')
