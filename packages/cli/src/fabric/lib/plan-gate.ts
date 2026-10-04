import {
  functionsDirFor,
  parsePlan,
  planPathFor,
  planShortfall,
  readPikkuMeta,
  readPlan,
} from '@pikku/knowledge'
import { git } from '../../utils/git.js'

const SET = (groupId: string) =>
  `Write it with the pikku-architect skill and \`pikku knowledge plan set ${groupId} <file>\`, commit it on this branch, then run done again.`

/**
 * A planned changeset is planned before its first change is done, and its last
 * change is done only when the plan's first pass exists in the generated meta.
 */
export function planRefusal(
  root: string,
  groupId: string,
  last: boolean
): string | null {
  const read = readPlan(root, groupId)
  if (!read.ok)
    return `This changeset needs a plan and ${read.missing ? 'has none' : `its plan does not read: ${read.reason}`}. ${SET(groupId)}`
  if (!last) return null
  const { missing, problems } = planShortfall(
    read.plan,
    readPikkuMeta(functionsDirFor(root))
  )
  if (!missing.length && !problems.length) return null
  return [
    'This is the last change of a planned changeset and the plan is not built yet:',
    ...missing.map((item) => `  missing  ${item}`),
    ...problems.map((item) => `  problem  ${item}`),
    `Run \`pikku all\` if the code is there, build what is missing, or move an item to a later pass with \`pikku knowledge plan defer ${groupId} <item> -r "<why>"\`. \`pikku knowledge plan progress ${groupId}\` says the same.`,
  ].join('\n')
}

/** The merge reads the plan off the changeset's branch, wherever that is checked out. */
export async function planOnBranch(
  branch: string,
  groupId: string
): Promise<string | null> {
  const path = planPathFor(groupId)
  let text: string
  try {
    text = await git(['show', `${branch}:${path}`])
  } catch {
    return `${branch} has no ${path}, and its changeset needs a plan.`
  }
  const read = parsePlan(text, path)
  return read.ok ? null : `${branch}:${path} does not read: ${read.reason}`
}
