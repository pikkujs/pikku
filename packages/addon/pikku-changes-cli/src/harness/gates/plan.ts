import {
  functionsDirFor,
  parsePlan,
  planPathFor,
  planShortfall,
  readPikkuMeta,
} from '@pikku/knowledge'
import { pikkuHarnessGate } from '@pikku/core/harness'
import type { Finding } from '../finding.js'
import { gitIn } from '../git.js'
import { harnessPlanSteps } from '../prompts.js'
import { changesetRun, declaredChangeset } from './declared.js'

const SET = (groupId: string) =>
  `${harnessPlanSteps(groupId).join(' ')} Commit, then stop; the checks run after you stop.`

const finding = (message: string, file?: string): Finding => ({
  ...(file ? { file } : {}),
  severity: 'high',
  rule: 'harness/plan',
  message,
})

/**
 * A changeset that needs a plan has its plan committed on its branch and, when this run builds its
 * last open change, the plan's first pass is in the generated meta, as `pikku changes done`
 * requires. It runs after the check stage, which regenerates the meta it reads.
 */
export const planGate = pikkuHarnessGate({
  name: 'plan',
  description:
    'A planned changeset has its plan on its branch, built for its last change',
  failOn: 'high',
  writes: [],
  func: async (_services, _data, { gate }) => {
    const { changeset, items, storePath } = changesetRun(gate)
    const declared = await declaredChangeset(
      gate.worktree,
      changeset,
      storePath
    )
    if (!declared.needsPlan) return []
    const path = planPathFor(changeset)
    let text: string
    try {
      text = await gitIn(gate.worktree)(['show', `HEAD:${path}`])
    } catch {
      return [
        finding(
          `This changeset needs a plan and has none at ${path} on this branch. ${SET(changeset)}`,
          path
        ),
      ]
    }
    const read = parsePlan(text, path)
    if (!read.ok)
      return [
        finding(
          `This changeset needs a plan and its plan does not read: ${read.reason}. ${SET(changeset)}`,
          path
        ),
      ]
    if (read.plan.changeset !== changeset)
      return [
        finding(
          `${path} is for changeset ${read.plan.changeset}, not ${changeset}. Rename the file or fix its "changeset" field, commit, then stop; the checks run after you stop.`,
          path
        ),
      ]
    const building = new Set(items.map((item) => item.changeId))
    const last = declared.changes.every(
      (c) => building.has(c.changeId) || c.status === 'done'
    )
    if (!last) return []
    const { missing, problems } = planShortfall(
      read.plan,
      readPikkuMeta(functionsDirFor(gate.worktree))
    )
    if (!missing.length && !problems.length) return []
    return [
      finding(
        [
          'This is the last change of a planned changeset and the plan is not built yet:',
          ...missing.map((item) => `  missing  ${item}`),
          ...problems.map((item) => `  problem  ${item}`),
          `Build every item the plan lists that is missing (and nothing it does not list), run \`pikku all\`, and check with \`pikku knowledge plan progress ${changeset}\`. Mark nothing done yourself. Commit, then stop; the checks run after you stop.`,
        ].join('\n'),
        path
      ),
    ]
  },
})
