import { spawn } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { access, readFile, realpath, rm } from 'node:fs/promises'
import { basename, delimiter, dirname, isAbsolute, join } from 'node:path'
import type { ListChangesOutput } from './types.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { releaseChangeset } from './changes-local.js'
import { removeChangesetWorktree } from './changeset-worktree.js'
import { COMPARE_OUTPUT_PATH } from './check-gate.js'
import {
  currentBranch,
  git,
  GitError,
  isAncestor,
  upstreamBranch,
} from '@pikku/cli/addon-support'

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
      /** Bytes the removed worktree held, ignored files included. */
      freedBytes: number
      branchDeleted: boolean
      /** Why the worktree could not be removed, when it could not. */
      cleanupError?: string
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
    // the branch recorded on the group at `claim --worktree` wins over what
    // each done recorded (a done run from the wrong checkout records that one)
    const recorded = (group as { branch?: string }).branch
    const branches = recorded
      ? [recorded]
      : [...new Set(changes.map((c) => c.branch))]
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
  throw new CloudPreconditionError(
    `${await currentBranch()} and ${upstream} have both moved on. Reconcile them, then run pikku changes next again.`
  )
}

/**
 * Merges a finished changeset into the checkout's branch. `bun` is the absolute path of the bun
 * that regenerates a lockfile both sides changed; without one such a conflict stays a conflict.
 */
export async function mergeChangeset(
  { group, branch }: Finished,
  { storePath, bun }: { storePath?: string; bun?: string }
): Promise<MergeOutcome> {
  const into = await currentBranch()
  if (into === branch)
    throw new CloudPreconditionError(
      `This checkout is on ${branch} itself. Run merge from the branch it goes into.`
    )
  if (await isAncestor(branch, 'HEAD')) {
    if (storePath) await releaseChangeset(storePath, group.groupId)
    throw new CloudPreconditionError(
      `${branch} is already in ${into} — merged by plain git, so there is no Changeset commit for “${group.title}”. Leave it as it is; next time let \`changes merge\` do the merge.`
    )
  }
  const worktree = await worktreeOf(branch)
  await clearScratchCollisions(branch)
  const merge = () =>
    git([
      'merge',
      '--no-ff',
      branch,
      '-m',
      group.title,
      '-m',
      `Changeset: ${group.groupId}`,
    ])
  try {
    try {
      await merge()
    } catch (error) {
      // untracked copies of exactly what the branch adds (intake's capture,
      // committed by the capture change) go, and the merge runs again
      if (!(error instanceof GitError)) throw error
      const blocking = untrackedInTheWay(error.stderr)
      if (!blocking.length || !(await sameAsBranch(blocking, branch)))
        throw error
      const top = (await git(['rev-parse', '--show-toplevel'])).trim()
      for (const file of blocking) await rm(join(top, file), { force: true })
      await merge()
    }
  } catch (error) {
    if (!(error instanceof GitError)) throw error
    const files = (await git(['diff', '--name-only', '--diff-filter=U']))
      .split('\n')
      .filter(Boolean)
    if (!files.length) {
      const blocking = untrackedInTheWay(error.stderr)
      if (blocking.length)
        throw new CloudPreconditionError(
          `${branch} cannot be merged into ${into}: it adds files this checkout already holds untracked, and not all of them are the same as the branch's (${blocking.join(', ')}). Move or delete them here, then run pikku changes next again.`
        )
      throw error
    }
    if (!bun || !lockfilesOnly(files)) {
      await git(['merge', '--abort'])
      return { kind: 'conflict', group, branch, into, files, worktree }
    }
    await healLockfiles(files, branch, bun)
  }
  if (storePath) await releaseChangeset(storePath, group.groupId)
  const commit = await git(['rev-parse', 'HEAD'])
  // A changeset built in its own worktree leaves nothing behind once merged:
  // the directory with its ignored files, and the branch. One built in the
  // main checkout keeps its branch, as it always has.
  let reclaimed = { freedBytes: 0, branchDeleted: false }
  let cleanupError: string | undefined
  if (worktree) {
    try {
      reclaimed = await removeChangesetWorktree(worktree, branch)
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error)
    }
  }
  return {
    kind: 'merged',
    group,
    branch,
    into,
    commit,
    removedWorktree: worktree,
    ...reclaimed,
    ...(cleanupError ? { cleanupError } : {}),
  }
}

