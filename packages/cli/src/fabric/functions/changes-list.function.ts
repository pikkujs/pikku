import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { age, changesContext, requireProjectId } from '../lib/changes.js'
import { dim, statusColor } from '../lib/output.js'
import type { ListChangesOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesListInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stageId: z.string().optional(),
  route: z.string().optional(),
  groupId: z.string().optional(),
  pickupOnly: z.boolean().optional(),
  includeDone: z.boolean().optional(),
  limit: z.number().optional(),
})

export const FabricChangesListOutput = z.object({
  changes: z.any(),
  groups: z.any(),
})

export const FabricChangesList = pikkuSessionlessFunc({
  description: 'List the open changes filed against a project.',
  input: FabricChangesListInput,
  output: FabricChangesListOutput,
  func: async (_services, input) => {
    const { rpc, projectId } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    return await rpc.invoke('listChanges', {
      projectId: requireProjectId(projectId),
      stageId: input.stageId,
      route: input.route,
      groupId: input.groupId,
      pickupOnly: input.pickupOnly ?? false,
      includeDone: input.includeDone ?? false,
      limit: input.limit ?? 50,
    })
  },
})

type Change = ListChangesOutput['changes'][number]
type Group = ListChangesOutput['groups'][number]

const line = (change: Change): void => {
  const flags = [
    statusColor(change.status),
    change.held ? dim('held') : null,
    change.route,
  ]
    .filter(Boolean)
    .join('  ')
  console.log(`  #${change.shortId}  ${change.title}`)
  console.log(
    `      ${flags}  ${age(change.createdAt)} ago  ${dim(change.changeId)}`
  )
  const named = (change.capture?.elements ?? [])
    .map((element) => element.testId ?? element.sourceAnchor ?? element.cssPath)
    .filter(Boolean)
  if (named.length) console.log(dim(`      circled: ${named.join(', ')}`))
}

export const renderChangesList = (
  _s: unknown,
  { changes, groups }: { changes: Change[]; groups: Group[] }
): void => {
  if (!changes.length) {
    console.log(dim('  Nothing open.'))
    return
  }

  const listed = new Set(groups.map((group) => group.groupId))
  const ungrouped = changes.filter((change) => !change.groupId)
  const grouped = changes.filter((change) => change.groupId)

  if (ungrouped.length) {
    console.log(`unclaimed (${ungrouped.length})`)
    ungrouped.forEach(line)
  }

  for (const group of groups) {
    const members = grouped.filter((change) => change.groupId === group.groupId)
    if (!members.length) continue
    const lease =
      group.claimedBy && group.claimExpiresAt
        ? `claimed by ${group.claimedBy}, ${age(group.claimExpiresAt)} left`
        : 'unclaimed'
    console.log('')
    console.log(`${group.title}  ${dim(`(${lease})  ${group.groupId}`)}`)
    members.forEach(line)
  }

  const orphaned = grouped.filter((change) => !listed.has(change.groupId!))
  if (orphaned.length) {
    console.log('')
    console.log(dim('grouped, group not listed'))
    orphaned.forEach(line)
  }
}
