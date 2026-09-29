import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import {
  changesContext,
  httpStatus,
  idList,
  remaining,
  requireProjectId,
  resolveChangeIds,
} from '../lib/changes.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { dim, safe } from '../lib/output.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'
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
    const project = requireProjectId(projectId)
    const changeIds = await resolveChangeIds(
      rpc,
      project,
      idList(input.changeIds)
    )
    try {
      return await rpc.invoke('claimChanges', {
        projectId: project,
        groupId: input.groupId,
        changeIds,
        title: input.title,
        claimedBy: input.claimedBy ?? 'pikku-cli',
        leaseMinutes: input.leaseMinutes ?? 30,
      })
    } catch (error) {
      if (httpStatus(error) !== 409 || !changeIds?.length) throw error
      throw new FabricPreconditionError(
        await whyUnclaimable(rpc, project, changeIds)
      )
    }
  },
})

const secondsAgo = (at: string | Date): number =>
  Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000))

/**
 * The server's 409 says only that nothing in the set could be taken. Each
 * reason calls for something different — wait, leave it, or pick another — so
 * name it per item.
 */
async function whyUnclaimable(
  rpc: PikkuRPC,
  projectId: string,
  changeIds: string[]
): Promise<string> {
  const { changes, groups } = await rpc.invoke('listChanges', {
    projectId,
    includeDone: true,
    pickupOnly: false,
    limit: 200,
  })
  const lines = changeIds.map((changeId) => {
    const change = changes.find((c) => c.changeId === changeId)
    if (!change) return `  ${changeId}: not found in this project`
    const label = `  #${change.shortId}`
    if (change.held)
      return `${label}: still held for the person filing it (filed ${secondsAgo(change.createdAt)}s ago)`
    const group = groups.find((g) => g.groupId === change.groupId)
    if (group?.claimedBy && group.claimExpiresAt)
      return `${label}: ${change.status}, claimed by ${group.claimedBy} for ${remaining(group.claimExpiresAt)} more`
    return `${label}: ${change.status}`
  })
  const waiting = changes.some(
    (change) => changeIds.includes(change.changeId) && change.held
  )
  return [
    'Nothing in that set can be claimed right now:',
    ...lines,
    ...(waiting
      ? [
          'Run `pikku fabric changes next --claim --claimed-by <you>` — it waits out the hold and claims them.',
        ]
      : []),
  ].join('\n')
}

export const renderChangesClaim = (
  _s: unknown,
  { group, changes }: ClaimChangesOutput
): void => {
  console.log(`Claimed ${changes.length} item(s) as “${safe(group.title)}”`)
  console.log(dim(`group ${safe(group.groupId)}`))
  if (group.claimExpiresAt) {
    console.log(
      dim(`lease until ${new Date(group.claimExpiresAt).toISOString()}`)
    )
  }
  for (const change of changes) {
    console.log(
      `  #${safe(change.shortId)}  ${safe(change.title)}  ${dim(safe(change.changeId))}`
    )
  }
}
