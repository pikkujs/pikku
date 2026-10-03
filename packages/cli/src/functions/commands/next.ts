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
import { NextInput, NextOutput } from './next.schemas.js'

type Route = z.infer<typeof NextOutput>
type Harness = 'pi' | 'claude'

const idle = (reason: string): Route => ({
  agent: null,
  skill: null,
  refs: [],
  reason,
  context: null,
})

export const next = pikkuSessionlessFunc({
  description:
    'Decide what should run next in this project, and print the agent, the skill it starts with and the work it is given. --exec launches it.',
  input: NextInput,
  output: NextOutput,
  func: async (_services, input) => {
    let current = input.prompt ? intake(input.prompt) : await route()
    if (!input.exec) return current
    for (;;) {
      if (!current.agent) return current
      const code = await launch(input.exec, current, input.harnessArg ?? [])
      if (code !== 0)
        throw new FabricPreconditionError(
          `The ${current.agent} agent exited with ${code}.`
        )
      if (!input.loop) return current
      const after = await route()
      if (after.agent && after.context === current.context)
        return idle(`The ${current.agent} agent left the same work untouched.`)
      current = after
    }
  },
})

async function route(): Promise<Route> {
  const { rpc, projectId } = await changesContext(undefined)
  const list = await rpc.invoke('listChanges', {
    projectId: projectId!,
    status: ['open', 'claimed', 'in_progress'],
    includeDone: false,
    pickupOnly: false,
    limit: 200,
  })
  const now = Date.now()
  const running = list.groups.filter(
    (g) => g.claimExpiresAt && new Date(g.claimExpiresAt).getTime() > now
  )
  if (running.length)
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
    context: [
      '# Open changes',
      '',
      ...ready.flatMap((c) => [
        `## #${c.shortId} ${c.title}`,
        ...(c.body ? ['', c.body] : []),
        '',
      ]),
      WORKING_THEM,
    ].join('\n'),
  }
}

const intake = (prompt: string): Route => ({
  agent: 'intake',
  skill: 'pikku-changes',
  refs: ['pikku-knowledge'],
  reason: 'A request for an existing project',
  context: `# The request

${prompt}

# Turning it into changes

Read the knowledge base for what the app already is, then file the request as changes: \`pikku fabric changes file --title "<one line>" --body "<what the person sees when it is done>"\`. Each change is one commit's worth, written in the app's own words. Where the request leaves something open that changes the schema or a screen, \`pikku fabric changes ask\` on the change it affects. File them and stop; another agent builds them.
`,
})

const WORKING_THEM = `These are every open change. Work them as changesets, as the pikku-changes skill's Changesets section says.
`

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
  if (!result.agent) {
    console.log(result.reason)
    return
  }
  console.log(`${result.agent} agent, skill ${result.skill} — ${result.reason}`)
  console.log(result.context)
}
