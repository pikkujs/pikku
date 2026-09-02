import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  parseStandaloneCommand,
  resolveMigrationsDir,
  runDbCommand,
  runBackupCommand,
  runStandaloneCommand,
  MIGRATIONS_DIR_ENV,
  type StandaloneSqliteDb,
} from './cli.js'

const collector = () => {
  const lines: string[] = []
  return { lines, out: { write: (line: string) => lines.push(line) } }
}

const parse = (argv: string[], overrides: Record<string, unknown> = {}) => {
  const { lines, out } = collector()
  const command = parseStandaloneCommand(argv, {
    version: '1.2.3',
    hasDb: true,
    engine: 'sqlite',
    write: out.write,
    ...overrides,
  } as never)
  return { command, lines }
}

describe('parseStandaloneCommand', () => {
  it('no arguments means serve, so `node bundle.js` keeps its meaning', () => {
    assert.deepEqual(parse([]).command, { kind: 'serve' })
    assert.deepEqual(parse(['serve']).command, { kind: 'serve' })
  })

  it('version prints and stops before anything is opened', () => {
    const { command, lines } = parse(['version'])
    assert.deepEqual(command, { kind: 'exit', code: 0 })
    assert.deepEqual(lines, ['1.2.3'])
  })

  it('help lists the db commands only when there is a database', () => {
    assert.match(parse(['help']).lines.join('\n'), /db migrate/)
    assert.doesNotMatch(
      parse(['help'], { hasDb: false, engine: undefined }).lines.join('\n'),
      /db migrate/
    )
  })

  it('backup is offered on sqlite and refused on postgres', () => {
    assert.deepEqual(parse(['backup', '/tmp/x.db']).command, {
      kind: 'backup',
      destination: '/tmp/x.db',
    })

    const pg = parse(['backup', '/tmp/x.db'], { engine: 'postgres' })
    assert.deepEqual(pg.command, { kind: 'exit', code: 1 })
    assert.match(pg.lines.join('\n'), /pg_dump/)
  })

  it('a db command on a build with no database fails by saying so', () => {
    const { command, lines } = parse(['db', 'migrate'], {
      hasDb: false,
      engine: undefined,
    })
    assert.deepEqual(command, { kind: 'exit', code: 1 })
    assert.match(lines.join('\n'), /opens no database/)
  })

  it('an unknown db action names the ones that exist', () => {
    const { command, lines } = parse(['db', 'rollback'])
    assert.deepEqual(command, { kind: 'exit', code: 1 })
    assert.match(lines.join('\n'), /Expected migrate or status/)
  })

  it('an unknown command exits non-zero with the usage', () => {
    const { command, lines } = parse(['start'])
    assert.deepEqual(command, { kind: 'exit', code: 1 })
    assert.match(lines.join('\n'), /Unknown command: start/)
    assert.match(lines.join('\n'), /Usage:/)
  })
})

describe('resolveMigrationsDir', () => {
  it('defaults to the directory beside the bundle', () => {
    assert.equal(resolveMigrationsDir('/app/db/sqlite', {}), '/app/db/sqlite')
  })

  it('an operator who moved them wins', () => {
    assert.equal(
      resolveMigrationsDir('/app/db/sqlite', {
        [MIGRATIONS_DIR_ENV]: '/srv/migrations',
      }),
      '/srv/migrations'
    )
  })
})

const sqliteFixture = (
  migrations: Record<string, string>
): StandaloneSqliteDb => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-cli-'))
  const migrationsDir = join(root, 'db', 'sqlite')
  mkdirSync(migrationsDir, { recursive: true })
  for (const [name, sql] of Object.entries(migrations)) {
    writeFileSync(join(migrationsDir, name), sql)
  }
  return {
    engine: 'sqlite',
    migrationsDir,
    databaseFile: join(root, 'pikku.db'),
  }
}

describe('the sqlite db commands', () => {
  const migrations = {
    '0001_widgets.sql': 'CREATE TABLE widget (id TEXT PRIMARY KEY);',
    '0002_labels.sql': 'ALTER TABLE widget ADD COLUMN label TEXT;',
  }

  it('migrate applies every file, and a second run applies none', async () => {
    const db = sqliteFixture(migrations)

    const first = collector()
    await runDbCommand('migrate', db, first.out)
    assert.deepEqual(first.lines, [
      'applied  0001_widgets.sql',
      'applied  0002_labels.sql',
      'Applied 2 migration(s).',
    ])

    const second = collector()
    await runDbCommand('migrate', db, second.out)
    assert.deepEqual(second.lines, ['Already up to date (2 applied previously).'])
  })

  it('status separates what is applied from what is waiting', async () => {
    const db = sqliteFixture({ '0001_widgets.sql': migrations['0001_widgets.sql']! })

    await runDbCommand('migrate', db)
    writeFileSync(
      join(db.migrationsDir, '0002_labels.sql'),
      migrations['0002_labels.sql']!
    )

    const { lines, out } = collector()
    await runDbCommand('status', db, out)
    assert.match(lines[0]!, /^applied {2}0001_widgets\.sql {2}\S/)
    assert.equal(lines[1], 'pending  0002_labels.sql')
    assert.equal(lines[2], '1 applied, 1 pending.')
  })

  it('an edited migration is refused rather than silently re-run', async () => {
    const db = sqliteFixture(migrations)
    await runDbCommand('migrate', db)

    writeFileSync(
      join(db.migrationsDir, '0001_widgets.sql'),
      'CREATE TABLE widget (id TEXT PRIMARY KEY, tampered TEXT);'
    )

    await assert.rejects(
      () => runDbCommand('migrate', db),
      /PKU-DB-DRIFT/
    )
  })

  it('backup writes a database a fresh process can open', async () => {
    const db = sqliteFixture(migrations)
    await runDbCommand('migrate', db)

    const destination = join(db.migrationsDir, '..', '..', 'copy.db')
    const { lines, out } = collector()
    await runBackupCommand(destination, db, out)

    assert.ok(existsSync(destination))
    assert.match(lines.join('\n'), /Copied /)

    const copy = collector()
    await runDbCommand('status', { ...db, databaseFile: destination }, copy.out)
    assert.equal(copy.lines.at(-1), '2 applied, 0 pending.')
  })
})

describe('runStandaloneCommand', () => {
  it('hands serve back to the caller rather than doing anything', async () => {
    assert.equal(
      await runStandaloneCommand({ kind: 'serve' }, undefined),
      'serve'
    )
  })

  it('a completed command stops the caller from opening a port', async () => {
    const db = sqliteFixture({
      '0001_widgets.sql': 'CREATE TABLE widget (id TEXT PRIMARY KEY);',
    })
    const { out } = collector()
    assert.equal(
      await runStandaloneCommand({ kind: 'db', action: 'migrate' }, db, out),
      'done'
    )
  })

  it('backup on a postgres build is refused, not attempted', async () => {
    await assert.rejects(
      () =>
        runStandaloneCommand(
          { kind: 'backup', destination: '/tmp/x' },
          {
            engine: 'postgres',
            migrationsDir: '/tmp',
            sql: {} as never,
          }
        ),
      /only available on a SQLite build/
    )
  })
})
