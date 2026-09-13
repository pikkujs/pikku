import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext } from '../lib/changes.js'
import { currentBranch, headSha, isGitRepo } from '../lib/git.js'
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

    const { rpc } = await changesContext(input.apiUrl)
    return await rpc.invoke('completeChange', {
      changeId: input.changeId,
      branch,
      headCommit,
      note: input.note,
      authorName: input.authorName ?? 'pikku-cli',
    })
  },
})

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
