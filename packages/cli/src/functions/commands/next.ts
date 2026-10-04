import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { changesContext } from '../../fabric/lib/changes.js'
import { claimable } from '../../fabric/lib/changes-next.js'
import { FabricPreconditionError } from '../../fabric/lib/errors.js'
import { openKnowledgeGaps } from '../../fabric/lib/knowledge-gaps.js'
import { planOnBranch } from '../../fabric/lib/plan-gate.js'
import { takeBump, type PikkuBump } from '../../fabric/lib/pikku-bump.js'
import { localStorePath } from '../../fabric/lib/changes-local.js'
import { predictSkills } from '../../fabric/lib/predict-skills.js'
import { knowledgeLine } from '@pikku/knowledge'
import {
  finishedChangesets,
  mergeChangeset,
  syncWithUpstream,
  type MergeOutcome,
} from '../../fabric/lib/changeset-merge.js'
import { currentBranch, git } from '../../utils/git.js'
import { NextInput, NextOutput } from './next.schemas.js'

type Route = z.infer<typeof NextOutput>
type Harness = 'pi' | 'claude'

const idle = (reason: string): Route => ({
  agent: null,
  skill: null,
  refs: [],
  reason,
  context: null,
  merged: [],
})

export const next = pikkuSessionlessFunc({
  description:
    'Decide what should run next in this project, and print the agent, the skill it starts with and the work it is given. --exec launches it.',
  input: NextInput,
  output: NextOutput,
  func: async ({ config }, input) => {
    const home = await currentBranch()
    const root =
      config.rootDir ?? (await git(['rev-parse', '--show-toplevel'])).trim()
    let current = input.prompt ? intake(input.prompt) : await route(root, input)
    if (!input.exec) return current
    const merged = [...current.merged]
    for (;;) {
      if (!current.agent) return { ...current, merged }
      const code = await launch(input.exec, current, input.harnessArg ?? [])
      if (code !== 0)
        throw new FabricPreconditionError(
          `The ${current.agent} agent exited with ${code}.`
        )
      if ((await currentBranch()) !== home) await git(['switch', home])
      const after = await route(root, input)
      merged.push(...after.merged)
      if (!input.loop) return { ...current, merged }
      if (after.agent && after.context === current.context)
        return {
          ...idle(`The ${current.agent} agent left the same work untouched.`),
          merged,
        }
      current = after
    }
  },
})

async function route(
  root: string,
  { parallel = false, push = false }: z.infer<typeof NextInput>
): Promise<Route> {
  const { rpc, projectId, storePath } = await changesContext(undefined)
  const merged: string[] = []
  const finished = await finishedChangesets(
    await rpc.invoke('listChanges', {
      projectId: projectId!,
      includeDone: true,
      pickupOnly: false,
    })
  )
  if (finished.length) await syncWithUpstream()
  for (const changeset of finished) {
    const unplanned =
      (changeset.group as { needsPlan?: boolean }).needsPlan &&
      (await planOnBranch(changeset.branch, changeset.group.groupId))
    if (unplanned) return replan(changeset, unplanned, merged)
    const outcome = await mergeChangeset(changeset, storePath)
    if (outcome.kind === 'conflict') return resolve(outcome, merged)
    merged.push(
      `${outcome.group.title} → ${outcome.into} @ ${outcome.commit.slice(0, 7)}`
    )
  }
  if (merged.length && push) await git(['push'])
  return { ...(await pick(root, rpc, projectId!, parallel)), merged }
}

