import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { changeRef, changesContext, refuseWhileFiling } from '../lib/changes.js'
import {
  currentBranch,
  git,
  headSha,
  isGitRepo,
} from '@pikku/cli/addon-support'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { planRefusal } from '../lib/plan-gate.js'
import { migrationFiles } from '../lib/migration-files.js'
import { refuseUntilPagesCompared } from '../lib/page-gate.js'
import {
  buildsPages,
  declaredNewPages,
  declaredPages,
} from '../lib/change-plan.js'
import { refuseUntilChecked } from '../lib/check-gate.js'
import {
  changesetBranch,
  changesetWorktrees,
} from '../lib/changeset-worktree.js'
import type { ChangesRPC, Declaration } from '../lib/changes-local.js'
import { dim, safe } from '@pikku/cli/addon-support'
import type { CompleteChangeOutput } from '../lib/types.js'

export const ChangesDoneInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  branch: z.string().optional(),
  headCommit: z.string().optional(),
  note: z.string().optional(),
  authorName: z.string().optional(),
})

export const ChangesDoneOutput = z.object({
  change: z.any(),
})

/**
 * `rev-parse --abbrev-ref HEAD` answers the literal 'HEAD' in a detached
 * checkout. Recording that would strike the item through against a branch
 * nobody can open, so it is dropped — the sha read alongside it is still real,
 * and is enough to say where the fix landed.
 */
export const namedBranch = (head: string): string | undefined =>
  head === 'HEAD' || head === '' ? undefined : head

/**
 * Branch and commit default to the checkout this runs in. They are what strikes
 * the item through on the page it was filed from, and a hand-typed sha that
 * does not exist points the filer at nothing — so read them from git unless the
 * caller has a reason to say otherwise.
 */
export const ChangesDone = pikkuSessionlessFunc({
  description: 'Tick a change off, recording the commit that closed it.',
  input: ChangesDoneInput,
  output: ChangesDoneOutput,
  func: async (_services, input) => {
    await refuseWhileFiling('finish')
    let branch = input.branch
    let headCommit = input.headCommit

    if ((!branch || !headCommit) && (await isGitRepo())) {
      branch ??= await currentBranch()
        .then(namedBranch)
        .catch(() => undefined)
      headCommit ??= await headSha().catch(() => undefined)
    }

    // A change that touched pages of a site rebuilt from a reference is done
    // only when `pikku ui pages compare` passes at HEAD.
    const { rpc, projectId } = await changesContext(input.apiUrl)
    if (await isGitRepo()) {
      const ref = input.changeId.trim()
      await refuseOutsideChangeset(
        rpc,
        projectId!,
        input.changeId,
        input.headCommit
      )
      await refuseUntilChecked({
        git: (args) => git(args),
        label: /^#?\d+$/.test(ref) ? `#${ref.replace(/^#/, '')}` : ref,
      })
      // the pages its plan named (a `Pages:` line), which it is held to
      const change = await rpc
        .invoke('getChange', changeRef(projectId, input.changeId))
        .then(({ change }) => change)
        .catch(() => null)
      await refuseUntilPagesCompared({
        git: (args) => git(args),
        pages: declaredPages(change?.body),
        newPages: declaredNewPages(change?.body),
        frontend: change ? buildsPages(change) : false,
        label: /^#?\d+$/.test(ref) ? `#${ref.replace(/^#/, '')}` : ref,
      })
    }

    if (headCommit)
      headCommit = await checkCommit(
        rpc,
        projectId,
        input.changeId,
        input.headCommit ?? null
      )
    return await rpc.invoke('completeChange', {
      ...changeRef(projectId, input.changeId),
      branch,
      headCommit,
      note: input.note,
      authorName: input.authorName ?? 'pikku-cli',
    })
  },
})

/**
 * The gates judge the checkout `done` runs in, so it has to be the change's
 * own: a `--head-commit` is the HEAD here, and a change whose changeset has a
 * branch (`claim --worktree`) is finished on that branch, in its worktree.
 * Run from the main checkout with the worktree's sha, the gates would pass on
 * the main branch and the work would never be merged.
 */
