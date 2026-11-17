import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ciEnv,
  ciStageCommand,
  CI_AUDIT_THRESHOLD,
  worktreeOwnsDatabase,
} from './stages.js'
import { resolveDb } from '../db/local-db.js'
import { worktreeOwnsConfiguredDatabase } from './ownership.js'
import { CiStage } from './schemas.js'
import { assertCloudflareDeployReady } from './deploy-guard.js'
import { PikkuCiFailedError } from './errors.js'
import {
  assertWorktreeReady,
  createWorktree,
  removeWorktree,
} from './worktree.js'
import type { CiRun } from './schemas.js'

let dir: string
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-ci-test-')))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const ciRun = (overrides: Partial<CiRun> = {}): CiRun => ({
  dir,
  inWorktree: true,
  allowDestructive: false,
  deploy: false,
  runTests: true,
  hasDb: false,
  hasEmails: false,
  migrationsApplied: false,
  secretsSet: false,
  skipDeployChecks: false,
  stateDir: join(dir, 'state'),
  configFile: join(dir, 'pikku.config.json'),
  outDir: join(dir, '.pikku'),
  scaffoldDir: join(dir, 'src', 'scaffold'),
  srcDirectories: [join(dir, 'src')],
  ...overrides,
})

const write = (file: string, content: string) => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

