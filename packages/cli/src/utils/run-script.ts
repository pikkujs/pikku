import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const LOCKFILE_TOOLS: Array<[string, string]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
]

/** The tool whose lockfile is nearest `dir`, so a nested npm app is not run with its parent's pnpm. */
export const packageTool = (dir: string): string => {
  for (let at = dir; dirname(at) !== at; at = dirname(at)) {
    for (const [file, tool] of LOCKFILE_TOOLS) {
      if (existsSync(join(at, file))) return tool
    }
  }
  return 'npm'
}

const WINDOWS = process.platform === 'win32'

/** Runs a package.json script; resolves to why it failed, or null. */
export const runScript = (
  dir: string,
  script: string,
  timeoutMs?: number
): Promise<string | null> =>
  new Promise((resolve) => {
    // npm, pnpm and yarn are `.cmd` shims on Windows, which only a shell starts.
    // The script name is one of ours, never user input, so nothing is quoted.
    // Its own process group elsewhere, so a timeout reaches what npm started.
    const child = spawn(packageTool(dir), ['run', script], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: WINDOWS,
      detached: !WINDOWS,
    })
    let output = ''
    const keep = (chunk: Buffer) => {
      output = (output + chunk).slice(-2000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    const kill = () => {
      if (WINDOWS) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
        }).once('error', () => child.kill('SIGKILL'))
        return
      }
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }
    const timer = timeoutMs ? setTimeout(kill, timeoutMs) : undefined
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve(error.message)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve(
        code === 0 ? null : `${signal ?? `exit ${code}`}\n${output.trim()}`
      )
    })
  })
