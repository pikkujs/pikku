import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commit,
  createFixture,
  git,
  PIKKU,
  removeFixture,
  type Fixture,
} from './fixture.js'

type Run = { code: number | null; output: string }

const ci = (f: Fixture, ...args: string[]): Promise<Run> =>
  new Promise((resolve) => {
    const child = spawn(
      'node',
      [
        PIKKU,
        'ci',
        '--skipDeployChecks',
        '--worktreeDir',
        f.worktrees,
        ...args,
      ],
      { cwd: f.repo, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('close', (code) => resolve({ code, output }))
  })

const expectPassed = (run: Run) => {
  assert.equal(run.code, 0, run.output.slice(-4000))
  assert.match(run.output, /pikku ci passed/)
  assert.doesNotMatch(run.output, /Unknown option/)
}

const expectFailed = (run: Run, reason: RegExp) => {
  assert.notEqual(run.code, 0, run.output.slice(-4000))
  assert.match(run.output, reason)
}

const expectClean = async (f: Fixture, status = '') => {
  assert.equal(await git(f.repo, 'status', '--porcelain'), status)
  const worktrees = await git(f.repo, 'worktree', 'list', '--porcelain')
  assert.equal(worktrees.match(/^worktree /gm)?.length, 1, worktrees)
  assert.deepEqual(readdirSync(f.worktrees), [])
}

const setTestScript = async (f: Fixture, script: string | undefined) => {
  const file = join(f.repo, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  pkg.scripts = script === undefined ? {} : { test: script }
  writeFileSync(file, JSON.stringify(pkg, null, 2))
  await commit(f.repo, `test script: ${script}`)
}

describe('pikku ci', () => {
  let f: Fixture
  before(async () => {
    f = await createFixture()
  })
  after(() => removeFixture(f))

  test('runs in place and runs the tests', async () => {
    expectPassed(await ci(f))
    assert.ok(existsSync(join(f.repo, 'test-ran.marker')))
    await expectClean(f)
  })

  test('--deploy without -p is refused before anything runs', async () => {
    expectFailed(await ci(f, '--deploy'), /--deploy needs -p/)
    await expectClean(f)
  })

  test('-p refuses a dirty tree', async () => {
    writeFileSync(join(f.repo, 'untracked.txt'), 'x')
    expectFailed(
      await ci(f, '-p', 'standalone'),
      /builds the commit, not your working tree/
    )
    await expectClean(f, '?? untracked.txt\n')
    await git(f.repo, 'clean', '-fq', 'untracked.txt')
  })

  test('-p standalone plans in a worktree and copies the output back', async () => {
    expectPassed(await ci(f, '-p', 'standalone'))
    const deploy = join(f.repo, '.deploy')
    assert.ok(existsSync(join(deploy, 'audit.json')))
    assert.ok(
      existsSync(join(deploy, 'standalone', 'deployment-manifest.json'))
    )
    assert.ok(
      existsSync(
        join(deploy, 'standalone', 'db', 'sqlite', '0001-better-auth.sql')
      )
    )
    await expectClean(f)
  })

  test('--deploy applies the plan, and --keepWorktree keeps it', async () => {
    const run = await ci(f, '-p', 'standalone', '--deploy', '--keepWorktree')
    expectPassed(run)
    assert.match(run.output, /Deployment complete/)
    const [kept] = readdirSync(f.worktrees)
    assert.ok(kept, 'the worktree was kept')
    const worktree = join(f.worktrees, kept)
    const config = JSON.parse(
      readFileSync(join(worktree, 'pikku.config.json'), 'utf8')
    )
    assert.equal(config.scaffold.console, false)
    assert.ok(
      !existsSync(join(worktree, 'packages/functions/src/scaffold/console'))
    )
    assert.ok(
      existsSync(join(worktree, 'packages/functions/src/scaffold/auth')),
      'only the console scaffold is removed'
    )
    assert.equal(await git(f.repo, 'status', '--porcelain'), '')
    await git(f.repo, 'worktree', 'remove', '--force', worktree)
    await expectClean(f)
  })

  test('a failed step stops the run, exits non-zero and cleans up', async () => {
    await setTestScript(f, 'exit 3')
    const run = await ci(f, '-p', 'standalone')
    expectFailed(run, /pikku ci failed at test/)
    assert.doesNotMatch(run.output, /\[plan\]/)
    await expectClean(f)
  })

  test('a project with no test script fails unless --skipTests', async () => {
    await setTestScript(f, undefined)
    expectFailed(await ci(f), /no "test" script/)
    const run = await ci(f, '--skipTests', '--json')
    assert.equal(run.code, 0, run.output.slice(-4000))
    const events = run.output
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line))
      .filter((line) => line.message?.startsWith('workflow.'))
    const steps = (event: string) =>
      events
        .filter((line) => line.message === event)
        .map((line) => line.data.stepName)
    assert.ok(steps('workflow.step.succeeded').includes('Validate'))
    assert.ok(!steps('workflow.step.running').includes('Test'))
    assert.ok(
      events.some(
        (line) =>
          line.message === 'workflow.run.status' &&
          line.data.status === 'completed'
      ),
      'the run reports its outcome'
    )
    await expectClean(f)
  })
})
