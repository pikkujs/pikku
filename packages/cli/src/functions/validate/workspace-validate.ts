import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import { runSharedProjectChecks } from './shared-checks.js'

export { readJsonSafe, readTextSafe } from './shared-checks.js'

export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})

export type Finding = z.infer<typeof FindingSchema>

export const WorkspaceValidateInput = z.object({})

export const WorkspaceValidateOutput = z.object({
  ok: z.boolean(),
  root: z.string(),
  findings: z.array(FindingSchema),
})

export async function findProjectRoot(startDir: string): Promise<string> {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(
          await readFile(join(dir, 'package.json'), 'utf8')
        ) as { workspaces?: unknown }
        if (pkg.workspaces) return dir
      } catch {
        // ignore parse errors
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

export async function runWorkspaceValidate(
  startDir = process.cwd()
): Promise<z.infer<typeof WorkspaceValidateOutput>> {
  const root = await findProjectRoot(startDir)
  const { findings } = await runSharedProjectChecks(root)
  const ok = !findings.some((f) => f.severity === 'error')
  return { ok, root, findings }
}

export const renderWorkspaceValidate = (
  _s: unknown,
  { ok, root, findings }: z.infer<typeof WorkspaceValidateOutput>
): void => {
  if (findings.length === 0) {
    console.log(added('✓  All checks passed — workspace is Pikku-compatible'))
    return
  }

  const relPath = (p: string): string =>
    p.startsWith(root + '/') || p.startsWith(root + '\\')
      ? p.slice(root.length + 1)
      : p

  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')
  const infos = findings.filter((f) => f.severity === 'info')

  for (const f of [...errors, ...warns, ...infos]) {
    const icon =
      f.severity === 'error'
        ? removed('✗')
        : f.severity === 'warn'
          ? changed('⚠')
          : dim('ℹ')
    console.log(`${icon}  ${f.message}`)
    console.log(`   ${dim('path:')}   ${relPath(f.path)}`)
    console.log(`   ${dim('fix:')}    ${f.fixHint}`)
    console.log()
  }

  const counts: string[] = []
  if (errors.length) {
    counts.push(
      removed(`${errors.length} error${errors.length !== 1 ? 's' : ''}`)
    )
  }
  if (warns.length) {
    counts.push(
      changed(`${warns.length} warning${warns.length !== 1 ? 's' : ''}`)
    )
  }
  if (infos.length) {
    counts.push(dim(`${infos.length} info${infos.length !== 1 ? 's' : ''}`))
  }

  console.log('─'.repeat(40))
  console.log(counts.join('  '))
  if (ok) {
    console.log()
    console.log(
      added('✓') + '  ' + dim('no errors — workspace is structurally sound')
    )
  }
}
