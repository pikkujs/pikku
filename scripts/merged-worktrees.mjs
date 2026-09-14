#!/usr/bin/env node
// Reports which git worktrees hold branches whose work is already in `main`,
// and — with `--delete` — removes the ones it can prove are safe to remove.
//
// Why this is not `git worktree list` plus `git branch --merged`: every PR in
// this repo is squash-merged, so a merged branch's commits never become
// ancestors of main. `--merged` therefore reports a fully-merged branch as
// unmerged, and a branch rebased after its merge looks like it carries twenty
// commits of unique work. Both readings are wrong in the dangerous direction —
// the first leaves worktrees to pile up, the second is the one that tempts you
// to delete by eyeball instead.
//
// What does hold: a PR's *merge commit* being an ancestor of `origin/main`.
// That is a fact about main's history rather than the branch's, so a rebase, a
// force-push, or a squash cannot make it lie.
//
// Merged is only half the question. Worktrees here are shared between
// concurrent agents, and the thing worth protecting against is work that exists
// nowhere but this disk: uncommitted files, or commits that were never pushed.
// So a worktree is only ever deleted when all three hold — the work is in main,
// the tree is clean, and every local commit is reachable from a remote ref.
// Anything else is reported for a human to look at and left alone.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = new Set(process.argv.slice(2))
const doDelete = args.has('--delete')
const asJson = args.has('--json')
const pruneBranches = args.has('--prune-branches')

