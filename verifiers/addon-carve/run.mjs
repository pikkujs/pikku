/**
 * addon-carve verifier.
 *
 * Two real pikku projects in sibling folders, each with its own
 * pikku.config.json:
 *   source/   — defines functions
 *   consumer/ — wires and calls the carved addons
 *
 * The orchestration mirrors the real publish flow:
 *   1. codegen the source project
 *   2. `pikku new addon <name> --carve --names <fn>` carves a few addons
 *   3. build each addon (pikku all + tsc + cp .pikku dist)
 *   4. link each into node_modules as a published package would be
 *   5. codegen the consumer and `tsc --noEmit` it against the addons
 *
 * Any failing step exits non-zero, failing the verifier.
 */
import { execFileSync } from 'node:child_process'
import {
  rmSync,
  mkdirSync,
  symlinkSync,
  cpSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const cli = join(root, 'packages/cli/dist/bin/pikku.js')
const tsc = join(root, 'node_modules/.bin/tsc')

const sourceDir = join(here, 'source')
const consumerDir = join(here, 'consumer')
const genDir = join(here, 'generated')

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })

// The few addons carved out of the one source project, selected by function
// name via the global `--names` filter.
const addons = [
  { name: 'greeter', names: 'greet' },
  { name: 'farewell', names: 'farewell' },
  // DB addon: carves only `createPost` (touches `post` + `user`). The source DB
  // also has `auditLog` (used by the un-carved `writeAudit`) — it must NOT leak
  // into this addon's owned set.
  {
    name: 'dbpost',
    names: 'createPost',
    ownedTables: ['post', 'user'],
    services: ['kysely'],
  },
  // Multi-service addon: `notifyAuthor` uses `kysely` (post + user) AND two
  // user-defined services (`email`, `clock`). The addon must require all three
  // as parent services and copy each user service's type into its own surface.
  {
    name: 'notifyaddon',
    names: 'notifyAuthor',
    ownedTables: ['post', 'user'],
    services: ['clock', 'email', 'kysely'],
    serviceTypeFiles: ['email-service.ts', 'clock-service.ts'],
  },
]

// Assert a carved DB addon scoped itself to a STRICT SUBSET of the source DB —
// tsc passing alone would also pass an un-shaken `Kysely<DB>`, so this is what
// actually proves the shake.
// Assert the carved factory requires EXACTLY the given parent services — base
// services are auto-provided, so they must not appear; nothing spurious may.
const assertServiceRequirement = (addonDir, services) => {
  const src = readFileSync(join(addonDir, 'src/services.ts'), 'utf-8')
  const parent = src.match(/async\s*\(_config,\s*\{([^}]*)\}/)?.[1]
  assert.ok(parent !== undefined, `no pikkuAddonServices factory:\n${src}`)
  assert.deepEqual(
    parent.split(',').map((s) => s.trim()).filter(Boolean).sort(),
    [...services].sort(),
    `addon must require exactly ${services.join(', ')}:\n${src}`
  )
}

// Assert each user-defined (non-base, non-kysely) service is declared on the
// addon's SingletonServices AND its type file was copied in — the type-level
// half of the service shake, which makes the factory destructure compile.
const assertServiceShake = (addonDir, services, typeFiles) => {
  const appTypes = readFileSync(
    join(addonDir, 'types/application-types.d.ts'),
    'utf-8'
  )
  for (const s of services) {
    if (s === 'kysely') continue
    assert.ok(
      new RegExp(`\\b${s}:`).test(appTypes),
      `expected SingletonServices to declare '${s}':\n${appTypes}`
    )
  }
  for (const f of typeFiles ?? []) {
    assert.ok(
      existsSync(join(addonDir, 'types', f)),
      `expected copied service type file types/${f}`
    )
  }
  console.log(
    `[addon-carve] ✓ service shake: addon declares ${services
      .filter((s) => s !== 'kysely')
      .join(', ')}`
  )
}

const assertDbShake = (addonDir, owned) => {
  const scoped = readFileSync(
    join(addonDir, 'types/addon-db.gen.ts'),
    'utf-8'
  )
  for (const t of owned) {
    assert.ok(
      scoped.includes(`'${t}'`),
      `expected scoped AddonDB to own '${t}':\n${scoped}`
    )
  }
  assert.ok(
    !scoped.includes(`'auditLog'`),
    `'auditLog' must NOT be owned by the addon (used only by an un-carved fn):\n${scoped}`
  )

  const sql = readFileSync(
    join(addonDir, `db/sqlite/0001-${basename(addonDir)}.sql`),
    'utf-8'
  )
  assert.ok(/\bpost\b/.test(sql), `owned-table SQL must create 'post':\n${sql}`)
  assert.ok(/\buser\b/.test(sql), `owned-table SQL must create 'user':\n${sql}`)
  assert.ok(
    !/audit/i.test(sql),
    `owned-table SQL must NOT create 'auditLog':\n${sql}`
  )

  console.log(`[addon-carve] ✓ DB shake: addon owns exactly ${owned.join(', ')}`)
}

console.log('\n[addon-carve] 1. codegen source')
run('node', [cli, 'all'], sourceDir)

rmSync(genDir, { recursive: true, force: true })
mkdirSync(genDir, { recursive: true })
mkdirSync(join(root, 'node_modules/@pikku'), { recursive: true })

for (const { name, names, ownedTables, services, serviceTypeFiles } of addons) {
  console.log(`\n[addon-carve] 2. carve addon '${name}' (--names ${names})`)
  run(
    'node',
    [cli, 'new', 'addon', name, '--carve', '--names', names, '--dir', genDir, '--test', 'false'],
    sourceDir
  )

  const addonDir = join(genDir, name)
  if (ownedTables) assertDbShake(addonDir, ownedTables)
  if (services) assertServiceRequirement(addonDir, services)
  if (serviceTypeFiles) assertServiceShake(addonDir, services, serviceTypeFiles)

  console.log(`[addon-carve] 3. build addon '${name}'`)
  run('node', [cli, 'all'], addonDir)
  run(tsc, [], addonDir)
  cpSync(join(addonDir, '.pikku'), join(addonDir, 'dist/.pikku'), {
    recursive: true,
  })

  // 4. resolve the addon as a published package would be.
  const link = join(root, 'node_modules/@pikku', `addon-${name}`)
  rmSync(link, { recursive: true, force: true })
  symlinkSync(addonDir, link)
}

console.log('\n[addon-carve] 5. codegen + typecheck consumer against the addons')
run('node', [cli, 'all'], consumerDir)
run(tsc, ['--noEmit'], consumerDir)

console.log('\n✓ addon-carve verifier passed')
