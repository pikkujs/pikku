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
import { configuredPlanJudge, needsPlan } from '../lib/plan-judge.js'

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
  planWhy: z.string().optional(),
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
    const declaration = await declare(rpc, project, changeIds, input)
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
    const planWhy = declaration?.why
    if (!input.worktree) return { ...claimed, planWhy }
    return {
      ...claimed,
      planWhy,
      worktree: await addWorktree(claimed.group.title),
    }
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

const declared = (input: z.infer<typeof FabricChangesClaimInput>) =>
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
  input: z.infer<typeof FabricChangesClaimInput>
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
          status: ['open'],
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
  if (touches) console.log(planWhy ? `${touches} ${dim(`— ${safe(planWhy)}`)}` : touches)
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
