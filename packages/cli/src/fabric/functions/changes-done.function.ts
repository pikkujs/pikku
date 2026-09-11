import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext } from '../lib/changes.js'
import { currentBranch, headSha, isGitRepo } from '../lib/git.js'
import { dim } from '../lib/output.js'
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
      branch ??= await currentBranch().catch(() => undefined)
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
    .filter(Boolean)
    .join(' @ ')
  console.log(`#${change.shortId} done${at ? dim(`  ${at}`) : ''}`)
}