async function pick(
  root: string,
  rpc: Awaited<ReturnType<typeof changesContext>>['rpc'],
  projectId: string,
  parallel: boolean
): Promise<Route> {
  const list = await rpc.invoke('listChanges', {
    projectId,
    status: ['open', 'claimed', 'in_progress'],
    includeDone: false,
    pickupOnly: false,
    limit: 200,
  })
  const now = Date.now()
  const running = list.groups.filter(
    (g) => g.claimExpiresAt && new Date(g.claimExpiresAt).getTime() > now
  )
  if (running.length && !parallel)
    return idle(
      `A changeset is running: ${running.map((g) => g.title).join(', ')}`
    )
  const ready = claimable(list, now)
  if (!ready.length) {
    if (running.length) return idle('Nothing to do')
    const bump = await takeBump(root, await localStorePath())
    if (bump) return upgrade(bump)
    const { gaps } = await openKnowledgeGaps(root, rpc, projectId)
    return gaps.length ? fileGaps(gaps) : idle('Nothing to do')
  }
  return {
    agent: 'changes',
    skill: 'pikku-changes',
    refs: predictSkills(
      ready.flatMap((c) => [c.title, c.body]),
      list.groups as Array<{ creates?: string[]; alters?: string[]; needsPlan?: boolean }>
    ),
    reason: `${ready.length} open change(s)`,
    merged: [],
    context: [
      '# Open changes',
      '',
      ...ready.flatMap((c) => [
        `## #${c.shortId} ${c.title}`,
        ...(c.body ? ['', c.body] : []),
        '',
      ]),
      ...(running.length
        ? ['# Already running', '', ...running.map(describe), '']
        : []),
      running.length || parallel ? WORKING_ALONGSIDE : WORKING_THEM,
    ].join('\n'),
  }
}

const resolve = (
  outcome: Extract<MergeOutcome, { kind: 'conflict' }>,
  merged: string[]
): Route => ({
  agent: 'changes',
  skill: 'pikku-changes',
  refs: [],
  reason: `“${outcome.group.title}” conflicts with ${outcome.into}`,
  merged,
  context: `# Merge conflict

“${outcome.group.title}” (${outcome.branch}) conflicts with ${outcome.into} in:

${outcome.files.map((f) => `- ${f}`).join('\n')}

${outcome.worktree ? `Work in ${outcome.worktree}.` : `Switch to ${outcome.branch}.`} Merge ${outcome.into} into ${outcome.branch}, resolve each conflict so both sides still do what they were for, run the tests, commit the merge and stop. Do not merge ${outcome.branch} into ${outcome.into}; pikku changes next does that.
`,
})

const upgrade = ({ from, to }: PikkuBump): Route => ({
  agent: 'upgrade',
  skill: 'pikku-changes',
  refs: ['pikku-concepts'],
  reason: `pikku went from ${from} to ${to}`,
  merged: [],
  context: `# pikku ${from} → ${to}

Read the CHANGELOG.md of each @pikku package in node_modules for the entries after ${from}, run \`pikku all\` and the typecheck, and file what this project has to change to keep up as changes: \`pikku changes file --title "<one line>" --body "<what has to change and why, citing the changelog entry>"\`, one commit's worth each. A breaking change that makes the project fail to build or typecheck comes first. File them and stop; another agent builds them. If nothing needs changing, file nothing.
`,
})

const fileGaps = (
  gaps: Awaited<ReturnType<typeof openKnowledgeGaps>>['gaps']
): Route => ({
  agent: 'knowledge',
  skill: 'pikku-knowledge',
  refs: ['pikku-changes'],
  reason: `${gaps.length} note(s) no change builds yet`,
  merged: [],
  context: `# Knowledge no change builds yet

${gaps
  .map((g) =>
    [
      `- ${g.note} (${g.state}) — \`${knowledgeLine(g)}\``,
      ...g.leftBehind.map((d) => `  - left behind: ${d.item} — ${d.why}`),
      ...g.missing.map((item) => `  - built by ${g.by.join(', ')}, gone now: ${item}`),
    ].join('\n')
  )
  .join('\n')}

# Filing them

Read each note and file what it asks for as changes: \`pikku changes file --title "<one line>" --body "<what the person sees when it is done>"\`, one commit's worth each, in the app's own words. End the body of every change that builds a note with that note's \`Knowledge:\` line above, exactly, so it is not filed again. A note that is only partly built gets changes for what it left behind.

\`removed\` and \`deleted\` run the other way: the code and the knowledge disagree about something that was built. \`removed\` means code a merged changeset built for the note is gone; \`deleted\` means the note is gone and its code is not. Read \`git log\` for who removed it and why. If it was removed on purpose, bring the knowledge into line — edit or delete the note, or for \`deleted\` file a change that removes the code — and commit that. If it looks accidental, file a change that restores it. If you cannot tell, file the change and \`pikku changes ask\` on it which way. Every change filed for a gap still ends with its \`Knowledge:\` line. File them and stop; another agent builds them.
`,
})

