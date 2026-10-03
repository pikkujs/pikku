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
  func: async (_services, input) => {
    const home = await currentBranch()
    let current = input.prompt ? intake(input.prompt) : await route(input)
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
      const after = await route(input)
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

async function route({
  parallel = false,
  push = false,
}: z.infer<typeof NextInput>): Promise<Route> {
  const { rpc, projectId, storePath } = await changesContext(undefined)
  const merged: string[] = []
  const finished = await finishedChangesets(
    await rpc.invoke('listChanges', {
      projectId: projectId!,
      includeDone: true,
      pickupOnly: false,
      limit: 200,
    })
  )
  if (finished.length) await syncWithUpstream()
  for (const changeset of finished) {
    const outcome = await mergeChangeset(changeset, storePath)
    if (outcome.kind === 'conflict') return resolve(outcome, merged)
    merged.push(
      `${outcome.group.title} → ${outcome.into} @ ${outcome.commit.slice(0, 7)}`
    )
  }
  if (merged.length && push) await git(['push'])
  return { ...(await pick(rpc, projectId!, parallel)), merged }
}

async function pick(
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
  if (!ready.length) return idle('Nothing to do')
  return {
    agent: 'changes',
    skill: 'pikku-changes',
    refs: [],
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

${outcome.worktree ? `Work in ${outcome.worktree}.` : `Switch to ${outcome.branch}.`} Merge ${outcome.into} into ${outcome.branch}, resolve each conflict so both sides still do what they were for, run the tests, commit the merge and stop. Do not merge ${outcome.branch} into ${outcome.into}; pikku next does that.
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

Read the knowledge base for what the app already is, then file the request as changes: \`pikku fabric changes file --title "<one line>" --body "<what the person sees when it is done>"\`. Each change is one commit's worth, written in the app's own words. Where the request leaves something open that changes the schema or a screen, \`pikku fabric changes ask\` on the change it affects. File them and stop; another agent builds them.
`,
})

const WORKING_THEM = `These are every open change. Group them into changesets as the pikku-changes skill's Changesets section says, then claim one, build it, mark its changes done and stop. pikku next merges it, and the next changeset gets a fresh agent.
`

const WORKING_ALONGSIDE = `Other agents work changesets at the same time as you. Claim one changeset with --worktree and build it in the checkout that prints; declare the tables it creates, alters and reads, and if the claim is refused because of a running changeset, claim one that does not clash or stop. When its changes are done, stop; pikku next merges it, and the next changeset gets a fresh agent.
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