describe('ciStageCommand', () => {
  test('every pikku child reads the run config, and only pikku children', () => {
    const run = ciRun({ configFile: '/elsewhere/pikku.config.json' })
    for (const stage of CiStage.options) {
      const step = ciStageCommand(stage, run)
      assert.equal(
        step.args.includes('--config=/elsewhere/pikku.config.json'),
        !step.command,
        stage
      )
    }
  })

  test('db migrate is told it may only touch a local database', () => {
    const migrate = ciStageCommand('dbMigrate', ciRun())
    assert.deepEqual(migrate.args.slice(0, 3), ['db', 'migrate', '--localOnly'])
    assert.equal(migrate.dropDatabaseUrl, true)
  })

  test('destructive migrations are allowed only when the run says its database is disposable', () => {
    const refused = ciStageCommand(
      'dbMigrate',
      ciRun({ inWorktree: true, allowDestructive: false })
    )
    // A worktree alone proves nothing: it uses whatever loopback URL is committed.
    assert.ok(!refused.args.includes('--allowDestructive'))
    assert.ok(refused.args.includes('--localOnly'))
    const own = ciStageCommand('dbMigrate', ciRun({ inWorktree: false }))
    assert.ok(!own.args.includes('--allowDestructive'))
    const allowed = ciStageCommand(
      'dbMigrate',
      ciRun({ allowDestructive: true })
    )
    assert.ok(allowed.args.includes('--allowDestructive'))
    assert.ok(allowed.args.includes('--localOnly'))
  })

  describe('worktreeOwnsDatabase', () => {
    const resolved = (config: Record<string, string>, migrations?: string) => {
      if (migrations)
        mkdirSync(join(dir, 'db', migrations), { recursive: true })
      return resolveDb(config, dir, join(dir, '.pikku'))
    }

    test('a database file or embedded database inside the worktree is its own', () => {
      assert.equal(
        worktreeOwnsDatabase(resolved({ sqliteDb: 'dev.db' }), dir),
        true
      )
      assert.equal(
        worktreeOwnsDatabase(resolved({}, 'sqlite'), dir),
        true,
        'sqlite found from db/sqlite defaults into .pikku-runtime'
      )
      assert.equal(
        worktreeOwnsDatabase(resolved({}, 'postgres'), dir),
        true,
        'embedded PGlite lives in .pikku-runtime'
      )
    })

    test('a server, however local, a file outside the tree, or no database is not', () => {
      assert.equal(
        worktreeOwnsDatabase(
          resolved({ postgresUrl: 'postgres://localhost:5432/app' }),
          dir
        ),
        false
      )
      assert.equal(
        worktreeOwnsDatabase(
          resolved({ mysqlUrl: 'mysql://root@127.0.0.1/app' }),
          dir
        ),
        false
      )
      assert.equal(
        worktreeOwnsDatabase(
          resolved({ sqliteDb: '/var/lib/app/app.db' }),
          dir
        ),
        false
      )
      assert.equal(
        worktreeOwnsDatabase(resolved({ sqliteDb: '../shared.db' }), dir),
        false
      )
      assert.equal(worktreeOwnsDatabase(resolved({}), dir), false)
    })

    describe('links and paths that leave the tree', () => {
      let outside: string
      beforeEach(() => {
        outside = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-ci-outside-')))
        writeFileSync(join(outside, 'shared.db'), '')
      })
      afterEach(() => rmSync(outside, { recursive: true, force: true }))

      test('a committed symlink to a file outside the tree is not its own', () => {
        symlinkSync(join(outside, 'shared.db'), join(dir, 'dev.db'))
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: 'dev.db' }), dir),
          false
        )
      })

      test('a symlink to a file outside the tree that is not there yet is not its own', () => {
        symlinkSync(join(outside, 'not-yet.db'), join(dir, 'dev.db'))
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: 'dev.db' }), dir),
          false
        )
      })

      test('a file reached through a symlinked directory that leaves the tree is not its own', () => {
        symlinkSync(outside, join(dir, 'data'))
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: 'data/shared.db' }), dir),
          false
        )
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: 'data/new.db' }), dir),
          false,
          'a file that does not exist yet is judged by where its directory really is'
        )
      })

      test('a `..` that climbs out of the tree, written through a directory, is not its own', () => {
        mkdirSync(join(dir, 'a'), { recursive: true })
        assert.equal(
          worktreeOwnsDatabase(
            resolved({
              sqliteDb: `a/../../${outside.split('/').pop()}/shared.db`,
            }),
            dir
          ),
          false
        )
      })

      test('a symlink that stays inside the tree, and a worktree reached through a link, are its own', () => {
        mkdirSync(join(dir, 'real'), { recursive: true })
        symlinkSync(join(dir, 'real'), join(dir, 'alias'))
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: 'alias/dev.db' }), dir),
          true
        )
        const viaLink = join(outside, 'tree-link')
        symlinkSync(dir, viaLink)
        assert.equal(
          worktreeOwnsDatabase(
            resolveDb({ sqliteDb: 'dev.db' }, viaLink, join(viaLink, '.pikku')),
            dir
          ),
          true
        )
      })

      test('a relative database path is judged where it lands, not as written', () => {
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: './sub/../dev.db' }), dir),
          true
        )
        assert.equal(
          worktreeOwnsDatabase(resolved({ sqliteDb: 'sub/../../x.db' }), dir),
          false
        )
      })
    })
  })

  test('the audit gates at high and passes a baseline only when there is one', () => {
    assert.equal(CI_AUDIT_THRESHOLD, 'high')
    assert.deepEqual(ciStageCommand('audit', ciRun()).args.slice(0, -1), [
      'audit',
      '--failOn',
      'high',
    ])
    assert.deepEqual(
      ciStageCommand(
        'audit',
        ciRun({ auditBaseline: '/b/audit.json' })
      ).args.slice(0, -1),
      ['audit', '--failOn', 'high', '--baseline', '/b/audit.json']
    )
  })

  test('codegen fails on errors, installs are frozen, tests run the script', () => {
    assert.deepEqual(ciStageCommand('all', ciRun()).args.slice(0, -1), [
      'all',
      '--failOnError',
    ])
    assert.deepEqual(ciStageCommand('install', ciRun()), {
      command: 'bun',
      args: ['install', '--frozen-lockfile'],
    })
    assert.deepEqual(ciStageCommand('test', ciRun()), {
      command: 'bun',
      args: ['run', 'test'],
    })
  })

  test('apply deploys the planned output to the same provider', () => {
    const run = ciRun({ provider: 'cloudflare' })
    const plan = ciStageCommand('plan', run).args
    const apply = ciStageCommand('apply', run).args
    assert.deepEqual(plan.slice(0, 4), ['deploy', 'plan', '-p', 'cloudflare'])
    assert.deepEqual(apply.slice(0, 5), [
      'deploy',
      'apply',
      '-p',
      'cloudflare',
      '--fromPlan',
    ])
    assert.ok(plan.at(-2)!.startsWith(run.stateDir))
    assert.ok(apply.at(-2)!.startsWith(run.stateDir))
  })

  test('the child environment is non-interactive and loses DATABASE_URL when asked', () => {
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgres://prod.example.com/db'
    try {
      assert.equal(ciEnv({ args: [] }).CI, '1')
      assert.equal(
        ciEnv({ args: [] }).DATABASE_URL,
        'postgres://prod.example.com/db'
      )
      assert.equal(
        'DATABASE_URL' in ciEnv({ args: [], dropDatabaseUrl: true }),
        false
      )
    } finally {
      if (before === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = before
    }
  })
})

describe('assertCloudflareDeployReady', () => {
  const infra = (secrets: string[]) =>
    write(
      join(dir, 'infra.json'),
      JSON.stringify({ secrets: secrets.map((id) => ({ id })) })
    )

  test('passes with the secrets confirmed and no migrations', () => {
    infra(['API_KEY'])
    assertCloudflareDeployReady(dir, { secretsSet: true })
  })

  test('passes with no secrets to confirm', () => {
    infra([])
    assertCloudflareDeployReady(dir)
  })

  test('refuses unconfirmed secrets, naming every one, whatever the local env holds', () => {
    infra(['API_KEY', 'OTHER'])
    process.env.API_KEY = 'x'
    try {
      assert.throws(
        () => assertCloudflareDeployReady(dir),
        (error: Error) =>
          error instanceof PikkuCiFailedError &&
          /API_KEY, OTHER/.test(error.message) &&
          /--secretsSet/.test(error.message)
      )
    } finally {
      delete process.env.API_KEY
    }
  })

  test('treats shipped migrations as pending until confirmed', () => {
    infra([])
    write(
      join(dir, 'db', 'sqlite', '0001-init.sql'),
      'create table t (id int);'
    )
    assert.throws(
      () => assertCloudflareDeployReady(dir),
      /sqlite\/0001-init\.sql/
    )
    assertCloudflareDeployReady(dir, { migrationsApplied: true })
  })

  test('refuses when there is no infra.json to check', () => {
    assert.throws(() => assertCloudflareDeployReady(dir), /No infra\.json/)
  })
})

