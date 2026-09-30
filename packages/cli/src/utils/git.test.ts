import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isGitRepo, isTracked } from './git.js'

const makeTmp = () => mkdtemp(join(tmpdir(), 'pikku-git-probe-'))

/**
 * `git push` from a worktree exports GIT_DIR to every hook, and a hook's
 * children inherit it. GIT_DIR outranks the process's directory, so a probe
 * given an unrelated `cwd` answers about the hook's repository instead — the
 * probes report a repo that is not the one being asked about, and
 * `fabric validate` run from a pre-push hook fails on files it never looked at.
 */
describe('git probes ignore an inherited GIT_DIR', () => {
  const realGitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    encoding: 'utf8',
  }).trim()

  const withGitDir = async (fn: () => Promise<void>) => {
    const previous = process.env.GIT_DIR
    process.env.GIT_DIR = realGitDir
    try {
      await fn()
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR
      else process.env.GIT_DIR = previous
    }
  }

  test('a directory outside any repository is not a repository', async () => {
    const tmp = await makeTmp()
    await withGitDir(async () => {
      assert.strictEqual(await isGitRepo(tmp), false)
    })
  })

  test('nothing is tracked in a directory outside any repository', async () => {
    const tmp = await makeTmp()
    await withGitDir(async () => {
      assert.strictEqual(await isTracked('package.json', tmp), false)
    })
  })

  test('a real repository is still detected', async () => {
    assert.strictEqual(await isGitRepo(process.cwd()), true)
    assert.strictEqual(await isTracked('package.json', process.cwd()), true)
  })
})
