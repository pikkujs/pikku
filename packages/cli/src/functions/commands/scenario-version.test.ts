import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveScenarioRunVersion } from './scenario-version.js'
import type { ScenarioRunSummary } from '@pikku/core/scenario'

/**
 * Git's own hooks export `GIT_DIR` and friends, so a suite run from a
 * `pre-push` inherits the repository it was pushed from and every command
 * below quietly addresses that instead of the fixture in `cwd`. The code under
 * test already drops them; the fixture has to as well, or these pass at a
 * prompt and fail in the hook.
 */
const gitEnv = () => {
  const env = { ...process.env }
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_PREFIX',
    'GIT_NAMESPACE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CEILING_DIRECTORIES',
  ]) {
    delete env[key]
  }
  return env
}

const execFileAsync = promisify(execFile)

/**
 * Spawned the way the code under test spawns git — asynchronously — rather
 * than through `execFileSync`. The synchronous call blocks the worker for as
 * long as git takes, and on a CI runner already running every other package's
 * suite beside it that was tens of seconds a call: the same three fixtures
 * timed out at 30s each while the two that ran after them finished in 18ms.
 * Nothing about git was wrong, only about holding the thread while waiting.
 *
 * `-c` rather than fixture config, and a closed stdin, because every way `git
 * commit` blocks is a way this suite hangs for its whole timeout and then
 * reports only SIGTERM: a `pre-commit` hook inherited through `core.hooksPath`,
 * a `gpg` that wants a passphrase, or a prompt reading the terminal it was
 * handed. `timeout` is the backstop — a fixture that cannot make a commit
 * should say so with git's own words, not run out the test's clock.
 */
const git = async (cwd: string, ...args: string[]) => {
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...gitEnv(),
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
        GIT_TERMINAL_PROMPT: '0',
      },
    }
  )
  return stdout.trim()
}

const repo = async (commits: boolean) => {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-version-'))
  await git(dir, 'init', '-q', '-b', 'main')
  if (commits) {
    writeFileSync(join(dir, 'a.txt'), 'one')
    await git(dir, 'add', 'a.txt')
    await git(dir, 'commit', '-qm', 'one')
  }
  return dir
}

const store = (runs: Partial<ScenarioRunSummary>[]) => ({
  list: async () => runs as ScenarioRunSummary[],
})

describe('resolveScenarioRunVersion', () => {
  test('counts the attempt among the runs of the same commit', async () => {
    const dir = await repo(true)
    const commit = await git(dir, 'rev-parse', 'HEAD')

    const version = await resolveScenarioRunVersion(
      store([
        { version: { commit, attempt: 1 } },
        { version: { commit: 'a'.repeat(40), attempt: 1 } },
        { version: { commit, attempt: 2 } },
      ]),
      dir
    )

    assert.deepEqual(version, { commit, attempt: 3 })
  })

  test('is the first attempt when nothing has run against the commit', async () => {
    const dir = await repo(true)
    const version = await resolveScenarioRunVersion(store([{}]), dir)
    assert.equal(version?.attempt, 1)
  })

  test('marks a tree with uncommitted changes dirty', async () => {
    const dir = await repo(true)
    writeFileSync(join(dir, 'a.txt'), 'two')

    const version = await resolveScenarioRunVersion(store([]), dir)
    assert.equal(version?.dirty, true)
  })

  test('has no version outside a repository, or before the first commit', async () => {
    assert.equal(
      await resolveScenarioRunVersion(
        store([]),
        mkdtempSync(join(tmpdir(), 'bare-'))
      ),
      undefined
    )
    assert.equal(
      await resolveScenarioRunVersion(store([]), await repo(false)),
      undefined
    )
  })

  test('keeps the commit when the history cannot be read', async () => {
    const dir = await repo(true)
    const version = await resolveScenarioRunVersion(
      {
        list: async () => {
          throw new Error('store is gone')
        },
      },
      dir
    )

    assert.equal(version?.commit, await git(dir, 'rev-parse', 'HEAD'))
    assert.equal(version?.attempt, 1)
  })
})