const replan = (
  { group, branch }: { group: { title: string; groupId: string }; branch: string },
  why: string,
  merged: string[]
): Route => ({
  agent: 'changes',
  skill: 'pikku-changes',
  refs: ['pikku-architect'],
  reason: `“${group.title}” has no usable plan`,
  merged,
  context: `# Plan before merge

“${group.title}” (${branch}) is done but cannot merge: ${why}

Switch to ${branch}, write its plan with the pikku-architect skill and \`pikku knowledge plan set ${group.groupId} <file>\`, build whatever \`pikku knowledge plan progress ${group.groupId}\` says is missing, commit and stop. pikku changes next merges it.
`,
})

const intake = (prompt: string): Route => ({
  agent: 'intake',
  skill: 'pikku-changes',
  refs: ['pikku-knowledge'],
  reason: 'A request for an existing project',
  merged: [],
  context: `# The request

${prompt}

# Turning it into changes

Read the knowledge base for what the app already is, then file the request as changes: \`pikku changes file --title "<one line>" --body "<what the person sees when it is done>"\`. Each change is one commit's worth, written in the app's own words. Where the request leaves something open that changes the schema or a screen, \`pikku changes ask\` on the change it affects. File them and stop; another agent builds them.
`,
})

const WORKING_THEM = `These are every open change. Group them into changesets as the pikku-changes skill's Changesets section says, then claim one, build it, mark its changes done and stop. pikku changes next merges it, and the next changeset gets a fresh agent.
`

const WORKING_ALONGSIDE = `Other agents work changesets at the same time as you. Claim one changeset with --worktree and build it in the checkout that prints; declare the tables it creates, alters and reads, and if the claim is refused because of a running changeset, claim one that does not clash or stop. When its changes are done, stop; pikku changes next merges it, and the next changeset gets a fresh agent.
`

const describe = (g: {
  title: string
  creates?: string[]
  alters?: string[]
  reads?: string[]
}): string => {
  const touches = (['creates', 'alters', 'reads'] as const)
    .filter((k) => g[k]?.length)
    .map((k) => `${k} ${g[k]!.join(', ')}`)
  return `- ${g.title}${touches.length ? ` — ${touches.join('; ')}` : ''}`
}

const SKILL_DIRS: Record<Harness, string> = {
  pi: '.pi/skills',
  claude: '.claude/skills',
}

/**
 * The role skill goes into the system prompt so the agent starts already
 * holding it; the predicted references are named up front and the rest of the
 * catalog stays discoverable.
 */
async function launch(
  harness: Harness,
  current: Route,
  extra: string[]
): Promise<number> {
  const skill = join(SKILL_DIRS[harness], current.skill!, 'SKILL.md')
  if (!existsSync(skill))
    throw new FabricPreconditionError(
      `${skill} is missing. Run \`pikku skills install --core --fabric --agent ${harness}\` first.`
    )
  const work = join(await mkdtemp(join(tmpdir(), 'pikku-next-')), 'work.md')
  const refs = current.refs.length
    ? `\n\nRead these skills before you start: ${current.refs.join(', ')}.\n`
    : ''
  await writeFile(work, current.context + refs)
  const message = `You are the ${current.agent} agent for this project. Your work is in ${work}.`
  const args =
    harness === 'pi'
      ? ['--append-system-prompt', skill, ...extra, `@${work}`, message]
      : [
          '--append-system-prompt',
          await readFile(skill, 'utf8'),
          ...extra,
          message,
        ]
  return new Promise((resolve, reject) => {
    const child = spawn(harness, args, {
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

export const renderNext = (_s: unknown, result: Route): void => {
  for (const line of result.merged) console.log(`Merged ${line}`)
  if (!result.agent) {
    console.log(result.reason)
    return
  }
  console.log(`${result.agent} agent, skill ${result.skill} — ${result.reason}`)
  console.log(result.context)
}