/**
 * Compare output (`artifacts/compare/`, the reports and diff images) that the branch
 * committed and this checkout holds untracked would stop the merge. It is
 * regenerated by the next compare, so the checkout's copy goes.
 */
async function clearScratchCollisions(branch: string): Promise<void> {
  const top = (await git(['rev-parse', '--show-toplevel'])).trim()
  const added = (
    await git(['diff', '--name-only', '--diff-filter=A', `HEAD...${branch}`])
  )
    .split('\n')
    .filter((file) => file && COMPARE_OUTPUT_PATH.test(file))
  for (const file of added)
    if (existsSync(join(top, file))) await rm(join(top, file), { force: true })
}

const LOCKFILES = new Set(['bun.lock', 'bun.lockb'])

/** A conflict only in bun lockfiles, which `bun install` regenerates (PIKKU_CHANGES_LOCK_HEAL=off keeps it a conflict). */
export const lockfilesOnly = (
  files: string[],
  env: NodeJS.ProcessEnv = process.env
): boolean =>
  env.PIKKU_CHANGES_LOCK_HEAL !== 'off' &&
  files.length > 0 &&
  files.every((file) => LOCKFILES.has(basename(file)))

/**
 * The bun a merge heals lockfiles with, as an absolute path found once by the command that merges:
 * the runtime itself when it is bun, else the first executable `bun` on PATH. Undefined when there
 * is none, and a lockfile conflict then stays a conflict.
 */
export const findBun = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> => {
  if (process.versions.bun) return process.execPath
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue
    try {
      await access(join(dir, 'bun'), constants.X_OK)
      return await realpath(join(dir, 'bun'))
    } catch {
      // not in this one
    }
  }
  return undefined
}

/** What a command printed and how it ended; `code` is null when it did not exit (could not start, or timed out). */
type Ran = { code: number | null; stdout: Buffer; stderr: string }

/** Runs `binary` (an absolute path, or git) in `cwd` without a shell, collecting its output. */
const runIn = (
  binary: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<Ran> =>
  new Promise((done) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    })
    const out: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk))
    child.once('error', (error) =>
      done({ code: null, stdout: Buffer.concat(out), stderr: error.message })
    )
    child.once('close', (code) =>
      done({ code, stdout: Buffer.concat(out), stderr })
    )
  })

/**
 * Both sides changed a bun lockfile and nothing else conflicts (package.json
 * merged cleanly): take this checkout's lockfile, let `bun install` rewrite it
 * from the merged package.json files, and finish the merge commit. When the
 * install fails the merge is aborted, saying why.
 */
async function healLockfiles(
  files: string[],
  branch: string,
  bun: string
): Promise<void> {
  const top = (await git(['rev-parse', '--show-toplevel'])).trim()
  await git(['checkout', '--ours', '--', ...files])
  for (const dir of [...new Set(files.map((file) => dirname(file)))]) {
    const result = await runIn(bun, ['install'], join(top, dir), 600_000)
    if (result.code !== 0) {
      await git(['merge', '--abort'])
      const why = `${result.stdout.toString('utf8')}${result.stderr}`
        .trim()
        .split('\n')
        .slice(-15)
        .join('\n')
      throw new CloudPreconditionError(
        `${branch} conflicts only in ${files.join(', ')}, and \`bun install\` in ${join(top, dir)} failed while regenerating it, so the merge was aborted:\n${why}`
      )
    }
  }
  await git(['add', '--', ...files])
  await git(['commit', '--no-edit', '--quiet'])
}

/**
 * Is every one of these untracked files (repo-relative) byte for byte what
 * `branch` holds at that path?
 */
export async function sameAsBranch(
  files: string[],
  branch: string,
  cwd?: string
): Promise<boolean> {
  const top = (await git(['rev-parse', '--show-toplevel'], cwd)).trim()
  for (const file of files) {
    const theirs = await runIn(
      'git',
      ['cat-file', 'blob', `${branch}:${file}`],
      top,
      60_000
    )
    if (theirs.code !== 0) return false
    let ours: Buffer
    try {
      ours = await readFile(join(top, file))
    } catch {
      return false
    }
    if (!ours.equals(theirs.stdout)) return false
  }
  return true
}

/** The paths git names when untracked files would be overwritten by a merge. */
export const untrackedInTheWay = (stderr: string): string[] => {
  const [, list] =
    stderr.match(
      /untracked working tree files would be overwritten by merge:\n([\s\S]*?)\n(?:Please|Aborting)/
    ) ?? []
  return (list ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
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
