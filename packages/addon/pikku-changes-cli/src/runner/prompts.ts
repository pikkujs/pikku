import type { NextRoute, PromptContext, RunnerPrompts } from './types.js'

/** The `## #<id> ...` section of the route's context, the change's own text. */
const sectionOf = (route: NextRoute, id: string) =>
  (route.context ?? '')
    .split(/^(?=#{1,2} )/m)
    .find((part) => part.startsWith(`## #${id} `))
    ?.trim() ?? `## #${id}`

const routeIntro = (route: NextRoute) =>
  `You are the ${route.agent} agent for this project. Follow the ${route.skill} skill${route.refs.length ? `, and read ${route.refs.join(', ')} before you start` : ''}.`

export const buildPrompt = ({
  route,
  change,
  claimant,
  leaseMinutes,
  clean,
}: PromptContext): string =>
  [
    routeIntro(route),
    '',
    '# Your change',
    '',
    `The runner has claimed #${change.id} for you as the changeset “${change.title}” (group ${change.groupId}). This directory, ${change.worktree}, is its own worktree on its own branch: build it here and nowhere else. Other agents are working other changes at the same time, each in its own worktree.`,
    `Do not claim other changes, and do not run \`pikku changes next\` or \`pikku changes merge\`: the runner merges the changeset after you stop. If it creates, alters or reads tables, say so on the claim first: \`pikku changes claim --group-id ${change.groupId} --change-ids ${change.id} --lease-minutes ${leaseMinutes} --claimed-by ${claimant} --creates <tables> --alters <tables> --reads <tables>\`. ${clean ? 'This worktree started clean: `pikku check` passed before you began. Any error it reports after your changes is yours to fix' : "Run `pikku check` before you start: this worktree was not checked for you just now (an agent may have worked in it before), and any error it reports is this change's to fix"}: read it, fix it and run it again. Do not run \`changes done\` until \`pikku check\` passes. If \`changes done\` refuses, the refusal is your to-do list: build what it says is missing, commit, and run it again. When #${change.id} is built, committed and checked, mark it done and stop.`,
    '',
    sectionOf(route, change.id),
  ].join('\n')

export const repairPrompt = (failure: string): string =>
  [
    'You are repairing the main checkout of this project. Changesets other agents built were merged into it, and together they fail the check below, so the runner starts no new agent until it passes.',
    'Fix it here, in this checkout, with the smallest change that keeps what each merged changeset was for. Run `pikku check` until it passes, commit the fix on this branch, and stop.',
    'Do not claim, file or mark changes done, and do not run `pikku changes next` or `pikku changes merge`.',
    '',
    failure,
  ].join('\n')

export const conflictPrompt = (route: NextRoute): string =>
  [routeIntro(route), '', route.context ?? ''].join('\n')

export const defaultPrompts: RunnerPrompts = {
  build: buildPrompt,
  repair: repairPrompt,
  conflict: conflictPrompt,
}
