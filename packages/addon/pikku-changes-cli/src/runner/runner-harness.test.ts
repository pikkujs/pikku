import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { processCommands } from './commands.js'
import { ChangesRunner } from './runner.js'
import type {
  AgentActivity,
  AgentExit,
  AgentLauncher,
  AgentRun,
  AgentStart,
  CommandResult,
  RunnerCommands,
  RunnerEvent,
  RunnerOptions,
  RunResult,
} from './types.js'

/**
 * The runner against the real changes CLI in a scratch git repo, with the
 * agent faked in-process: a fake build agent waits for the test to say how it
 * ends (`done` commits a file and marks its change done; `quit` stops with it
 * open), and a fake main-checkout agent runs `onMain` and ends. No model, no
 * agent process. Shared by the runner test files; it holds no tests itself.
 */
export const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)
export const haveCli = existsSync(CLI)

const ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=t']
export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8' })
export const pikku = (
  cwd: string,
  args: string[],
  env: Record<string, string> = {}
) =>
  execFileSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PIKKU_NO_LOGO: '1', ...env },
  })
export const pikkuJson = (cwd: string, ...args: string[]) =>
  JSON.parse(
    pikku(cwd, [...args, '--json'])
      .trim()
      .split('\n')
      .reverse()
      .find((l) => l.startsWith('{'))!
  )
export const worktrees = (repo: string) =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split('\n\n')
    .filter((e) => /branch refs\/heads\/changeset\//.test(e))
export const until = async (
  what: string,
  check: () => boolean | Promise<boolean>,
  ms = 60_000
) => {
  for (
    const end = Date.now() + ms;
    Date.now() < end;
    await new Promise((r) => setTimeout(r, 50))
  )
    if (await check()) return
  throw new Error(`timed out waiting for ${what}`)
}
export const leased = (group: { claimExpiresAt?: string | null }) =>
  !!group.claimExpiresAt && Date.parse(group.claimExpiresAt) > Date.now()

const made: string[] = []
/** A scratch repo with a git identity and no pikku.config.json (so `changes done` runs no `pikku check` of its own), with these changes filed. */
export const scratchRepo = async (titles: string[]) => {
  const repo = realpathSync(await mkdtemp(join(tmpdir(), 'pikku-run-')))
  made.push(repo, `${repo}-changesets`)
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@example.com')
  git(repo, 'config', 'user.name', 't')
  await writeFile(join(repo, '.gitignore'), 'node_modules/\n')
  await writeFile(
    join(repo, '.gitattributes'),
    ['png', 'jpg', 'jpeg', 'webp']
      .map((ext) => `artifacts/**/*.${ext} filter=lfs diff=lfs merge=lfs -text`)
      .join('\n') + '\n'
  )
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'init')
  for (const title of titles) pikku(repo, ['changes', 'file', '--title', title])
  return repo
}
export const cleanUp = async () => {
  for (const dir of made.splice(0))
    await rm(dir, { recursive: true, force: true })
}

export interface FakeAgent extends AgentStart {
  id: string
  stopped: boolean
  activity(a: AgentActivity): void
  end(exit?: AgentExit): void
}

/** A fake launcher; `onMain` is what a main-checkout agent does before it ends (nothing by default). */
export const fakeLauncher = (
  onMain: (agent: FakeAgent) => void | Promise<void> = () => undefined
) => {
  const agents: FakeAgent[] = []
  let running = 0
  let most = 0
  const launcher: AgentLauncher = {
    start(start) {
      const activity = new Set<(a: AgentActivity) => void>()
      const exits = new Set<(e: AgentExit) => void>()
      let ended: AgentExit | undefined
      running += 1
      most = Math.max(most, running)
      const agent: FakeAgent = {
        ...start,
        id: start.change?.id ?? 'main',
        stopped: false,
        activity: (a) => activity.forEach((l) => l(a)),
        end: (exit = { code: 0, signal: null }) => {
          if (ended) return
          ended = exit
          running -= 1
          setTimeout(() => exits.forEach((l) => l(exit)), 0)
        },
      }
      agents.push(agent)
      const run: AgentRun = {
        stop: () => {
          agent.stopped = true
          agent.end({ code: null, signal: 'SIGTERM' })
        },
        onActivity: (l) => (activity.add(l), () => activity.delete(l)),
        onExit: (l) => (exits.add(l), () => exits.delete(l)),
      }
      if (!start.change)
        void Promise.resolve(onMain(agent)).then(() => agent.end())
      return run
    },
  }
  /** How a build agent ends: `done` commits feature-<id>.txt and marks the change done; `quit` leaves it open. */
  const finish = (
    id: string,
    how: 'done' | 'quit',
    also: (cwd: string) => void = () => undefined
  ) => {
    const agent = agents.findLast((a) => a.id === id && !a.stopped)
    if (!agent) throw new Error(`no agent for #${id}`)
    if (how === 'done') {
      const cwd = agent.cwd
      execFileSync('sh', ['-c', `echo built > feature-${id}.txt`], { cwd })
      also(cwd)
      const changeId = pikkuJson(cwd, 'changes', 'show', id).change.changeId
      git(cwd, 'add', '-A')
      git(
        cwd,
        'commit',
        '-q',
        '-m',
        `#${id} built`,
        '-m',
        `Change-Id: ${changeId}`
      )
      pikku(cwd, ['changes', 'done', id], agent.env)
    }
    agent.end()
  }
  return {
    launcher,
    agents,
    finish,
    running: () => running,
    most: () => most,
    started: (id: string) => agents.filter((a) => a.id === id),
  }
}

/** The CLI's own commands, each call recorded with its env; `wrap` may answer a call instead. */
export const recordedCommands = (
  wrap?: (args: string[]) => CommandResult | undefined
) => {
  const real = processCommands(CLI, 'node')
  const calls: { args: string; env?: Record<string, string> }[] = []
  const commands: RunnerCommands = {
    ...real,
    pikku: async (cwd, args, env) => {
      calls.push({ args: args.join(' '), env })
      return wrap?.(args) ?? real.pikku(cwd, args, env)
    },
  }
  return { commands, calls }
}

export const startRunner = (
  repo: string,
  fake: ReturnType<typeof fakeLauncher>,
  options: Partial<RunnerOptions> = {},
  commands = recordedCommands()
) => {
  const events: RunnerEvent[] = []
  const runner = new ChangesRunner(
    {
      launcher: fake.launcher,
      commands: commands.commands,
      onEvent: (e) => events.push(e),
    },
    {
      cwd: repo,
      parallel: 3,
      selfCheck: false,
      setupCommand: '',
      checkCommand: '',
      stallMinutes: 0,
      toolMaxMinutes: 0,
      ...options,
    }
  )
  let result: RunResult | undefined
  const done = runner.run().then((r) => (result = r))
  return {
    runner,
    events,
    calls: commands.calls,
    done,
    result: () => result,
    texts: (kind?: RunnerEvent['kind']) =>
      events.filter((e) => !kind || e.kind === kind).map((e) => e.text),
    errors: () => events.filter((e) => e.level === 'error').map((e) => e.text),
    group: (id: string) => {
      const list = pikkuJson(repo, 'changes', 'list', '--include-done')
      const change = list.changes.find(
        (c: { shortId: string }) => String(c.shortId) === id
      )
      return list.groups.find(
        (g: { groupId: string }) => g.groupId === change.groupId
      ) as {
        groupId: string
        claimedBy?: string
        claimExpiresAt?: string | null
      }
    },
  }
}
