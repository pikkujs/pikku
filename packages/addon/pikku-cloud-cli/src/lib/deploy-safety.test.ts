import { after, describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertDeploySafety,
  assertNamedBranchDeploySafety,
} from './deploy-safety.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

const run = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args],
    {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { PATH: process.env.PATH ?? '', HOME: tmpdir() },
    }
  ).trim()

const commit = async (cwd: string, file: string) => {
  await writeFile(join(cwd, file), file)
  run(cwd, 'add', file)
  run(cwd, 'commit', '-m', file)
}

const buildTemplate = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-deploy-safety-template-'))
  const remote = join(root, 'remote.git')
  const work = join(root, 'work')
  run(root, 'init', '--bare', '-b', 'main', remote)
  run(remote, 'config', 'maintenance.auto', 'false')
  run(root, 'clone', remote, work)
  run(work, 'remote', 'set-url', 'origin', '../remote.git')
  run(work, 'config', 'maintenance.auto', 'false')
  run(work, 'checkout', '-b', 'main')
  await commit(work, 'a.txt')
  run(work, 'push', '-u', 'origin', 'main')
  return root
}

// Built once and copied per test (#2108); the relative origin URL keeps each
// copy pointed at its own remote, and with auto-maintenance off no detached git
// is still writing the template while it is copied.
let template: Promise<string> | undefined
after(async () => {
  if (template) await rm(await template, { recursive: true, force: true })
})

/** A clone of a bare remote, with `main` pushed and tracking. */
const makeRepo = async () => {
  template ??= buildTemplate()
  const root = await mkdtemp(join(tmpdir(), 'pikku-deploy-safety-'))
  await cp(await template, root, { recursive: true })
  return { work: join(root, 'work') }
}

const refusal = (message: RegExp) => (error: unknown) => {
  assert.ok(error instanceof CloudPreconditionError)
  assert.match((error as Error).message, message)
  return true
}

describe('assertDeploySafety', () => {
  test('passes on a clean checkout level with its upstream', async () => {
    const { work } = await makeRepo()
    const result = await assertDeploySafety(work)
    assert.strictEqual(result.branch, 'main')
    assert.strictEqual(result.upstream, 'origin/main')
    assert.strictEqual(result.headSha, run(work, 'rev-parse', 'HEAD'))
    assert.strictEqual(result.remoteSha, result.headSha)
  })

  test('refuses uncommitted changes', async () => {
    const { work } = await makeRepo()
    await writeFile(join(work, 'a.txt'), 'edited')
    await assert.rejects(
      assertDeploySafety(work),
      refusal(/uncommitted changes/)
    )
  })

  test('refuses a branch with no upstream', async () => {
    const { work } = await makeRepo()
    run(work, 'checkout', '-b', 'lonely')
    await assert.rejects(assertDeploySafety(work), refusal(/no upstream/))
  })

  test('refuses a local HEAD that is ahead of the remote', async () => {
    const { work } = await makeRepo()
    await commit(work, 'b.txt')
    await assert.rejects(assertDeploySafety(work), refusal(/≠ remote/))
  })
})

describe('assertNamedBranchDeploySafety', () => {
  test('passes for a named branch level with its upstream', async () => {
    const { work } = await makeRepo()
    const result = await assertNamedBranchDeploySafety('main', work)
    assert.strictEqual(result.branch, 'main')
    assert.strictEqual(result.upstream, 'origin/main')
    assert.strictEqual(result.remoteSha, result.headSha)
  })

  test('judges the named branch, not the checked-out one', async () => {
    const { work } = await makeRepo()
    run(work, 'checkout', '-b', 'elsewhere')
    await commit(work, 'b.txt')
    const result = await assertNamedBranchDeploySafety('main', work)
    assert.strictEqual(result.branch, 'main')
  })

  test('refuses a branch that does not exist locally', async () => {
    const { work } = await makeRepo()
    await assert.rejects(
      assertNamedBranchDeploySafety('ghost', work),
      refusal(/local branch ghost does not exist/)
    )
  })

  test('refuses a named branch with no upstream', async () => {
    const { work } = await makeRepo()
    run(work, 'branch', 'lonely')
    await assert.rejects(
      assertNamedBranchDeploySafety('lonely', work),
      refusal(/branch lonely has no upstream/)
    )
  })

  test('refuses a named branch that is ahead of the remote', async () => {
    const { work } = await makeRepo()
    await commit(work, 'b.txt')
    await assert.rejects(
      assertNamedBranchDeploySafety('main', work),
      refusal(/main .* ≠ remote/)
    )
  })
})