const git = (gitArgs, opts = {}) =>
  execFileSync('git', gitArgs, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()

/** `git` that answers a yes/no question, where a non-zero exit is the "no". */
const gitOk = (gitArgs, opts = {}) => {
  try {
    execFileSync('git', gitArgs, {
      cwd: opts.cwd ?? ROOT,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

/**
 * `git worktree list --porcelain` as records. The main worktree is first and is
 * never a candidate — deleting the checkout the script runs from is not a thing
 * anyone wants — and a detached HEAD has no branch whose merge state could be
 * looked up, so both are marked to be skipped rather than judged. A `locked`
 * worktree is someone else's live session, and the lock reason names it.
 */
export function parseWorktrees(out) {
  const records = []
  let current = {}
  for (const line of out.split('\n')) {
    if (line === '') {
      if (current.path) records.push(current)
      current = {}
      continue
    }
    const [key, ...rest] = line.split(' ')
    const value = rest.join(' ')
    if (key === 'worktree') current.path = value
    else if (key === 'HEAD') current.head = value
    else if (key === 'branch') current.branch = value.replace('refs/heads/', '')
    else if (key === 'detached') current.detached = true
    else if (key === 'bare') current.bare = true
    else if (key === 'locked') current.locked = value || 'no reason given'
  }
  if (current.path) records.push(current)
  return records.map((w, i) => ({ ...w, isMain: i === 0 }))
}

/**
 * The merged PR for a branch, if GitHub knows of one, with the merge commit
 * that landed it. `gh` failing — no network, not authenticated, no remote — is
 * not fatal: the branch simply has no PR evidence, and the ancestry check below
 * can still clear a branch that was merged without a squash.
 */
function mergedPullRequest(branch) {
  try {
    const out = execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--head',
        branch,
        '--state',
        'merged',
        '--limit',
        '10',
        '--json',
        'number,mergeCommit,headRefOid,mergedAt',
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const prs = JSON.parse(out)
    if (prs.length === 0) return null
    // Newest merge wins: a branch can be reused across several PRs, and it is
    // the most recent one that says whether today's head is accounted for.
    prs.sort((a, b) => (a.mergedAt < b.mergedAt ? 1 : -1))
    return prs[0]
  } catch {
    return null
  }
}

/** Commits on `head` that no remote ref accounts for — work that is on this disk only. */
function unpushedCommits(worktree, extraRefs) {
  const refs = ['origin/main', ...extraRefs].filter((ref) =>
    gitOk(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  )
  const out = git(
    ['log', '--oneline', 'HEAD', ...refs.map((ref) => `^${ref}`)],
    { cwd: worktree }
  )
  return out === '' ? [] : out.split('\n')
}

export function classifyWorktree(worktree, probes) {
  const { isAncestor, mergedPullRequest, statusPorcelain, unpushedCommits } =
    probes
  const { path, branch } = worktree

  if (worktree.isMain) return { verdict: 'skip', reason: 'the main checkout' }
  if (worktree.bare) return { verdict: 'skip', reason: 'a bare worktree' }
  if (!branch)
    return { verdict: 'skip', reason: 'detached HEAD — no branch to judge' }
  // A lock is another session saying it is working here. Whether the branch is
  // merged is beside the point: the answer is to leave it alone, and the only
  // override git offers is `remove -f -f`, which this script will not reach for.
  if (worktree.locked)
    return { verdict: 'skip', reason: `locked — ${worktree.locked}` }

  const pr = mergedPullRequest(branch)
  const mergeCommit = pr?.mergeCommit?.oid
  const mergedBySquash =
    mergeCommit !== undefined && isAncestor(mergeCommit, 'origin/main')
  // A branch merged without a squash, or one that only ever held commits main
  // now has, is in main by ancestry alone and needs no PR to prove it.
  const mergedByAncestry = isAncestor(branch, 'origin/main')

  if (!mergedBySquash && !mergedByAncestry)
    return {
      verdict: 'keep',
      reason: pr
        ? `#${pr.number} is merged but its merge commit is not in origin/main`
        : 'not in origin/main, and no merged PR claims it',
    }

  const evidence = mergedBySquash
    ? `#${pr.number} merged as ${mergeCommit.slice(0, 9)}`
    : 'already an ancestor of origin/main'

  const dirty = statusPorcelain(path)
  if (dirty !== '')
    return {
      verdict: 'review',
      reason: `${evidence}, but the tree has ${dirty.split('\n').length} uncommitted file(s)`,
      detail: dirty.split('\n'),
    }

  const unpushed = unpushedCommits(path, [
    `origin/${branch}`,
    ...(pr?.headRefOid ? [pr.headRefOid] : []),
  ])
  if (unpushed.length > 0)
    return {
      verdict: 'review',
      reason: `${evidence}, but ${unpushed.length} local commit(s) are on no remote ref`,
      detail: unpushed,
    }

  return { verdict: 'delete', reason: evidence }
}

function main() {
  // `--delete` acts on a report of the tree as it is right now, so refresh main
  // first: a stale `origin/main` is what makes a just-merged branch look unmerged.
  try {
    git(['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main'])
  } catch {
    console.warn(
      'warning: could not fetch origin/main — judging on the ref as it stands\n'
    )
  }

  const probes = {
    isAncestor: (commit, ancestorOf) =>
      gitOk(['merge-base', '--is-ancestor', commit, ancestorOf]),
    mergedPullRequest,
    statusPorcelain: (path) => git(['status', '--porcelain'], { cwd: path }),
    unpushedCommits,
  }

  const results = parseWorktrees(git(['worktree', 'list', '--porcelain'])).map(
    (worktree) => ({ ...worktree, ...classifyWorktree(worktree, probes) })
  )

  if (asJson) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  const GROUPS = [
    ['delete', 'Merged and safe to remove'],
    ['review', 'Merged, but holding work that is only on this disk'],
    ['keep', 'Not merged'],
    ['skip', 'Skipped'],
  ]

  for (const [verdict, heading] of GROUPS) {
    const group = results.filter((r) => r.verdict === verdict)
    if (group.length === 0) continue
    console.log(`\n${heading}:`)
    for (const r of group) {
      console.log(`  ${r.path}${r.branch ? `  [${r.branch}]` : ''}`)
      console.log(`      ${r.reason}`)
      for (const line of (r.detail ?? []).slice(0, 10))
        console.log(`      | ${line}`)
    }
  }

  const deletable = results.filter((r) => r.verdict === 'delete')

  if (!doDelete) {
    console.log(
      deletable.length === 0
        ? '\nNothing to remove.'
        : `\n${deletable.length} worktree(s) can be removed — re-run with --delete.`
    )
    return
  }

  let failed = 0
  for (const r of deletable) {
    // `remove` without --force, so git independently refuses a tree this script
    // read as clean a moment ago. A refusal is information, not a reason to stop
    // — the remaining worktrees are unaffected by whatever is true of this one.
    try {
      git(['worktree', 'remove', r.path])
    } catch (error) {
      failed += 1
      const detail = (error.stderr ?? '').toString().trim().split('\n')[0]
      console.log(`kept ${r.path} — git refused: ${detail || error.message}`)
      continue
    }
    console.log(`removed ${r.path}`)
    if (pruneBranches) {
      // -d, never -D: it refuses a branch git cannot see as merged, which is a
      // last guard behind the squash-merge reasoning above rather than a
      // duplicate of it.
      if (gitOk(['branch', '-d', r.branch]))
        console.log(`  deleted branch ${r.branch}`)
      else
        console.log(
          `  kept branch ${r.branch} — git will not delete it as merged`
        )
    }
  }
  git(['worktree', 'prune'])
  if (failed > 0)
    console.log(
      `\n${failed} worktree(s) were left in place — see the refusals above.`
    )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
