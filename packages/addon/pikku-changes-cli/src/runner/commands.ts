import { spawn } from 'node:child_process'
import type { CommandResult, NextRoute, RunnerCommands } from './types.js'

const KEEP = 200_000

/** Runs a process to its end; its output (stdout and stderr together) is kept up to the last 200 kB. */
export const runProcess = (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; seconds?: number }
): Promise<CommandResult> =>
  new Promise((done) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const keep = (chunk: Buffer) => (output = (output + chunk).slice(-KEEP))
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const timer = options.seconds
      ? setTimeout(() => child.kill('SIGTERM'), options.seconds * 1000)
      : undefined
    child.once('error', (error) => {
      clearTimeout(timer)
      done({ code: 1, output: error.message })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      done({ code: code ?? 1, output: output.trim() })
    })
  })

/** The runner's processes on this machine: the pikku CLI at `cliBin` run with `node`, git, and `sh -c`. */
export const processCommands = (
  cliBin: string,
  node = process.execPath
): RunnerCommands => ({
  pikku: (cwd, args, env = {}) =>
    runProcess(node, [cliBin, ...args], {
      cwd,
      env: { ...process.env, ...env, FORCE_COLOR: '0', PIKKU_NO_LOGO: '1' },
    }),
  git: (cwd, args) => runProcess('git', args, { cwd }),
  shell: (cwd, command, seconds) =>
    runProcess('sh', ['-c', command], { cwd, seconds }),
})

/** The last JSON line a `--json` CLI call printed; a failure throws with the end of its output. */
export async function cliJson<T>(
  commands: RunnerCommands,
  cwd: string,
  args: string[],
  env?: Record<string, string>
): Promise<T> {
  const { code, output } = await commands.pikku(cwd, [...args, '--json'], env)
  const line = output
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('{'))
  if (code !== 0 || !line)
    throw new Error(
      output.trim().split('\n').slice(-8).join('\n') ||
        `pikku ${args.slice(0, 2).join(' ')} failed (${code})`
    )
  return JSON.parse(line) as T
}

export interface QueueGroup {
  groupId: string
  title?: string
  claimedBy?: string
  claimExpiresAt?: string | null
  branch?: string
}

export interface QueueChange {
  shortId: string | number
  title: string
  groupId?: string | null
  specialist?: string | null
}

export interface ChangesetClaim {
  group: { groupId: string; title: string }
  worktree: string
}

/** The calls the runner makes to the changes CLI. */
export const queue = (
  commands: RunnerCommands,
  cwd: string,
  env: () => Record<string, string>
) => ({
  next: (extra: Record<string, string> = {}) =>
    cliJson<NextRoute>(commands, cwd, ['changes', 'next', '--parallel'], {
      ...env(),
      ...extra,
    }),
  list: () =>
    cliJson<{ changes: QueueChange[]; groups: QueueGroup[] }>(
      commands,
      cwd,
      ['changes', 'list', '--include-done'],
      env()
    ),
  /** One change as its own changeset in its own worktree; `groupId` picks a released changeset up again, in the worktree it kept. */
  claim: (
    change: { id: string; title: string; groupId?: string },
    claimedBy: string,
    leaseMinutes: number
  ) =>
    cliJson<ChangesetClaim>(
      commands,
      cwd,
      [
        'changes',
        'claim',
        '--change-ids',
        change.id,
        '--worktree',
        '--claimed-by',
        claimedBy,
        '--lease-minutes',
        String(leaseMinutes),
        ...(change.groupId
          ? ['--group-id', change.groupId]
          : ['--title', `#${change.id} ${change.title}`]),
      ],
      env()
    ),
  /** The lease goes back now: the changes are claimable again, the worktree and branch stay. */
  release: (groupId: string) =>
    cliJson<{ groupId: string; open: string[]; worktree: string | null }>(
      commands,
      cwd,
      ['changes', 'release', groupId],
      env()
    ),
})

export type Queue = ReturnType<typeof queue>
