import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffMigrationSets } from '../lib/migration-base.js'
import { envWithoutInheritedRepo } from '../../utils/git.js'

type Ledger = {
  stageId: string
  branch: string
  migrations: { name: string; hash: string | null; appliedAt: string }[]
}[]

// The deploy guard reads ~/.fabric/auth.json and the stage ledger, so HOME is
// disposable and the ledger is whatever the test sets.
process.env.HOME = await mkdtemp(join(tmpdir(), 'pikku-migguard-home-'))
const API_URL = 'http://fabric.test'
process.env.FABRIC_API_URL = API_URL
process.env.FABRIC_PROJECT_ID = '11111111-2222-3333-4444-555555555555'
let ledger: Ledger | Error = []
const invoked: string[] = []
mock.module('../lib/http.js', () => ({
  getFabricRPC: () => ({
    invoke: async (name: string) => {
      invoked.push(name)
      if (name === 'deployByStageKind') throw new Error('reached-deploy')
      if (name !== 'listStageMigrationLedger')
        throw new Error(`unexpected ${name}`)
      if (ledger instanceof Error) throw ledger
      return { stages: ledger }
    },
  }),
}))
const { writeAuthFile } = await import('../lib/config.js')
await writeAuthFile({ tokens: { [API_URL]: 'token' } })
const { runValidate, hashMigration } = await import('./validate.function.js')
const { guardMigrationHistory, applyDeploy } =
  await import('./deploy.function.js')

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

  test('a rename that also edits the file is a rename, not a deletion', () => {
    const cur = new Map([
      ['0001-init.sql', 'create table a'],
      ['0002-z.sql', 'create table b2'],
    ])
    assert.deepEqual(diffMigrationSets(base, cur), [
      { kind: 'renamed', file: '0002-b.sql', renamedTo: '0002-z.sql' },
    ])
  })

  test('an unrelated new file with another number does not hide a deletion', () => {
    const cur = new Map([
      ['0001-init.sql', 'create table a'],
      ['0003-c.sql', 'create table c'],
    ])
    assert.deepEqual(diffMigrationSets(base, cur), [
      { kind: 'deleted', file: '0002-b.sql' },
    ])
  })

  test('line endings do not count as an edit', () => {
    const cur = new Map(base).set('0001-init.sql', 'create table a\r\n')
    assert.deepEqual(diffMigrationSets(base, cur), [])
  })
})

const sh = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: envWithoutInheritedRepo(),
  })

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pikku-migguard-'))
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

