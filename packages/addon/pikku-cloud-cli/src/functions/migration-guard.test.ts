import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envWithoutInheritedRepo } from '@pikku/cli/addon-support'

type Ledger = {
  stageId: string
  branch: string
  migrations: { name: string; hash: string | null; appliedAt: string }[]
}[]

// The deploy guard reads ~/.pikkustudio/auth.json and the stage ledger, so HOME is
// disposable and the ledger is whatever the test sets. Test files that share a
// process (config.test.ts swaps process.env and deletes these variables) undo
// a one-time setup, so every test re-arms it.
const home = await mkdtemp(join(tmpdir(), 'pikku-migguard-home-'))
const API_URL = 'https://cloud.test'
const PROJECT_ID = '11111111-2222-3333-4444-555555555555'
const ENV_KEYS = [
  'HOME',
  'PIKKUSTUDIO_API_URL',
  'PIKKUSTUDIO_PROJECT_ID',
  'PIKKUSTUDIO_API_KEY',
] as const
const arranged = {
  HOME: home,
  PIKKUSTUDIO_API_URL: API_URL,
  PIKKUSTUDIO_PROJECT_ID: PROJECT_ID,
  PIKKUSTUDIO_API_KEY: 'token',
}
// Restored after every test (and after this file loads): left set, they make
// the next test file in the same process look logged in and linked.
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}
const arrangeEnv = () => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  Object.assign(process.env, arranged)
}
const restoreEnv = () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
}
arrangeEnv()
let ledger: Ledger | Error = []
const invoked: string[] = []
await mock.module('../lib/http.js', () => ({
  getCloudRPC: () => ({
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
restoreEnv()
beforeEach(async () => {
  arrangeEnv()
  await writeAuthFile({ tokens: { [API_URL]: 'token' } })
})
afterEach(restoreEnv)
const { runProjectChecks: runValidate } =
  await import('@pikku/cli/addon-support/validate')
const { hashMigration, projectChecks } =
  await import('../lib/project-checks.js')
const { guardMigrationHistory, applyDeploy } =
  await import('./deploy.function.js')

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
      ledger = new Error('cloud API unreachable')
      assert.match(
        await refusal(root, 'feature'),
        /migration-drift-unchecked.*cloud API unreachable/
      )
      const findings = await projectChecks({
        root,
        migrationsDir: join(root, 'db/sqlite'),
      })
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
