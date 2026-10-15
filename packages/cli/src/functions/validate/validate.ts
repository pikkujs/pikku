import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { added, changed, dim, removed } from '../../utils/output.js'
import {
  runValidate,
  type ProjectChecksHook,
  type ValidateOptions,
} from './validate-registry.js'

export { readJsonSafe, readTextSafe } from './shared-checks.js'

export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})

export type Finding = z.infer<typeof FindingSchema>

export const ValidateInput = z.object({
  skipTypecheck: z
    .boolean()
    .optional()
    .describe(
      'Skip the frontend type-check stage (structural checks only, much faster)'
    ),
  skipDeployChecks: z
    .boolean()
    .optional()
    .describe(
      'Skip the deploy-readiness checks (hosting conventions: bun-only package manager, themes, migrations layout, frontends)'
    ),
  migrationsBase: z
    .string()
    .optional()
    .describe(
      'Git ref whose migrations are frozen (default origin/main, or $PIKKU_MIGRATIONS_BASE)'
    ),
})

export const ValidateOutput = z.object({
  ok: z.boolean(),
  root: z.string(),
  ran: z.array(
    z.object({
      checkId: z.string(),
      subject: z.string(),
      target: z.string(),
    })
  ),
  findings: z.array(FindingSchema),
})

/**
 * The workspace root, or failing that the package the caller is standing in.
 *
 * A standalone publishable addon has no `workspaces` anywhere above it, and
 * running from its `src/` would otherwise validate `src/` — a directory with no
 * package.json, where every check's precondition is false and the run reports
 * that nothing applied. The addon author is exactly who the addon checks are
 * for, so the nearest package.json is the answer when no workspace claims it.
 */
export async function findProjectRoot(startDir: string): Promise<string> {
  let dir = startDir
  let nearestPackage: string | undefined
  while (true) {
    if (existsSync(join(dir, 'package.json'))) {
      nearestPackage ??= dir
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
    if (parent === dir) return nearestPackage ?? startDir
    dir = parent
  }
}

export async function runProjectValidate(
  startDir = process.cwd(),
  options: ValidateOptions = {}
): Promise<z.infer<typeof ValidateOutput>> {
  const root = await findProjectRoot(startDir)
  return runValidate(root, options)
}

export const PROJECT_CHECKS_SKIPPED = 'project-checks-skipped'

export const guardProjectChecks =
  (hook: ProjectChecksHook): ProjectChecksHook =>
  async (request) => {
    try {
      return await hook(request)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return [
        {
          id: PROJECT_CHECKS_SKIPPED,
          severity: request.deployTarget ? 'error' : 'info',
          message: `the project-aware checks did not run (${reason.split('\n')[0]})`,
          path: request.root,
          fixHint: request.deployTarget
            ? 'A deploy does not go ahead unchecked. Fix the cause above and retry.'
            : 'Only the offline checks ran. Sign in and link the project to include the checks that compare it with its deployed stages.',
        },
      ]
    }
  }

/** "2 addons, 1 app project" — what the run actually looked at. */
function describeRan(ran: z.infer<typeof ValidateOutput>['ran']): string {
  const bySubject = new Map<string, number>()
  for (const entry of ran) {
    bySubject.set(entry.subject, (bySubject.get(entry.subject) ?? 0) + 1)
  }
  return [...bySubject]
    .map(([subject, count]) => `${count} ${subject}${count === 1 ? '' : 's'}`)
    .join(', ')
}

export const renderValidate = (
  _s: unknown,
  { ok, root, ran, findings }: z.infer<typeof ValidateOutput>
): void => {
  // A green tick for a run that checked nothing is the one outcome worth
  // guarding against: auto-detection that finds nothing looks identical to
  // auto-detection that found everything and liked it.
  if (ran.length === 0) {
    console.log(
      changed('⚠') +
        '  ' +
        'Nothing to validate here — no app project and no publishable addon found'
    )
    console.log(
      `   ${dim('fix:')}    Run from a directory with a pikku.config.json, or from a package that publishes generated pikku output.`
    )
    return
  }

  if (findings.length === 0) {
    console.log(added(`✓  All checks passed — checked ${describeRan(ran)}`))
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
  console.log(`${counts.join('  ')}  ${dim(`across ${describeRan(ran)}`)}`)
  if (ok) {
    console.log()
    console.log(added('✓') + '  ' + dim('no errors'))
  }
}
