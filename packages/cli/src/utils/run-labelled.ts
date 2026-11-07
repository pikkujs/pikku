import { spawn, type ChildProcess } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { Logger } from '@pikku/core/services'

export type LabelledRun = {
  ok: boolean
  /** Why it failed, in a line: the exit code, the signal or the spawn error. */
  failure?: string
  /** The last lines it printed, for the error that reports the failure. */
  tail: string[]
}

const TAIL_LINES = 30

const running = new Map<ChildProcess, boolean>()
let stopped = false

const killTree = (
  child: ChildProcess,
  signal: NodeJS.Signals,
  group: boolean
) => {
  try {
    if (group && child.pid) process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    child.kill(signal)
  }
}

/**
 * Kill every running labelled command and refuse new ones, for a caller that
 * was interrupted. Returns a function that allows them again.
 */
export const stopLabelledRuns = (signal: NodeJS.Signals = 'SIGTERM') => {
  stopped = true
  for (const [child, group] of running) killTree(child, signal, group)
  return () => {
    stopped = false
  }
}

/**
 * Run a command with no shell and no stdin, printing each line under `label`,
 * so commands running side by side stay readable and none can stop for input.
 */
export const runLabelled = (
  { logger, label }: { logger: Pick<Logger, 'info'>; label: string },
  command: string,
  args: string[],
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
    /**
     * Lead a process group, so stopping it also kills a grandchild holding the
     * pipe. The terminal's Ctrl-C then no longer reaches it: only a caller that
     * calls `stopLabelledRuns` on a signal should ask for this.
     */
    group?: boolean
  }
): Promise<LabelledRun> =>
  new Promise((resolve) => {
    const tail: string[] = []
    if (stopped) return resolve({ ok: false, failure: 'interrupted', tail })
    const onLine = (line: string) => {
      logger.info(`[${label}] ${line}`)
      tail.push(line)
      if (tail.length > TAIL_LINES) tail.shift()
    }
    const lineReader = () => {
      const decoder = new StringDecoder('utf8')
      let pending = ''
      return {
        push(chunk: Buffer) {
          const lines = (pending + decoder.write(chunk)).split('\n')
          pending = lines.pop() ?? ''
          for (const line of lines) onLine(line.trimEnd())
        },
        end() {
          pending += decoder.end()
          if (pending) onLine(pending.trimEnd())
          pending = ''
        },
      }
    }

    const group = !!options.group && process.platform !== 'win32'
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: group,
    })
    running.set(child, group)
    const stdout = lineReader()
    const stderr = lineReader()
    child.stdout.on('data', stdout.push)
    child.stderr.on('data', stderr.push)
    child.on('error', (error) => {
      running.delete(child)
      resolve({ ok: false, failure: error.message, tail })
    })
    child.on('close', (code, signal) => {
      running.delete(child)
      stdout.end()
      stderr.end()
      if (code === 0) return resolve({ ok: true, tail })
      resolve({
        ok: false,
        failure: signal ? `killed by ${signal}` : `exit ${code}`,
        tail,
      })
    })
  })