export async function refuseOutsideChangeset(
  rpc: ChangesRPC,
  projectId: string,
  ref: string,
  given: string | undefined,
  cwd?: string
): Promise<void> {
  const head = (await git(['rev-parse', 'HEAD'], cwd)).trim()
  const { change } = await rpc.invoke('getChange', changeRef(projectId, ref))
  const label = `#${change.shortId}`
  if (given) {
    const sha = (
      await git(
        ['rev-parse', '--verify', '--quiet', `${given}^{commit}`],
        cwd
      ).catch(() => '')
    ).trim()
    if (sha !== head)
      throw new CloudPreconditionError(
        `--head-commit ${given} is not HEAD of this checkout (${head.slice(0, 7)}). Run done in the worktree the change was built in, with its last commit checked out, and leave --head-commit out.`
      )
  }
  if (!change.groupId) return
  const { groups } = await rpc.invoke('listChanges', {
    projectId,
    groupId: change.groupId,
    includeDone: true,
  })
  const group = groups.find((g) => g.groupId === change.groupId) as
    ((typeof groups)[number] & { branch?: string }) | undefined
  if (!group) return
  const exists = (name: string) =>
    git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], cwd).then(
      () => true,
      () => false
    )
  const here = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim()
  // the branch recorded on the group at `claim --worktree`; else (a group
  // claimed before branches were recorded, or one renamed by a later --title)
  // a slug of its title, else a changeset branch holding this change's commit
  let branch: string | undefined = group.branch
  if (!branch) {
    const slugged = changesetBranch(group.title)
    branch = (await exists(slugged))
      ? slugged
      : await branchWithCommitFor(change, here, cwd)
  }
  if (!branch || !(await exists(branch))) return
  if (here === branch) return
  const worktree = (await changesetWorktrees(cwd)).find(
    (w) => w.branch === branch
  )
  throw new CloudPreconditionError(
    `${label} belongs to the changeset on ${branch}, and this checkout is on ${here}. Run done there${worktree ? `: cd ${worktree.path}` : ''}, where the change was built and committed.`
  )
}

/** A changeset branch (not this one) holding a commit with the change's trailer. */
async function branchWithCommitFor(
  change: { changeId: string; shortId: string },
  here: string,
  cwd?: string
): Promise<string | undefined> {
  const branches = (
    await git(
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads/changeset/'],
      cwd
    ).catch(() => '')
  )
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && b !== here)
  for (const branch of branches) {
    const sha = (
      await git(
        [
          'log',
          '-1',
          '--format=%H',
          '-E',
          `--grep=^Change(-Id)?: (${change.changeId}|#?${change.shortId})$`,
          branch,
          '--not',
          'HEAD',
        ],
        cwd
      ).catch(() => '')
    ).trim()
    if (sha) return branch
  }
  return undefined
}

/**
 * On the local queue the commit is the only durable record of a change, so it
 * is found by its trailer rather than assumed to be HEAD, and a migration the
 * changeset never declared would slip past the one-at-a-time ordering of schema
 * changesets. A changeset that needs a plan is held to it here.
 */
async function checkCommit(
  rpc: ChangesRPC,
  projectId: string,
  ref: string,
  given: string | null
): Promise<string> {
  const { change } = await rpc.invoke('getChange', changeRef(projectId, ref))
  const carries = (message: string) => {
    const trailer = message.match(/^Change(?:-Id)?: #?(\S+)\s*$/m)?.[1]
    return trailer === change.shortId || trailer === change.changeId
  }
  const sha = given
    ? (await git(['rev-parse', given])).trim()
    : (
        await git([
          'log',
          '-1',
          '--format=%H',
          '-E',
          `--grep=^Change(-Id)?: (${change.changeId}|#?${change.shortId})$`,
        ])
      ).trim()
  if (!sha || !carries(await git(['log', '-1', '--format=%B', sha])))
    throw new CloudPreconditionError(
      `${given ? `${given} is not the commit for #${change.shortId}` : `No commit on this branch is #${change.shortId}`}. Commit it with #${change.shortId} in the subject and a \`Change-Id: ${change.changeId}\` trailer, then run done again.`
    )
  const files = await git([
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '-r',
    sha,
  ])
  const migrations = await migrationFiles(
    (args) => git(args),
    [sha, 'HEAD'],
    files.split('\n')
  )
  const { groups, changes } = change.groupId
    ? await rpc.invoke('listChanges', {
        projectId,
        groupId: change.groupId,
        includeDone: true,
      })
    : { groups: [], changes: [] }
  const declared = groups.find((g) => g.groupId === change.groupId) as
    Partial<Declaration> | undefined
  if (declared?.needsPlan && change.groupId) {
    const last = changes.every(
      (c) => c.changeId === change.changeId || c.status === 'done'
    )
    const top = (await git(['rev-parse', '--show-toplevel'])).trim()
    const refusal = planRefusal(top, change.groupId, last)
    if (refusal) throw new CloudPreconditionError(refusal)
  }
  if (!migrations.length) return sha
  if (declared?.creates?.length || declared?.alters?.length) return sha
  throw new CloudPreconditionError(
    `#${change.shortId} adds ${migrations.join(', ')} but its changeset declared no table it creates or alters. Claim it again with --creates/--alters so it is ordered with the other schema changes, then run done again.`
  )
}

export const renderChangesDone = (
  _s: unknown,
  { change }: CompleteChangeOutput
): void => {
  const at = [change.branch, change.headCommit?.slice(0, 7)]
    .map((part) => (part ? safe(part) : part))
    .filter(Boolean)
    .join(' @ ')
  console.log(`#${safe(change.shortId)} done${at ? dim(`  ${at}`) : ''}`)
}
