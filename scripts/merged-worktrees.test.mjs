// The cases here are the real ones this script was written for, taken from a
// single afternoon's prune: a squash-merged branch whose commits are nowhere in
// main, a branch rebased after its merge so its head is not the PR's head, and
// a merged worktree still holding the only copy of someone's uncommitted work.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWorktrees, classifyWorktree } from './merged-worktrees.mjs'

const PORCELAIN = `worktree /repo
HEAD abc123
branch refs/heads/main

worktree /repo/wt-feature
HEAD def456
branch refs/heads/feat/thing

worktree /tmp/scratch
HEAD 789abc
detached
`

/** Probes that say "nothing is merged, every tree is clean", overridden per test. */
const probes = (overrides = {}) => ({
  isAncestor: () => false,
  mergedPullRequest: () => null,
  statusPorcelain: () => '',
  unpushedCommits: () => [],
  ...overrides,
})

const worktree = (branch = 'feat/thing') => ({
  path: '/repo/wt-feature',
  branch,
  isMain: false,
})

test('parses the worktree list, marking the first as the main checkout', () => {
  const parsed = parseWorktrees(PORCELAIN)

  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].isMain, true)
  assert.equal(parsed[0].branch, 'main')
  assert.equal(parsed[1].isMain, false)
  assert.equal(parsed[1].branch, 'feat/thing')
  assert.equal(parsed[1].path, '/repo/wt-feature')
  assert.equal(parsed[2].detached, true)
  assert.equal(parsed[2].branch, undefined)
})

test('a squash-merged branch is deletable though its commits are not in main', () => {
  // The whole reason this script exists: `git branch --merged` says no here.
  const verdict = classifyWorktree(
    worktree(),
    probes({
      mergedPullRequest: () => ({
        number: 1677,
        mergeCommit: { oid: '8be827a643893148ad3d32d18d42cd980eb6ff9c' },
        headRefOid: 'f9a1998fb',
      }),
      isAncestor: (commit) => commit.startsWith('8be827a6'),
    })
  )

  assert.equal(verdict.verdict, 'delete')
  assert.match(verdict.reason, /#1677 merged as 8be827a64/)
})

test('a merged PR whose merge commit never reached main is kept', () => {
  // A merge into some other base, or a main that has not been fetched.
  const verdict = classifyWorktree(
    worktree(),
    probes({
      mergedPullRequest: () => ({
        number: 42,
        mergeCommit: { oid: 'cafebabe' },
        headRefOid: 'deadbeef',
      }),
    })
  )

  assert.equal(verdict.verdict, 'keep')
  assert.match(
    verdict.reason,
    /#42 is merged but its merge commit is not in origin\/main/
  )
})

test('a branch already in main needs no PR to clear it', () => {
  const verdict = classifyWorktree(
    worktree(),
    probes({ isAncestor: (commit) => commit === 'feat/thing' })
  )

  assert.equal(verdict.verdict, 'delete')
  assert.match(verdict.reason, /already an ancestor/)
})

test('uncommitted work holds back a merged worktree', () => {
  const verdict = classifyWorktree(
    worktree(),
    probes({
      isAncestor: () => true,
      statusPorcelain: () => ' M packages/cli/src/services.ts\n?? scripts/',
    })
  )

  assert.equal(verdict.verdict, 'review')
  assert.match(verdict.reason, /2 uncommitted file\(s\)/)
  assert.equal(verdict.detail.length, 2)
})

test('commits on no remote ref hold back a merged worktree', () => {
  // A branch rebased after its PR merged: the content is in main, but these
  // commit objects exist only on this disk.
  const verdict = classifyWorktree(
    worktree(),
    probes({
      isAncestor: () => true,
      unpushedCommits: () => ['85a7a0ed0 fix: the three CI failures'],
    })
  )

  assert.equal(verdict.verdict, 'review')
  assert.match(verdict.reason, /1 local commit\(s\) are on no remote ref/)
})

test('the PR head counts as a remote ref when looking for unpushed work', () => {
  const seen = []
  classifyWorktree(
    worktree(),
    probes({
      isAncestor: () => true,
      mergedPullRequest: () => ({
        number: 7,
        mergeCommit: { oid: 'aaa' },
        headRefOid: 'bbb',
      }),
      unpushedCommits: (_path, refs) => {
        seen.push(...refs)
        return []
      },
    })
  )

  assert.deepEqual(seen, ['origin/feat/thing', 'bbb'])
})

test('the main checkout and a detached worktree are never candidates', () => {
  const all = probes({ isAncestor: () => true })

  assert.equal(
    classifyWorktree({ path: '/repo', branch: 'main', isMain: true }, all)
      .verdict,
    'skip'
  )
  assert.equal(
    classifyWorktree({ path: '/tmp/scratch', detached: true }, all).verdict,
    'skip'
  )
})
