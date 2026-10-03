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
import { git } from '../../utils/git.js'
import { basename, dirname, join } from 'node:path'
import type { ChangesRPC, Declaration } from '../lib/changes-local.js'
import type { ClaimChangesOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesClaimInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  groupId: z.string().optional(),
  changeIds: z.array(z.string()).optional(),
  title: z.string().optional(),
  claimedBy: z.string().optional(),
  leaseMinutes: z.number().optional(),
  creates: z.array(z.string()).optional(),
  alters: z.array(z.string()).optional(),
  reads: z.array(z.string()).optional(),
  needsPlan: z.boolean().optional(),
  worktree: z.boolean().optional(),
})

export const FabricChangesClaimOutput = z.object({
  group: z.any(),
  changes: z.any(),
  worktree: z.string().optional(),
})

export const FabricChangesClaim = pikkuSessionlessFunc({
  description: 'Take a batch of changes as one job under a lease.',
  input: FabricChangesClaimInput,
  output: FabricChangesClaimOutput,
  func: async (_services, input) => {
    const { rpc, projectId, local } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    const project = requireProjectId(projectId)
    const changeIds = idList(input.changeIds)
    const declaration = declare(input)
    if (declaration && !local)
      throw new FabricPreconditionError(
        'fabric does not record --creates/--alters/--reads/--needs-plan yet; they work on the local queue.'
      )
    let claimed: ClaimChangesOutput
    try {
      claimed = await rpc.invoke('claimChanges', {
        projectId: project,
        groupId: input.groupId,
        changeIds,
        title: input.title,
        claimedBy: input.claimedBy ?? 'pikku-cli',
        leaseMinutes: input.leaseMinutes ?? 30,
        ...declaration,
      })
    } catch (error) {
      if (httpStatus(error) !== 409 || !changeIds?.length) throw error
      throw new FabricPreconditionError(
        await whyUnclaimable(rpc, project, changeIds, error)
      )
    }
    if (!input.worktree) return claimed
    return { ...claimed, worktree: await addWorktree(claimed.group.title) }
  },
})

/**
 * Changesets that run side by side each get their own checkout, next to the
 * repo rather than inside it, on a branch named after the changeset and cut
 * from the branch it will be merged back into.
 */
async function addWorktree(title: string): Promise<string> {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  const top = (await git(['rev-parse', '--show-toplevel'])).trim()
  const path = join(dirname(top), `${basename(top)}-changesets`, slug)
  await git(['worktree', 'add', path, '-b', `changeset/${slug}`])
  return path
}

/**
 * The hard rule of the judge: a changeset that creates or alters a table is
 * planned unless the caller says otherwise.
 */
function declare(
  input: z.infer<typeof FabricChangesClaimInput>
): Declaration | undefined {
  const creates = idList(input.creates) ?? []
  const alters = idList(input.alters) ?? []
  const reads = idList(input.reads) ?? []
  if (
    !creates.length &&
    !alters.length &&
    !reads.length &&
    input.needsPlan === undefined
  )
    return undefined
  return {
    creates,
    alters,
    reads,
    needsPlan: input.needsPlan ?? creates.length + alters.length > 0,
  }
}

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
  if (said && lines.every((line) => line.endsWith(': open'))) return said
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
  { group, changes, worktree }: ClaimChangesOutput & { worktree?: string }
): void => {
  console.log(`Claimed ${changes.length} item(s) as “${safe(group.title)}”`)
  console.log(dim(`group ${safe(group.groupId)}`))
  const touches = touchesLine(group as Partial<Declaration>)
  if (touches) console.log(touches)
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
  if (worktree) console.log(`Work in ${safe(worktree)}`)
}

const touchesLine = (d: Partial<Declaration>): string | null => {
  if (d.needsPlan === undefined) return null
  const parts = (['creates', 'alters', 'reads'] as const)
    .filter((k) => d[k]?.length)
    .map((k) => `${k} ${d[k]!.map(safe).join(', ')}`)
  return [...parts, d.needsPlan ? 'needs a plan' : 'no plan'].join('; ')
}
