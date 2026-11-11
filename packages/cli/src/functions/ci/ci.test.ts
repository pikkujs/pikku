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
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ciEnv, ciStageCommand, CI_AUDIT_THRESHOLD } from './stages.js'
import { CiStage } from './schemas.js'
import { assertCloudflareDeployReady } from './deploy-guard.js'
import {
  assertConsoleRemoved,
  PikkuCiFailedError,
  removeConsoleScaffold,
} from './console-removal.js'
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
  deploy: false,
  runTests: true,
  hasDb: false,
  hasEmails: false,
  hasConsole: true,
  migrationsApplied: false,
  secretsSet: false,
  skipDeployChecks: false,
  stateDir: join(dir, 'state'),
  configFile: join(dir, 'pikku.config.json'),
  outDir: join(dir, '.pikku'),
  scaffoldDir: join(dir, 'src', 'scaffold'),
  consoleFiles: [],
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

describe('console removal', () => {
  const project = (scopes: string) => {
    write(
      join(dir, 'pikku.config.json'),
      JSON.stringify({ scaffold: { console: true, rpc: true } })
    )
    write(join(dir, 'src', 'scopes.ts'), scopes)
    write(join(dir, 'src', 'scaffold', 'console', 'console.gen.ts'), 'x')
    write(join(dir, 'src', 'scaffold', 'auth-secrets.gen.ts'), 'x')
  }

  test('turns the console off and removes only its scaffold', () => {
    project('export const roles = {}')
    removeConsoleScaffold(ciRun())
    const config = JSON.parse(
      readFileSync(join(dir, 'pikku.config.json'), 'utf-8')
    )
    assert.deepEqual(config.scaffold, { console: false, rpc: true })
    assert.equal(existsSync(join(dir, 'src', 'scaffold', 'console')), false)
    assert.ok(existsSync(join(dir, 'src', 'scaffold', 'auth-secrets.gen.ts')))
  })

  test('edits the config the run was given, wherever it lives', () => {
    project('export const roles = {}')
    const configFile = join(dir, 'config', 'pikku.json')
    write(configFile, JSON.stringify({ scaffold: { console: true } }))
    removeConsoleScaffold(ciRun({ configFile }))
    assert.deepEqual(JSON.parse(readFileSync(configFile, 'utf-8')).scaffold, {
      console: false,
    })
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir, 'pikku.config.json'), 'utf-8'))
        .scaffold,
      { console: true, rpc: true }
    )
  })

  test('refuses a pikku:console grant nothing declares, before changing anything', () => {
    project("export const roles = { admin: ['pikku:console'] }")
    assert.throws(() => removeConsoleScaffold(ciRun()), /declareScopes/)
    assert.ok(existsSync(join(dir, 'src', 'scaffold', 'console')))
  })

  test('accepts the grant once the app declares the scope', () => {
    project(
      "declareScopes(['pikku:console'])\nexport const roles = { admin: ['pikku:console'] }"
    )
    removeConsoleScaffold(ciRun())
  })

  test('removes and checks a console scaffold at a custom path, which declares nothing', () => {
    project("export const roles = { admin: ['pikku:console'] }")
    const consoleFile = join(dir, 'src', 'admin', 'console.gen.ts')
    write(
      consoleFile,
      "import '@pikku/addon-console'\ndeclareScopes(['pikku:console'])"
    )
    const run = ciRun({ consoleFiles: [consoleFile] })
    assert.throws(() => removeConsoleScaffold(run), /declareScopes/)
    assert.throws(
      () => assertConsoleRemoved(run),
      /src\/admin\/console\.gen\.ts/
    )

    write(join(dir, 'src', 'scopes.ts'), "declareScopes(['pikku:console'])")
    removeConsoleScaffold(run)
    assert.equal(existsSync(consoleFile), false)
    assertConsoleRemoved(run)
  })

  test('fails when console wiring is left behind', () => {
    write(join(dir, '.pikku', 'addons.gen.ts'), "import '@pikku/addon-console'")
    assert.throws(
      () => assertConsoleRemoved(ciRun()),
      /\.pikku\/addons\.gen\.ts/
    )
    rmSync(join(dir, '.pikku'), { recursive: true })
    assertConsoleRemoved(ciRun())
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
