import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changeRef, changesContext } from '../lib/changes.js'
import { currentBranch, git, headSha, isGitRepo } from '../../utils/git.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { planRefusal } from '../lib/plan-gate.js'
import type { ChangesRPC, Declaration } from '../lib/changes-local.js'
import { dim, safe } from '../lib/output.js'
import type { CompleteChangeOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesDoneInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  branch: z.string().optional(),
  headCommit: z.string().optional(),
  note: z.string().optional(),
  authorName: z.string().optional(),
})

export const FabricChangesDoneOutput = z.object({
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
export const FabricChangesDone = pikkuSessionlessFunc({
  description: 'Tick a change off, recording the commit that closed it.',
  input: FabricChangesDoneInput,
  output: FabricChangesDoneOutput,
  func: async (_services, input) => {
    let branch = input.branch
    let headCommit = input.headCommit

    if ((!branch || !headCommit) && (await isGitRepo())) {
      branch ??= await currentBranch()
        .then(namedBranch)
        .catch(() => undefined)
      headCommit ??= await headSha().catch(() => undefined)
    }

    const { rpc, projectId } = await changesContext(input.apiUrl)
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
    throw new FabricPreconditionError(
      `${given ? `${given} is not the commit for #${change.shortId}` : `No commit on this branch is #${change.shortId}`}. Commit it with #${change.shortId} in the subject and a \`Change-Id: ${change.changeId}\` trailer, then run done again.`
    )
  const files = await git([
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '-r',
    sha,
  ])
  const migrations = files.split('\n').filter((f) => /^db\/[^/]+\//.test(f))
  const { groups, changes } = change.groupId
    ? await rpc.invoke('listChanges', {
        projectId,
        groupId: change.groupId,
        includeDone: true,
      })
    : { groups: [], changes: [] }
  const declared = groups.find((g) => g.groupId === change.groupId) as
    | Partial<Declaration>
    | undefined
  if (declared?.needsPlan && change.groupId) {
    const last = changes.every(
      (c) => c.changeId === change.changeId || c.status === 'done'
    )
    const top = (await git(['rev-parse', '--show-toplevel'])).trim()
    const refusal = planRefusal(top, change.groupId, last)
    if (refusal) throw new FabricPreconditionError(refusal)
  }
  if (!migrations.length) return sha
  if (declared?.creates?.length || declared?.alters?.length) return sha
  throw new FabricPreconditionError(
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
