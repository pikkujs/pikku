import type { ListChangesOutput } from '../sdk/rpc-map.gen.d.js'
import { FabricPreconditionError } from './errors.js'
import { releaseChangeset } from './changes-local.js'
import {
  currentBranch,
  git,
  GitError,
  isAncestor,
  upstreamBranch,
} from '../../utils/git.js'

type Group = ListChangesOutput['groups'][number]

export interface Finished {
  group: Group
  branch: string
}

export type MergeOutcome =
  | {
      kind: 'merged'
      group: Group
      branch: string
      into: string
      commit: string
      removedWorktree: string | null
    }
  | {
      kind: 'conflict'
      group: Group
      branch: string
      into: string
      files: string[]
      worktree: string | null
    }

/**
 * A changeset is finished when every change in it is done on one branch that
 * is not yet in the checkout's branch.
 */
export async function finishedChangesets(
  list: ListChangesOutput
): Promise<Finished[]> {
  const finished: Finished[] = []
  for (const group of list.groups) {
    const changes = list.changes.filter((c) => c.groupId === group.groupId)
    if (!changes.length || changes.some((c) => c.status !== 'done')) continue
    const branches = [...new Set(changes.map((c) => c.branch))]
    const branch = branches[0]
    if (branches.length !== 1 || !branch) continue
    if (!(await branchExists(branch)) || (await isAncestor(branch, 'HEAD')))
      continue
    finished.push({ group, branch })
  }
  return finished
}

/**
 * Brings the checkout's branch up to its upstream before anything is merged
 * into it, so a changeset is merged against what is actually there.
 */
export async function syncWithUpstream(): Promise<string | null> {
  const upstream = await upstreamBranch()
  if (!upstream) return null
  await git(['fetch', '--quiet'])
  if (await isAncestor(upstream, 'HEAD')) return upstream
  if (await isAncestor('HEAD', upstream)) {
    await git(['merge', '--ff-only', '--quiet', upstream])
    return upstream
  }
  throw new FabricPreconditionError(
    `${await currentBranch()} and ${upstream} have both moved on. Reconcile them, then run pikku changes next again.`
  )
}

export async function mergeChangeset(
  { group, branch }: Finished,
  storePath: string | undefined
): Promise<MergeOutcome> {
  const into = await currentBranch()
  if (into === branch)
    throw new FabricPreconditionError(
      `This checkout is on ${branch} itself. Run merge from the branch it goes into.`
    )
  if (await isAncestor(branch, 'HEAD')) {
    if (storePath) await releaseChangeset(storePath, group.groupId)
    throw new FabricPreconditionError(
      `${branch} is already in ${into} — merged by plain git, so there is no Changeset commit for “${group.title}”. Leave it as it is; next time let \`changes merge\` do the merge.`
    )
  }
  const worktree = await worktreeOf(branch)
  try {
    await git([
      'merge',
      '--no-ff',
      branch,
      '-m',
      group.title,
      '-m',
      `Changeset: ${group.groupId}`,
    ])
  } catch (error) {
    if (!(error instanceof GitError)) throw error
    const files = (await git(['diff', '--name-only', '--diff-filter=U']))
      .split('\n')
      .filter(Boolean)
    if (!files.length) throw error
    await git(['merge', '--abort'])
    return { kind: 'conflict', group, branch, into, files, worktree }
  }
  if (storePath) await releaseChangeset(storePath, group.groupId)
  if (worktree) await git(['worktree', 'remove', worktree])
  return {
    kind: 'merged',
    group,
    branch,
    into,
    commit: await git(['rev-parse', 'HEAD']),
    removedWorktree: worktree,
  }
}

async function branchExists(branch: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    return true
  } catch {
    return false
  }
}

async function worktreeOf(branch: string): Promise<string | null> {
  return (
    (await git(['worktree', 'list', '--porcelain']))
      .split('\n\n')
      .find((entry) =>
        entry.split('\n').includes(`branch refs/heads/${branch}`)
      )
      ?.match(/^worktree (.+)$/m)?.[1] ?? null
  )
}
