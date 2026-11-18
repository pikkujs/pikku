/**
 * Verifier for column types, logical defaults and `onUpdate` in `db/tables.ts`.
 *
 * The CLI binary runs against a throwaway copy of this project, once per
 * engine, and the assertions read what it wrote: the migration SQL, the
 * coercion map and the generated types. On sqlite the migrated database is then
 * opened and the declaration is proved by behaviour: the uuid default fills a
 * version 4 UUID, the timestamp default is a real time, the trigger moves
 * `updated_at` when an UPDATE leaves it alone and an explicit value wins.
 * A second declaration with a bad default is refused with a sentence naming the
 * column and the engine.
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PIKKU_BIN = join(
  HERE,
  '..',
  '..',
  'packages',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)
const WORK = join(HERE, '.work')
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let failures = 0
const check = async (name: string, body: () => void | Promise<void>) => {
  try {
    await body()
    console.log(`  ok  ${name}`)
  } catch (error: any) {
    failures++
    console.log(
      `  FAIL ${name}\n       ${String(error.message).split('\n').join('\n       ')}`
    )
  }
}
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const run = (cwd: string, args: string[], allowFailure = false): string => {
  try {
    return execFileSync('node', [PIKKU_BIN, ...args], {
      cwd,
      env: process.env,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300_000,
    })
  } catch (error: any) {
    if (allowFailure) return `${error.stdout ?? ''}${error.stderr ?? ''}`
    throw new Error(
      `pikku ${args.join(' ')} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`
    )
  }
}

const project = (engine: 'sqlite' | 'postgres'): string => {
  const dir = join(WORK, engine)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'db', engine), { recursive: true })
  for (const entry of ['src', 'types', 'tsconfig.json', 'package.json']) {
    cpSync(join(HERE, entry), join(dir, entry), { recursive: true })
  }
  cpSync(join(HERE, 'db', 'tables.ts'), join(dir, 'db', 'tables.ts'))
  const config = JSON.parse(
    readFileSync(join(HERE, 'pikku.config.json'), 'utf8')
  )
  config.db = { engine }
  writeFileSync(join(dir, 'pikku.config.json'), JSON.stringify(config, null, 2))
  symlinkSync(join(HERE, 'node_modules'), join(dir, 'node_modules'))
  return dir
}

const migrationFor = (dir: string, engine: string): string => {
  const folder = join(dir, 'db', engine)
  const file = readdirSync(folder).find((f) => f.includes('app-tables'))
  assert(file, `no app-tables migration in ${folder}`)
  return readFileSync(join(folder, file!), 'utf8')
}

rmSync(WORK, { recursive: true, force: true })

console.log('sqlite')
const sqlite = project('sqlite')
run(sqlite, [])
run(sqlite, ['db', 'generate'])
const sqliteSql = migrationFor(sqlite, 'sqlite')

await check(
  'the uuid default is a randomblob expression and the trigger is AFTER UPDATE',
  () => {
    assert(/randomblob\(4\)/.test(sqliteSql), 'no randomblob uuid default')
    assert(
      /create trigger "note_updated_at_on_update" after update on "note"/.test(
        sqliteSql
      ),
      'no AFTER UPDATE trigger'
    )
    assert(
      !/pikku_on_update/.test(sqliteSql),
      'sqlite got the postgres function'
    )
  }
)

run(sqlite, ['db', 'migrate'])

await check('the coercion map reads views as a bigint', () => {
  const coercion = readFileSync(
    join(sqlite, '.pikku', 'db', 'coercion.gen.ts'),
    'utf8'
  )
  assert(/"views": "bigint"/.test(coercion), coercion)
})

await check('the generated type for views is number', () => {
  const schema = readFileSync(
    join(sqlite, '.pikku', 'db', 'schema.gen.ts'),
    'utf8'
  )
  assert(
    /views: ColumnType<Private<number>/.test(schema),
    'views is not a number'
  )
})

await check(
  'input: false leaves updated_at out of the insert types and the zod input',
  () => {
    const schema = readFileSync(
      join(sqlite, '.pikku', 'db', 'schema.gen.ts'),
      'utf8'
    )
    assert(
      /updatedAt: ColumnType<Private<string>, never, never>/.test(schema),
      'updatedAt accepts input'
    )
    const zod = readFileSync(join(sqlite, '.pikku', 'db', 'zod.gen.ts'), 'utf8')
    const insert =
      /export const NoteInsertZ = z\.object\(\{([^}]*)\}\)/.exec(zod)?.[1] ?? ''
    assert(insert.includes('views') && !insert.includes('updatedAt'), insert)
    assert(
      /NotePatchZ = NoteZ\.omit\(\{ updatedAt: true \}\)\.partial\(\)/.test(
        zod
      ),
      'patch keeps updatedAt'
    )
  }
)

await check(
  'the migrated database fills the uuid, the time, and fires the trigger',
  () => {
    const db = new DatabaseSync(join(sqlite, '.pikku-runtime', 'dev.db'))
    db.exec(`insert into note (updated_at) values ('2000-01-01 00:00:00')`)
    const row = db.prepare('select * from note').get() as any
    assert(UUID_V4.test(row.id), `id ${row.id} is not a version 4 uuid`)
    assert(
      new Date(`${row.created_at}Z`).getFullYear() >= 2025,
      `created_at ${row.created_at}`
    )

    db.exec(`update note set views = 1`)
    const touched = db.prepare('select updated_at from note').get() as any
    assert(
      new Date(`${touched.updated_at}Z`).getFullYear() >= 2025,
      'the trigger did not move updated_at'
    )

    db.exec(`update note set views = 2, updated_at = '2001-01-01 00:00:00'`)
    const explicit = db.prepare('select updated_at from note').get() as any
    assert(
      explicit.updated_at.startsWith('2001'),
      'an explicit updated_at did not win'
    )
    db.close()
  }
)

await check('generate is idempotent once migrated', () => {
  const output = run(sqlite, ['db', 'generate'])
  assert(!/wrote/.test(output), output)
})

console.log('postgres')
const postgres = project('postgres')
run(postgres, [])
run(postgres, ['db', 'generate'])
const postgresSql = migrationFor(postgres, 'postgres')

await check(
  'postgres spells the defaults natively and gets a shared function with its trigger',
  () => {
    assert(
      /"id" uuid default gen_random_uuid\(\)/.test(postgresSql),
      postgresSql
    )
    assert(
      /"created_at" timestamp default now\(\)/.test(postgresSql),
      postgresSql
    )
    const fn = postgresSql.indexOf(
      'create or replace function "pikku_on_update"'
    )
    const trigger = postgresSql.indexOf(
      'create trigger "note_updated_at_on_update" before update on "note"'
    )
    assert(
      fn >= 0 && trigger > fn,
      'the function must exist before the trigger'
    )
    assert(!/randomblob/.test(postgresSql), 'postgres got the sqlite uuid')
  }
)

await check('migrating on the embedded postgres runs the trigger SQL', () => {
  run(postgres, ['db', 'migrate'])
  const again = run(postgres, ['db', 'generate'])
  assert(!/wrote/.test(again), again)
})

console.log('refusals')
await check(
  'a default with no SQL for the project engine is refused, naming column and engine',
  () => {
    const dir = project('sqlite')
    writeFileSync(
      join(dir, 'db', 'tables.ts'),
      `import { defineTables } from '@pikku/core/db'
export const tables = defineTables({
  note: { columns: { id: { type: 'uuid', primaryKey: true, default: { sql: { postgres: 'gen_random_uuid()' } } } } },
})
`
    )
    run(dir, [])
    const output = run(dir, ['db', 'generate'], true)
    assert(/note\.id default has no SQL for sqlite/.test(output), output)
    assert(
      !existsSync(join(dir, 'db', 'sqlite', '0002-app-tables.sql')),
      'a migration was written'
    )
  }
)

await check(
  'a declared default that fails when a row is inserted is refused before anything is written',
  () => {
    const dir = project('sqlite')
    writeFileSync(
      join(dir, 'db', 'tables.ts'),
      `import { defineTables } from '@pikku/core/db'
export const tables = defineTables({
  note: { columns: { n: { type: 'integer', default: { sql: { sqlite: 'nosuchfunction()' } } } } },
})
`
    )
    run(dir, [])
    const output = run(dir, ['db', 'generate'], true)
    assert(/note\.n default did not run/.test(output), output)
    assert(
      !existsSync(join(dir, 'db', 'sqlite', '0002-app-tables.sql')),
      'a migration was written'
    )
  }
)

rmSync(WORK, { recursive: true, force: true })
if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