describe('worktree', () => {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf-8' })
  const repo = () => {
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'ci@example.invalid')
    git('config', 'user.name', 'ci')
    write(join(dir, '.gitignore'), '.deploy\n')
    write(join(dir, 'app', 'package.json'), '{}')
    git('add', '-A')
    git('commit', '-q', '-m', 'initial')
  }

  test('refuses a directory outside git', async () => {
    await assert.rejects(assertWorktreeReady(dir), /git repository/)
  })

  test('refuses uncommitted work and an unignored .deploy', async () => {
    repo()
    await assertWorktreeReady(dir)
    write(join(dir, 'stray.txt'), 'x')
    await assert.rejects(assertWorktreeReady(dir), /stray\.txt/)
    rmSync(join(dir, 'stray.txt'))
    write(join(dir, '.gitignore'), '')
    git('commit', '-qam', 'unignore')
    await assert.rejects(assertWorktreeReady(dir), /\.deploy is not gitignored/)
  })

  test('creates a detached worktree at the project prefix and removes it', async () => {
    repo()
    const parent = join(dir, '..', `${dir.split('/').at(-1)}-wt`)
    mkdirSync(parent)
    try {
      const worktree = await createWorktree(join(dir, 'app'), parent)
      assert.equal(worktree.project, join(worktree.path, 'app/'))
      assert.ok(existsSync(join(worktree.project, 'package.json')))
      assert.match(git('worktree', 'list'), /detached/)
      await removeWorktree(dir, worktree.path)
      assert.equal(existsSync(worktree.path), false)
      assert.doesNotMatch(git('worktree', 'list'), /detached/)
      assert.equal(git('status', '--porcelain'), '')
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('worktreeOwnsConfiguredDatabase', () => {
  const logger: any = { info() {}, warn() {}, error() {}, debug() {} }
  const project = (config: string) => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'config.ts'), config)
    return { rootDir: dir, srcDirectories: ['src'] } as any
  }
  const withEnv = async (
    env: Record<string, string | undefined>,
    fn: () => Promise<void>
  ) => {
    const before = {
      CI: process.env.CI,
      DATABASE_URL: process.env.DATABASE_URL,
    }
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    try {
      await fn()
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }

  test('a config that branches on CI is read as the child will see it (CI=1)', async () => {
    const config = project(
      `export const createConfig = async () =>
         process.env.CI ? { postgresUrl: 'postgres://127.0.0.1:5432/mine' } : { sqliteDb: 'dev.db' }\n`
    )
    await withEnv({ CI: undefined }, async () => {
      assert.equal(
        await worktreeOwnsConfiguredDatabase(
          config,
          logger,
          dir,
          join(dir, '.pikku')
        ),
        false,
        'the child runs with CI=1, which points at a server'
      )
    })
  })

  test('a config that branches on DATABASE_URL is read without it, as the child runs', async () => {
    const config = project(
      `export const createConfig = async () =>
         process.env.DATABASE_URL ? { postgresUrl: process.env.DATABASE_URL } : { sqliteDb: 'dev.db' }\n`
    )
    await withEnv(
      { DATABASE_URL: 'postgres://127.0.0.1:5432/mine', CI: undefined },
      async () => {
        assert.equal(
          await worktreeOwnsConfiguredDatabase(
            config,
            logger,
            dir,
            join(dir, '.pikku')
          ),
          true
        )
      }
    )
  })

  test('the environment of the parent is put back afterwards', async () => {
    const config = project(
      `export const createConfig = async () => ({ sqliteDb: 'dev.db' })\n`
    )
    await withEnv({ CI: undefined, DATABASE_URL: 'keep-me' }, async () => {
      await worktreeOwnsConfiguredDatabase(
        config,
        logger,
        dir,
        join(dir, '.pikku')
      )
      assert.equal(process.env.CI, undefined)
      assert.equal(process.env.DATABASE_URL, 'keep-me')
    })
  })

  test('a default that stood in for a config that would not load owns nothing', async () => {
    const config = project(`throw new Error('not installed yet')\n`)
    mkdirSync(join(dir, 'db', 'sqlite'), { recursive: true })
    assert.equal(
      await worktreeOwnsConfiguredDatabase(
        config,
        logger,
        dir,
        join(dir, '.pikku')
      ),
      false
    )
  })

  test('a config that cannot be loaded is not known to be disposable', async () => {
    const config = project(`throw new Error('boom')\n`)
    assert.equal(
      await worktreeOwnsConfiguredDatabase(
        config,
        logger,
        dir,
        join(dir, '.pikku')
      ),
      false
    )
  })
})
