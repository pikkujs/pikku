#!/usr/bin/env node
// A stand-in pikku CLI for the db step tests, run in a repo whose project root is the repository root.
// `db/tables.ts` lines `table:<name>` declare tables, `drop:<name>` asks for a DROP, `broken` makes
// `db generate` fail on its own, `tracked` makes `all` write a tracked file. Calls are logged to .pikku/calls.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'

const args = process.argv.slice(2).join(' ')
mkdirSync('.pikku', { recursive: true })
appendFileSync('.pikku/calls', `${args}\n`)
const tables = existsSync('db/tables.ts')
  ? readFileSync('db/tables.ts', 'utf8').split('\n')
  : []
const migrations = () =>
  existsSync('db/sqlite') ? readdirSync('db/sqlite').sort() : []

switch (args) {
  case 'db generate': {
    if (tables.includes('broken')) {
      process.stderr.write(
        'db generate: could not open the database: password=hunter2hunter2\n'
      )
      process.exit(1)
    }
    const drops = tables.filter((line) => line.startsWith('drop:'))
    if (drops.length) {
      process.stderr.write(
        'db generate: db/tables.ts asks for changes that lose data:\n'
      )
      for (const drop of drops)
        process.stderr.write(`  DROP TABLE ${drop.slice(5)}\n`)
      process.stderr.write(
        '  Nothing was written for them. Re-run with --allowDestructive to write them; each is marked, so `db migrate` asks once more before applying.\n'
      )
      process.exit(1)
    }
    mkdirSync('db/sqlite', { recursive: true })
    for (const line of tables.filter((l) => l.startsWith('table:'))) {
      const name = line.slice(6)
      if (migrations().some((file) => file.endsWith(`-${name}.sql`))) continue
      const file = `db/sqlite/${String(migrations().length + 1).padStart(4, '0')}-${name}.sql`
      writeFileSync(file, `create table "${name}" ();\n`)
      process.stdout.write(`db generate: wrote ${file} for app-tables\n`)
    }
    process.exit(0)
  }
  case 'db migrate':
  case 'db reset --no-seed': {
    const applied = existsSync('.pikku/applied')
      ? readFileSync('.pikku/applied', 'utf8').split('\n').filter(Boolean)
      : []
    const missing = applied.find((file) => !existsSync(`db/sqlite/${file}`))
    if (args === 'db migrate' && missing) {
      process.stderr.write(
        `MigrationDriftError: [PKU-DB-DRIFT] db/sqlite/${missing}\n\nMigration content has changed since it was applied.\n  on disk:   file missing on disk\n`
      )
      process.exit(1)
    }
    writeFileSync('.pikku/applied', `${migrations().join('\n')}\n`)
    mkdirSync('.pikku/db', { recursive: true })
    writeFileSync('.pikku/db/schema.gen.ts', `// ${migrations().join(', ')}\n`)
    process.exit(0)
  }
  case 'all':
    if (tables.includes('tracked')) writeFileSync('README.md', 'rewritten\n')
    if (tables.includes('codegen-error')) {
      process.stderr.write(
        "[PKU682] Scenario 'x' is listed by no pikkuFeature\n"
      )
      process.exit(1)
    }
    writeFileSync('.pikku/all.gen.ts', '// all\n')
    process.exit(0)
  default:
    process.stderr.write(`unexpected: ${args}\n`)
    process.exit(2)
}
