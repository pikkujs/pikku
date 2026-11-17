import { existsSync } from 'node:fs'
import { lstat, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CloudPreconditionError, git } from '@pikku/cli/addon-support'

/**
 * Changeset worktrees are the disk cost of running changesets side by side:
 * each is a full checkout, and once built it carries its own node_modules,
 * build output and .pikku. So they are capped, and a merge takes the whole
 * directory and its branch with it.
 */
export const MAX_CHANGESET_WORKTREES = 3

export const maxChangesetWorktrees = (
  env: NodeJS.ProcessEnv = process.env
): number => {
  const n = Math.floor(Number(env.PIKKU_CHANGES_MAX_WORKTREES))
  return n > 0 ? n : MAX_CHANGESET_WORKTREES
}

export const changesetSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

/** The branch a new changeset with this title is built on. */
export const changesetBranch = (title: string): string =>
  `changeset/${changesetSlug(title)}`

export interface ChangesetWorktree {
  path: string
  branch: string
}

/** The live worktrees on a `changeset/*` branch, the main checkout aside. */
export async function changesetWorktrees(
  cwd?: string
): Promise<ChangesetWorktree[]> {
  return (await git(['worktree', 'list', '--porcelain'], cwd))
    .split('\n\n')
    .map((entry) => ({
      path: entry.match(/^worktree (.+)$/m)?.[1],
      branch: entry.match(/^branch refs\/heads\/(.+)$/m)?.[1],
    }))
    .filter(
      (w): w is ChangesetWorktree =>
        !!w.path && !!w.branch?.startsWith('changeset/')
    )
}

export const worktreeCapRefusal = (live: ChangesetWorktree[], max: number) =>
  `${live.length} changeset worktrees are live and the cap is ${max}: ${live.map((w) => w.branch).join(', ')}. Merge or release one of them first, or raise PIKKU_CHANGES_MAX_WORKTREES.`

/** Refuses before a claim is taken when no new worktree may be added. */
export async function assertWorktreeRoom(
  cwd?: string,
  max = maxChangesetWorktrees()
): Promise<void> {
  const live = await changesetWorktrees(cwd)
  if (live.length >= max)
    throw new CloudPreconditionError(worktreeCapRefusal(live, max))
}

/**
 * The checkout a changeset is built in: beside the repo, on
 * `changeset/<slug>`, cut from the branch it will be merged into.
 *
 * Picking a changeset up again (`reuse`, a claim naming its group) hands back
 * the worktree it was released with, or re-attaches its branch, so the work
 * committed and left in it is not lost. A new changeset whose branch already
 * exists is refused rather than given another changeset's checkout.
 */
export async function addChangesetWorktree(
  title: string,
  {
    reuse = false,
    cwd,
    branch: recorded,
  }: {
    reuse?: boolean
    cwd?: string
    /** The branch recorded on the group: used rather than a slug of the title. */
    branch?: string
  } = {},
  max = maxChangesetWorktrees()
): Promise<string> {
  const branch = recorded ?? changesetBranch(title)
  const slug = branch.replace(/^changeset\//, '')
  const live = await changesetWorktrees(cwd)
  const existing = live.find((w) => w.branch === branch)
  const exists = await branchExists(branch, cwd)
  if ((existing || exists) && !reuse)
    throw new CloudPreconditionError(
      `${branch} already exists${existing ? ` (worktree ${existing.path})` : ''}. Give this changeset another --title, or claim that changeset by its --group-id.`
    )
  if (existing) return existing.path
  if (live.length >= max)
    throw new CloudPreconditionError(worktreeCapRefusal(live, max))
  const top = (await git(['rev-parse', '--show-toplevel'], cwd)).trim()
  const main = dirname(
    (
      await git(
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        cwd
      )
    ).trim()
  )
  // Claimed from inside another changeset's worktree, it still goes beside the main checkout.
  const root = live.some((w) => w.path === top) ? main : top
  const path = join(dirname(root), `${basename(root)}-changesets`, slug)
  await git(
    exists
      ? ['worktree', 'add', path, branch]
      : ['worktree', 'add', path, '-b', branch],
    cwd
  )
  return path
}

export interface Reclaimed {
  /** Bytes the worktree directory held, ignored files included. */
  freedBytes: number
  branchDeleted: boolean
}

/**
 * After the merge: the worktree goes with everything in it — node_modules,
 * build output, .pikku, anything untracked — since what was committed is now
 * on the branch it merged into, then the merged branch.
 */
export async function removeChangesetWorktree(
  path: string,
  branch: string,
  cwd?: string
): Promise<Reclaimed> {
  const freedBytes = await diskUsage(path)
  try {
    await git(['worktree', 'remove', '--force', '--force', path], cwd)
  } catch {
    // A directory git no longer knows as a worktree is still disk.
    if (existsSync(path)) await rm(path, { recursive: true, force: true })
  }
  await git(['worktree', 'prune'], cwd)
  let branchDeleted = false
  try {
    await git(['branch', '-d', branch], cwd)
    branchDeleted = true
  } catch {
    // Not merged after all, or already gone: leave it for a person.
  }
  return { freedBytes, branchDeleted }
}

async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd)
    return true
  } catch {
    return false
  }
}

export async function diskUsage(path: string): Promise<number> {
  const info = await lstat(path).catch(() => null)
  if (!info) return 0
  if (!info.isDirectory()) return info.size
  let total = 0
  for (const entry of await readdir(path).catch(() => [])) {
    total += await diskUsage(join(path, entry))
  }
  return total
}

export const megabytes = (bytes: number): string =>
  `${(bytes / 1_048_576).toFixed(1)} MB`