describe('where the base comes from', () => {
  test('a repository whose default branch is master is still guarded', async () => {
    const root = await makeRepo()
    try {
      sh(root, 'branch', '-m', 'main', 'master')
      await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
      assert.deepEqual(await guardIds(root), [
        'migration-modified-after-base-0001-init-sql',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('origin/main wins over a local main that has fallen behind', async () => {
    const root = await makeRepo()
    try {
      await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
      sh(root, 'commit', '-qam', 'edit on the branch')
      sh(root, 'checkout', '-q', 'main')
      sh(root, 'merge', '-q', '--ff-only', 'feature')
      sh(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD~1')
      sh(root, 'checkout', '-q', 'feature')
      assert.equal((await guardIds(root)).length, 1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a project below the repository root is compared too', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-migguard-sub-'))
    try {
      const app = join(root, 'apps', 'x')
      await mkdir(join(app, 'packages/functions/src'), { recursive: true })
      await mkdir(join(app, 'db/sqlite'), { recursive: true })
      await writeFile(
        join(app, 'pikku.config.json'),
        JSON.stringify({ srcDirectories: ['packages/functions/src'] })
      )
      await writeFile(join(app, 'packages/functions/src/.gitkeep'), '')
      await writeFile(join(app, 'db/sqlite/0001-init.sql'), 'CREATE TABLE a;')
      sh(root, 'init', '-q', '-b', 'main')
      sh(root, 'config', 'user.email', 't@t')
      sh(root, 'config', 'user.name', 't')
      sh(root, 'config', 'commit.gpgsign', 'false')
      sh(root, 'add', '.')
      sh(root, 'commit', '-q', '-m', 'base')
      sh(root, 'checkout', '-q', '-b', 'feature')
      await writeFile(join(app, 'db/sqlite/0001-init.sql'), 'edited')
      assert.equal((await guardIds(app)).length, 1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a base with no common history is skipped, not read as a deletion', async () => {
    const root = await makeRepo()
    try {
      sh(root, 'checkout', '-q', 'main')
      await writeFile(join(root, 'db/sqlite/0003-c.sql'), 'CREATE TABLE c;')
      sh(root, 'add', '.')
      sh(root, 'commit', '-q', '-m', 'main moves on')
      sh(root, 'checkout', '-q', '--orphan', 'shallow')
      const res = await runValidate(root, {
        skipTypecheck: true,
        migrationsBase: 'main',
      })
      assert.deepEqual(
        res.findings
          .filter((f) => f.id.startsWith('migration-modified-after-base'))
          .map((f) => f.id),
        []
      )
      const note = res.findings.find(
        (f) => f.id === 'migration-base-unresolved'
      )
      assert.equal(note?.severity, 'info')
      assert.match(note?.message ?? '', /shares no history/)
    } finally {
      await rm(root, { recursive: true, force: true })
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
  const applied = (branch: string, name: string, sql: string): Ledger[0] => ({
    stageId: `stage-${branch}`,
    branch,
    migrations: [
      { name, hash: hashMigration(sql), appliedAt: '2026-09-01T00:00:00Z' },
    ],
  })
  const refusal = async (root: string, target: string) => {
    let message = ''
    await inProject(root, async () => {
      await assert.rejects(
        () => guardMigrationHistory({}, target),
        (err: Error) => {
          message = err.message
          return /Refusing to deploy/.test(err.message)
        }
      )
    })
    return message
  }
  const withRepo = async (fn: (root: string) => Promise<void>) => {
    const root = await makeRepo()
    try {
      await fn(root)
    } finally {
      ledger = []
      await rm(root, { recursive: true, force: true })
    }
  }

  test('refuses and lists the findings; gap counts too', () =>
    withRepo(async (root) => {
      await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
      await writeFile(join(root, 'db/sqlite/0004-gap.sql'), 'SELECT 1;')
      const message = await refusal(root, 'feature')
      assert.match(message, /2 migration-history problems/)
      assert.match(message, /migration-modified-after-base-0001-init-sql/)
      assert.match(message, /migration-gap/)
      assert.doesNotMatch(message, /--skip-migration-check|override/)
    }))

  test('passes on a clean history', () =>
    withRepo(async (root) => {
      await inProject(root, () => guardMigrationHistory({}, 'feature'))
    }))

  test('a branch-only migration its own stage applied cannot be edited', () =>
    withRepo(async (root) => {
      ledger = [
        applied('feature', '0003-c.sql', 'CREATE TABLE c (id INTEGER);'),
      ]
      await writeFile(
        join(root, 'db/sqlite/0003-c.sql'),
        'CREATE TABLE c (id TEXT);'
      )
      assert.match(
        await refusal(root, 'feature'),
        /migration-drift-feature-0003-c-sql/
      )
    }))

  test('production is checked whichever stage is deployed', () =>
    withRepo(async (root) => {
      ledger = [applied('main', '0003-c.sql', 'CREATE TABLE c (id INTEGER);')]
      await writeFile(
        join(root, 'db/sqlite/0003-c.sql'),
        'CREATE TABLE c (id TEXT);'
      )
      assert.match(
        await refusal(root, 'feature'),
        /migration-drift-main-0003-c-sql/
      )
    }))

  test("another branch's stage does not block this deploy", () =>
    withRepo(async (root) => {
      ledger = [applied('other', '0003-c.sql', 'CREATE TABLE c (id INTEGER);')]
      await writeFile(
        join(root, 'db/sqlite/0003-c.sql'),
        'CREATE TABLE c (id TEXT);'
      )
      await inProject(root, () => guardMigrationHistory({}, 'feature'))
    }))

  test('a ledger that cannot be read refuses, where validate only notes it', () =>
    withRepo(async (root) => {
      ledger = new Error('fabric-api unreachable')
      assert.match(
        await refusal(root, 'feature'),
        /migration-drift-unchecked.*fabric-api unreachable/
      )
      const { findings } = await runValidate(root, { skipTypecheck: true })
      assert.equal(
        findings.find((f) => f.id === 'migration-drift-unchecked')?.severity,
        'info'
      )
    }))

  test('a base that does not resolve refuses, where validate stays quiet', () =>
    withRepo(async (root) => {
      sh(root, 'branch', '-m', 'main', 'trunk')
      assert.match(
        await refusal(root, 'feature'),
        /migration-base-unresolved.*origin\/main or main/
      )
      assert.deepEqual(await guardIds(root), [])
    }))

  test('outside a git repository the deploy refuses', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'pikku-migguard-plain-'))
    try {
      await writeFile(
        join(plain, 'pikku.config.json'),
        JSON.stringify({ srcDirectories: ['packages/functions/src'] })
      )
      await mkdir(join(plain, 'packages/functions/src'), { recursive: true })
      await mkdir(join(plain, 'db/sqlite'), { recursive: true })
      await writeFile(join(plain, 'db/sqlite/0001-init.sql'), 'x')
      assert.match(await refusal(plain, 'feature'), /migration-base-unresolved/)
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  })

  test('a base with no common history refuses the deploy', () =>
    withRepo(async (root) => {
      sh(root, 'checkout', '-q', '--orphan', 'shallow')
      assert.match(
        await refusal(root, 'shallow'),
        /migration-base-unresolved.*shares no history/
      )
    }))

  test('deploy apply runs the guard before it creates a deployment', () =>
    withRepo(async (root) => {
      const remote = await mkdtemp(join(tmpdir(), 'pikku-migguard-remote-'))
      try {
        sh(remote, 'init', '-q', '--bare')
        sh(root, 'remote', 'add', 'origin', remote)
        sh(root, 'push', '-q', '-u', 'origin', 'main', 'feature')
        await writeFile(join(root, 'db/sqlite/0001-init.sql'), 'edited')
        sh(root, 'commit', '-qam', 'edit an applied migration')
        sh(root, 'push', '-q', 'origin', 'feature')
        invoked.length = 0
        await inProject(root, async () => {
          await assert.rejects(
            () => applyDeploy({ autoApprove: true }, {}),
            /Refusing to deploy.*migration-modified-after-base/s
          )
        })
        assert.ok(!invoked.includes('deployByStageKind'))

        sh(root, 'checkout', '-q', 'HEAD~1', '--', 'db/sqlite/0001-init.sql')
        sh(root, 'commit', '-qm', 'restore it')
        sh(root, 'push', '-q', 'origin', 'feature')
        invoked.length = 0
        await inProject(root, async () => {
          await assert.rejects(
            () => applyDeploy({ autoApprove: true }, {}),
            /reached-deploy/
          )
        })
        assert.ok(invoked.includes('deployByStageKind'))
      } finally {
        await rm(remote, { recursive: true, force: true })
      }
    }))
})
