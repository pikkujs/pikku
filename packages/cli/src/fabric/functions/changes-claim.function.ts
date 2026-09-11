import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext, idList, requireProjectId } from '../lib/changes.js'
import { dim } from '../lib/output.js'
import type { ClaimChangesOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesClaimInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  groupId: z.string().optional(),
  changeIds: z.array(z.string()).optional(),
  title: z.string().optional(),
  claimedBy: z.string().optional(),
  leaseMinutes: z.number().optional(),
})

export const FabricChangesClaimOutput = z.object({
  group: z.any(),
  changes: z.any(),
})

export const FabricChangesClaim = pikkuSessionlessFunc({
  description: 'Take a batch of changes as one job under a lease.',
  input: FabricChangesClaimInput,
  output: FabricChangesClaimOutput,
  func: async (_services, input) => {
    const { rpc, projectId } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    return await rpc.invoke('claimChanges', {
      projectId: requireProjectId(projectId),
      groupId: input.groupId,
      changeIds: idList(input.changeIds),
      title: input.title,
      claimedBy: input.claimedBy ?? 'pikku-cli',
      leaseMinutes: input.leaseMinutes ?? 30,
    })
  },
})

export const renderChangesClaim = (
  _s: unknown,
  { group, changes }: ClaimChangesOutput
): void => {
  console.log(`Claimed ${changes.length} item(s) as “${group.title}”`)
  console.log(dim(`group ${group.groupId}`))
  if (group.claimExpiresAt) {
    console.log(
      dim(`lease until ${new Date(group.claimExpiresAt).toISOString()}`)
    )
  }
  for (const change of changes) {
    console.log(
      `  #${change.shortId}  ${change.title}  ${dim(change.changeId)}`
    )
  }
}
