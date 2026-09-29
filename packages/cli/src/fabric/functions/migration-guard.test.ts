import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffMigrationSets } from '../lib/migration-base.js'
import { runValidate } from './validate.function.js'
import { guardMigrationHistory } from './deploy.function.js'

describe('diffMigrationSets', () => {
  const base = new Map([
    ['0001-init.sql', 'create table a'],
    ['0002-b.sql', 'create table b'],
  ])

  test('additive files are fine', () => {
    const cur = new Map(base).set('0003-c.sql', 'create table c')
    assert.deepEqual(diffMigrationSets(base, cur), [])
  })

  test('modified, deleted and renamed are told apart', () => {
    const cur = new Map([
      ['0001-init.sql', 'create table a2'],
      ['0002-renamed.sql', 'create table b'],
    ])
    assert.deepEqual(diffMigrationSets(base, cur), [
      { kind: 'modified', file: '0001-init.sql' },
      { kind: 'renamed', file: '0002-b.sql', renamedTo: '0002-renamed.sql' },
    ])
    assert.deepEqual(
      diffMigrationSets(base, new Map([['0001-init.sql', 'create table a']])),
      [{ kind: 'deleted', file: '0002-b.sql' }]
    )
  })

  test('line endings do not count as an edit', () => {
    const cur = new Map(base).set('0001-init.sql', 'create table a\r\n')
    assert.deepEqual(diffMigrationSets(base, cur), [])
  })
})

const sh = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' })

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pikku-migguard-'))
  await writeFile(
    join(root, 'pikkufabric.config.json'),
    JSON.stringify({ projectId: 'proj-abc123' })
  )
  await writeFile(
    join(root, 'pikku.config.json'),
    JSON.stringify({ srcDirectories: ['packages/functions/src'] })
  )
  // migration checks only run inside a project that has a functions package
  await mkdir(join(root, 'packages', 'functions', 'src'), { recursive: true })
  await writeFile(join(root, 'packages/functions/src/.gitkeep'), '')
  await mkdir(join(root, 'db', 'sqlite'), { recursive: true })
  await writeFile(
    join(root, 'db/sqlite/0001-init.sql'),
    'CREATE TABLE a (id INTEGER);'
  )
  await writeFile(
    join(root, 'db/sqlite/0002-b.sql'),
    'CREATE TABLE b (id INTEGER);'
  )
  sh(root, 'init', '-q', '-b', 'main')
  sh(root, 'config', 'user.email', 't@t')
  sh(root, 'config', 'user.name', 't')
  sh(root, 'config', 'commit.gpgsign', 'false')
  sh(root, 'add', '.')
  sh(root, 'commit', '-q', '-m', 'base')
  sh(root, 'checkout', '-q', '-b', 'feature')
  return root
}

const guardIds = async (root: string, base?: string) =>
  (
    await runValidate(root, { skipTypecheck: true, migrationsBase: base })
  ).findings
    .filter((f) => f.id.startsWith('migration-modified-after-base'))
    .map((f) => f.id)

describe('migration-modified-after-base', () => {
  test('a new migration on the branch is clean', async () => {
    const root = await makeRepo()
    try {
      await writeFile(
        join(root, 'db/sqlite/0003-c.sql'),
        'CREATE TABLE c (id INTEGER);'
      )
      assert.deepEqual(await guardIds(root), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('edit, delete and rename of a base migration are errors', async () => {
    const root = await makeRepo()
    try {
      await writeFile(
        join(root, 'db/sqlite/0001-init.sql'),
        'CREATE TABLE a (id TEXT);'
      )
      await rename(
        join(root, 'db/sqlite/0002-b.sql'),
        join(root, 'db/sqlite/0002-renamed.sql')
      )
      const res = await runValidate(root, { skipTypecheck: true })
      const hits = res.findings.filter((f) =>
        f.id.startsWith('migration-modified-after-base')
      )
      assert.equal(hits.length, 2)
      assert.ok(hits.every((f) => f.severity === 'error'))
      assert.match(
        hits.map((h) => h.message).join('\n'),
        /0001-init.sql.*was modified/
      )
      assert.match(
        hits.map((h) => h.message).join('\n'),
        /renamed to 0002-renamed.sql/
      )

      await unlink(join(root, 'db/sqlite/0002-renamed.sql'))
      const ids = await guardIds(root)
      assert.ok(ids.includes('migration-modified-after-base-0002-b-sql'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a migration added to the base after the branch left is not "deleted"', async () => {
    const root = await makeRepo()
    try {
      sh(root, 'checkout', '-q', 'main')
      await writeFile(
        join(root, 'db/sqlite/0003-c.sql'),
        'CREATE TABLE c (id INTEGER);'
      )
      sh(root, 'add', '.')
      sh(root, 'commit', '-q', '-m', 'main moves on')
      sh(root, 'checkout', '-q', 'feature')
      assert.deepEqual(await guardIds(root, 'main'), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('--migrations-base and the env var choose the ref', async () => {
    const root = await makeRepo()
    try {
      await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
      assert.equal((await guardIds(root, 'main')).length, 1)
      process.env.PIKKU_MIGRATIONS_BASE = 'main'
      try {
        assert.equal((await guardIds(root)).length, 1)
      } finally {
        delete process.env.PIKKU_MIGRATIONS_BASE
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('skips cleanly: no base ref, and not a git repo', async () => {
    const root = await makeRepo()
    try {
      sh(root, 'branch', '-m', 'main', 'trunk')
      await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
      assert.deepEqual(await guardIds(root), [])
      const explicit = await runValidate(root, {
        skipTypecheck: true,
        migrationsBase: 'nope',
      })
      const info = explicit.findings.find(
        (f) => f.id === 'migration-base-unresolved'
      )
      assert.equal(info?.severity, 'info')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
    const plain = await mkdtemp(join(tmpdir(), 'pikku-migguard-plain-'))
    try {
      await mkdir(join(plain, 'db/sqlite'), { recursive: true })
      await writeFile(join(plain, 'db/sqlite/0001-init.sql'), 'x')
      assert.deepEqual(await guardIds(plain), [])
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  })
})

describe('deploy apply migration guard', () => {
  const inProject = async (root: string, fn: () => Promise<void>) => {
    const prev = process.cwd()
    process.chdir(root)
    try {
      await fn()
    } finally {
      process.chdir(prev)
    }
  }

  test('refuses and lists the findings; gap counts too', async () => {
    const root = await makeRepo()
    try {
      await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
      await writeFile(join(root, 'db/sqlite/0004-gap.sql'), 'SELECT 1;')
      await inProject(root, async () => {
        await assert.rejects(
          () => guardMigrationHistory({}),
          (err: Error) =>
            /Refusing to deploy: 2 migration-history problems/.test(
              err.message
            ) &&
            /migration-modified-after-base-0001-init-sql/.test(err.message) &&
            /migration-gap/.test(err.message) &&
            /--skip-migration-check/.test(err.message)
        )
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('passes on a clean history, and --skip-migration-check warns loudly', async () => {
    const root = await makeRepo()
    try {
      await inProject(root, async () => {
        await guardMigrationHistory({})
        await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
        const errs: string[] = []
        const orig = console.error
        console.error = (...a: unknown[]) => errs.push(a.join(' '))
        try {
          await guardMigrationHistory({ skipMigrationCheck: true })
        } finally {
          console.error = orig
        }
        assert.match(errs.join('\n'), /WITHOUT checking migration history/)
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
