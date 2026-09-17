import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveScenarioRunVersion } from './scenario-version.js'
import type { ScenarioRunSummary } from '@pikku/core/scenario'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim()

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
