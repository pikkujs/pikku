import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import {
  changeRef,
  changesContext,
  clockTime,
  httpStatus,
  idList,
  requireProjectId,
  refuseWhileFiling,
} from '../lib/changes.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { dim, safe } from '@pikku/cli/addon-support'
import type { ChangesRPC, Declaration } from '../lib/changes-local.js'
import { releaseChangeset } from '../lib/changes-local.js'
import {
  addChangesetWorktree,
  assertWorktreeRoom,
} from '../lib/changeset-worktree.js'
import type { ClaimChangesOutput } from '../lib/types.js'
import { statuses } from '../lib/changes-board.js'
import { configuredPlanJudge, needsPlan } from '../lib/plan-judge.js'

export const ChangesClaimInput = z.object({
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

export const ChangesClaimOutput = z.object({
  group: z.any(),
  changes: z.any(),
  worktree: z.string().optional(),
  planWhy: z.string().optional(),
})

export const ChangesClaim = pikkuSessionlessFunc({
  description: 'Take a batch of changes as one job under a lease.',
  input: ChangesClaimInput,
  output: ChangesClaimOutput,
  func: async (_services, input) => {
    await refuseWhileFiling('claim')
    const { rpc, projectId, storePath } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    // Refused before the lease is taken; a claim naming its group may get
    // the worktree it already has back, and is checked once that is known.
    if (input.worktree && !input.groupId) await assertWorktreeRoom()
    const project = requireProjectId(projectId)
    const changeIds = idList(input.changeIds)
    const declaration = await declare(rpc, project, changeIds, input)
    // Claiming a group again (to declare its tables, or renew the lease)
    // keeps who holds it: the loop that releases a stale lease finds it by that.
    const claimedBy =
      input.claimedBy ??
      (input.groupId
        ? await holderOf(rpc, project, input.groupId)
        : undefined) ??
      'pikku-cli'
    let claimed: ClaimChangesOutput
    try {
      claimed = await rpc.invoke('claimChanges', {
        projectId: project,
        groupId: input.groupId,
        changeIds,
        title: input.title,
        claimedBy,
        leaseMinutes: input.leaseMinutes ?? 30,
        ...declaration,
      })
    } catch (error) {
      if (httpStatus(error) !== 409 || !changeIds?.length) throw error
      throw new CloudPreconditionError(
        await whyUnclaimable(rpc, project, changeIds, error)
      )
    }
    const planWhy = declaration?.why
    if (!input.worktree) return { ...claimed, planWhy }
    let worktree: string
    try {
      worktree = await addChangesetWorktree(claimed.group.title, {
        reuse: !!input.groupId,
      })
    } catch (error) {
      // No checkout to build it in: the lease just taken goes back.
      if (storePath) await releaseChangeset(storePath, claimed.group.groupId)
      throw error
    }
    return { ...claimed, planWhy, worktree }
  },
})

async function holderOf(
  rpc: ChangesRPC,
  projectId: string,
  groupId: string
): Promise<string | undefined> {
  const { groups } = await rpc.invoke('listChanges', {
    projectId,
    groupId,
    includeDone: true,
  })
  return groups.find((g) => g.groupId === groupId)?.claimedBy ?? undefined
}

const declared = (input: z.infer<typeof ChangesClaimInput>) =>
  Boolean(
    idList(input.creates)?.length ||
    idList(input.alters)?.length ||
    idList(input.reads)?.length ||
    input.needsPlan !== undefined
  )

/**
 * Whether the changeset is planned: said outright with --needs-plan, or
 * decided by the fixed rules and then the configured judge. Renewing a claim
 * on a group without declaring anything keeps what was decided before.
 */
async function declare(
  rpc: ChangesRPC,
  projectId: string,
  changeIds: string[] | undefined,
  input: z.infer<typeof ChangesClaimInput>
): Promise<(Declaration & { why: string }) | undefined> {
  const creates = idList(input.creates) ?? []
  const alters = idList(input.alters) ?? []
  const reads = idList(input.reads) ?? []
  if (input.needsPlan !== undefined)
    return {
      creates,
      alters,
      reads,
      needsPlan: input.needsPlan,
      why: '--needs-plan said so',
    }
  if (input.groupId && !declared(input)) return undefined
  const changes = changeIds?.length
    ? await Promise.all(
        changeIds.map(
          async (ref) =>
            (await rpc.invoke('getChange', changeRef(projectId, ref))).change
        )
      )
    : (
        await rpc.invoke('listChanges', {
          projectId,
          // a named group is judged on its own changes, as it claims only those
          ...(input.groupId
            ? { groupId: input.groupId }
            : { status: statuses('ready') }),
          includeDone: false,
        })
      ).changes
  const verdict = await needsPlan(
    {
      title: input.title ?? changes[0]?.title ?? '',
      changes: changes.map((c) => ({ title: c.title, body: c.body ?? null })),
      creates,
      alters,
      reads,
    },
    configuredPlanJudge()
  )
  return { creates, alters, reads, ...verdict }
}

/**
 * Each reason a claim is refused calls for something different — wait, leave
 * it, or pick another — so name it per item, with the time a wait ends.
 * the backend's own message comes first because it alone says who holds a lease.
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
  if (said && lines.every((line) => line.endsWith(': ready'))) return said
  return [
    'Nothing in that set can be claimed right now:',
    ...lines,
    ...(said ? [`${said}`] : []),
    ...(waiting
      ? [
          'Run `pikku changes wait --claim --claimed-by <you>` — it sleeps until then and claims them.',
        ]
      : []),
  ].join('\n')
}

export const renderChangesClaim = (
  _s: unknown,
  {
    group,
    changes,
    worktree,
    planWhy,
  }: ClaimChangesOutput & { worktree?: string; planWhy?: string }
): void => {
  console.log(`Claimed ${changes.length} item(s) as “${safe(group.title)}”`)
  console.log(dim(`group ${safe(group.groupId)}`))
  const touches = touchesLine(group as Partial<Declaration>)
  if (touches)
    console.log(planWhy ? `${touches} ${dim(`— ${safe(planWhy)}`)}` : touches)
  if ((group as Partial<Declaration>).needsPlan)
    console.log(
      `Plan it before any code: the pikku-architect skill, then \`pikku knowledge plan set ${safe(group.groupId)} <file>\`, committed on the changeset's branch.`
    )
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
