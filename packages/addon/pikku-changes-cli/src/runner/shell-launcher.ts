import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentActivity,
  AgentExit,
  AgentLauncher,
  AgentRun,
} from './types.js'

export interface ShellLauncherOptions {
  /** Each agent's output goes to `<logDir>/<kind>-<change|main>-<time>.log` when set. */
  logDir?: string
  /** After a stop's SIGTERM, how long before SIGKILL (default 10 s). */
  killGraceMs?: number
}

/** Signals the agent's process group (it leads one), so a stop takes what it started with it; SIGKILL follows after the grace. */
const stopTree = (child: ChildProcess, graceMs: number) => {
  const live = () => child.exitCode === null && child.signalCode === null
  const group = (signal: NodeJS.Signals) => {
    try {
      if (!child.pid) return false
      process.kill(-child.pid, signal)
      return true
    } catch {
      return false
    }
  }
  if (!live()) return
  if (!group('SIGTERM')) child.kill('SIGTERM')
  setTimeout(
    () => group('SIGKILL') || (live() && child.kill('SIGKILL')),
    graceMs
  ).unref()
}

/**
 * An agent is a shell command (`sh -c <command>`) run in the agent's
 * directory, in its own process group, with the prompt on stdin and the
 * change in its environment (PIKKU_CHANGE_ID, PIKKU_CHANGESET_GROUP,
 * PIKKU_CHANGESET_WORKTREE, PIKKU_AGENT_KIND). Any output counts as activity,
 * so "no output for the stall minutes" is quiet; it reports no tools.
 */
export const shellLauncher = (
  command: string,
  options: ShellLauncherOptions = {}
): AgentLauncher => ({
  start({ cwd, env, prompt, change, kind }): AgentRun {
    const child = spawn('sh', ['-c', command], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    const activity = new Set<(a: AgentActivity) => void>()
    const exits = new Set<(e: AgentExit) => void>()
    let ended: AgentExit | undefined
    let log: ReturnType<typeof createWriteStream> | undefined
    if (options.logDir) {
      mkdirSync(options.logDir, { recursive: true })
      log = createWriteStream(
        join(
          options.logDir,
          `${kind}-${change?.id ?? 'main'}-${Date.now()}.log`
        )
      )
    }
    const output = (chunk: Buffer) => {
      log?.write(chunk)
      for (const listener of activity) listener({ type: 'output' })
    }
    child.stdout!.on('data', output)
    child.stderr!.on('data', output)
    const finish = (exit: AgentExit) => {
      if (ended) return
      ended = exit
      log?.end()
      for (const listener of exits) listener(exit)
      exits.clear()
    }
    child.once('error', (error) => {
      log?.write(`\n[the agent could not start: ${error.message}]\n`)
      finish({ code: 1, signal: null })
    })
    child.once('exit', (code, signal) => finish({ code, signal }))
    child.stdin!.on('error', () => undefined)
    child.stdin!.end(prompt)
    return {
      stop: () => stopTree(child, options.killGraceMs ?? 10_000),
      onActivity(listener) {
        activity.add(listener)
        return () => activity.delete(listener)
      },
      onExit(listener) {
        if (ended) {
          const exit = ended
          queueMicrotask(() => listener(exit))
          return () => undefined
        }
        exits.add(listener)
        return () => exits.delete(listener)
      },
    }
  },
})
