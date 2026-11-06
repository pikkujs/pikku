import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LOCKFILE_TOOLS: Array<[string, string]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
]

const packageTool = (dir: string): string => {
  for (let at = dir; dirname(at) !== at; at = dirname(at)) {
    for (const [file, tool] of LOCKFILE_TOOLS) {
      if (existsSync(join(at, file))) return tool
    }
  }
  return 'npm'
}

/** Runs a package.json script; resolves to why it failed, or null. */
export const runScript = (
  dir: string,
  script: string,
  timeoutMs?: number
): Promise<string | null> =>
  new Promise((resolve) => {
    const child = spawn(packageTool(dir), ['run', script], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const keep = (chunk: Buffer) => {
      output = (output + chunk).slice(-2000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const timer = timeoutMs
      ? setTimeout(() => child.kill('SIGKILL'), timeoutMs)
      : undefined
    child.once('error', (error) => resolve(error.message))
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve(
        code === 0 ? null : `${signal ?? `exit ${code}`}\n${output.trim()}`
      )
    })
  })
