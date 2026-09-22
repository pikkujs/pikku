import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

/**
 * `-c` rather than fixture config, and a closed stdin, because every way
 * `git commit` blocks is a way this suite hangs for its whole timeout and then
 * reports only SIGTERM: a `pre-commit` hook inherited through `core.hooksPath`,
 * a `gpg` that wants a passphrase, or a prompt reading the terminal it was
 * handed. `timeout` is the backstop — a fixture that cannot make a commit
 * should say so with git's own words, not run out the test's clock.
 */
const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
  ).trim()

const repo = (commits: boolean) => {
  const dir = mkdtempSync(join(tmpdir(), 'scenario-version-'))
  git(dir, 'init', '-q', '-b', 'main')
  if (commits) {
    writeFileSync(join(dir, 'a.txt'), 'one')
    git(dir, 'add', 'a.txt')
    git(dir, 'commit', '-qm', 'one')
  }
  return dir
}

const store = (runs: Partial<ScenarioRunSummary>[]) => ({
  list: async () => runs as ScenarioRunSummary[],
})

describe('resolveScenarioRunVersion', () => {
  test('counts the attempt among the runs of the same commit', async () => {
    const dir = repo(true)
    const commit = git(dir, 'rev-parse', 'HEAD')

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
    const dir = repo(true)
    const version = await resolveScenarioRunVersion(store([{}]), dir)
    assert.equal(version?.attempt, 1)
  })

  test('marks a tree with uncommitted changes dirty', async () => {
    const dir = repo(true)
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
      await resolveScenarioRunVersion(store([]), repo(false)),
      undefined
    )
  })

  test('keeps the commit when the history cannot be read', async () => {
    const dir = repo(true)
    const version = await resolveScenarioRunVersion(
      {
        list: async () => {
          throw new Error('store is gone')
        },
      },
      dir
    )

    assert.equal(version?.commit, git(dir, 'rev-parse', 'HEAD'))
    assert.equal(version?.attempt, 1)
  })
})
