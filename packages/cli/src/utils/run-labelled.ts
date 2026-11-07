import { spawn } from 'node:child_process'
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

/**
 * Run a command with no shell and no stdin, printing each line under `label`,
 * so commands running side by side stay readable and none can stop for input.
 */
export const runLabelled = (
  { logger, label }: { logger: Pick<Logger, 'info'>; label: string },
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): Promise<LabelledRun> =>
  new Promise((resolve) => {
    const tail: string[] = []
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

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = lineReader()
    const stderr = lineReader()
    child.stdout.on('data', stdout.push)
    child.stderr.on('data', stderr.push)
    child.on('error', (error) =>
      resolve({ ok: false, failure: error.message, tail })
    )
    child.on('close', (code, signal) => {
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
