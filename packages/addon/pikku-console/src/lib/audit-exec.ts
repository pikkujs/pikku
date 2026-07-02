import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import type { MetaService } from '@pikku/core/services'
import type { SecurityAuditReport } from '@pikku/core'

// Walk up from `searchFrom` for a `node_modules/.bin/<name>` executable,
// falling back to the bare name (resolved via PATH) if none is found.
export function findBin(name: string, searchFrom: string): string {
  let dir = searchFrom
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'node_modules', '.bin', name)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return name
}

// Read + parse `.pikku/audit.json`. Absent or malformed → null (the UI treats
// that as "no report yet"); a parse/read error here is not actionable.
export async function readAuditReport(
  metaService: MetaService
): Promise<SecurityAuditReport | null> {
  try {
    const content = await metaService.readFile('audit.json')
    if (!content) return null
    return JSON.parse(content) as SecurityAuditReport
  } catch {
    return null
  }
}

// Spawn a process, resolving on close. Rejects on a spawn error, on a timeout
// (kills the child so a hung `bun install` can't hang the request forever), and
// — when `failOnNonZero` is set — on a non-zero exit. stderr is captured and
// included in the rejection so failures are diagnosable. `pikku audit` exits
// non-zero when it *finds* advisories yet still writes a valid report, so audit
// runs stay lenient; `bun install` uses failOnNonZero so a real failure surfaces.
export function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  {
    failOnNonZero = false,
    timeoutMs = 5 * 60_000,
  }: { failOnNonZero?: boolean; timeoutMs?: number } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => {
      if (stderr.length < 8192) stderr += d.toString()
    })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(
        new Error(
          `${command} ${args.join(' ')} timed out after ${timeoutMs}ms`
        )
      )
    }, timeoutMs)
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (failOnNonZero && code !== 0) {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed (exit ${code})` +
              (stderr.trim() ? `: ${stderr.trim()}` : '')
          )
        )
      } else {
        resolve()
      }
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

// Re-run `pikku audit --outdated` in the project, regenerating audit.json.
export async function runPikkuAudit(projectDir: string): Promise<void> {
  const pikku = findBin('pikku', projectDir)
  await spawnProcess(process.execPath, [pikku, 'audit', '--outdated'], projectDir)
}
