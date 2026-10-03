import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import {
  changeRef,
  changesContext,
  clockTime,
  httpStatus,
  idList,
  requireProjectId,
} from '../lib/changes.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { dim, safe } from '../lib/output.js'
import type { ChangesRPC } from '../lib/changes-local.js'
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
    const changeIds = idList(input.changeIds)
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
        await whyUnclaimable(rpc, project, changeIds, error)
      )
    }
  },
})

/**
 * Each reason a claim is refused calls for something different — wait, leave
 * it, or pick another — so name it per item, with the time a wait ends.
 * fabric's own message comes first because it alone says who holds a lease.
 */
async function whyUnclaimable(
  rpc: ChangesRPC,
  projectId: string,
  refs: string[],
  refusal: unknown
): Promise<string> {
  let waiting = false
  const lines = await Promise.all(
    refs.map(async (ref) => {
      try {
        const { change } = await rpc.invoke(
          'getChange',
          changeRef(projectId, ref)
        )
        const label = `  #${change.shortId}`
        if (change.heldUntil) {
          waiting = true
          const why = change.held
            ? 'still held for the person filing it'
            : `${change.status}, inside another group's lease`
          return `${label}: ${why} — claimable at ${clockTime(change.heldUntil)}`
        }
        return `${label}: ${change.status}`
      } catch (error) {
        if (httpStatus(error) !== 404) throw error
        return `  ${ref}: not found in this project`
      }
    })
  )
  const said = refusal instanceof Error ? refusal.message : ''
  return [
    'Nothing in that set can be claimed right now:',
    ...lines,
    ...(said ? [`fabric: ${said}`] : []),
    ...(waiting
      ? [
          'Run `pikku fabric changes next --claim --claimed-by <you>` — it sleeps until then and claims them.',
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
