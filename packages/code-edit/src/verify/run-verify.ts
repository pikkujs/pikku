import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { codegenFindings, resolvePikkuCli } from './codegen.js'
import {
  readVerifyProject,
  relativeTo,
  type VerifyFrontend,
  type VerifyProject,
} from './project.js'
import { datalessDetailRoutes, orphanedChildRoutes } from './route-checks.js'
import {
  asI18nMisuse,
  brokenMessageCatalogs,
  staleTableZod,
} from './source-checks.js'
import { runTypecheck, spawnBounded, type SpawnResult } from './tsc.js'
import { tscFindings, type TscRuleScope } from './tsc-rules.js'
import type {
  VerifyFinding,
  VerifyResult,
  VerifyStep,
  VerifyStepId,
} from './types.js'

export type RunVerifyOptions = {
  rootDir: string
  codegen?: boolean
  typecheck?: boolean
  frontends?: boolean
  pikkuCli?: string
  record?: boolean
  codegenTimeoutMs?: number
  typecheckTimeoutMs?: number
}

const tail = (run: SpawnResult, lines = 20): string =>
  `${run.stdout}\n${run.stderr}`
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines)
    .join('\n')

/** The static source checks: generated-schema drift, route wiring and i18n misuse. Cheap, so they run before anything is spawned. */
export function runStaticChecks(project: VerifyProject): VerifyFinding[] {
  const at = (file: string) => relativeTo(project.rootDir, file)
  const findings: VerifyFinding[] = []

  for (const hit of staleTableZod(project.srcDirectories, project.outDir) ??
    []) {
    findings.push({
      id: 'stale-table-zod',
      severity: 'error',
      step: 'checks',
      file: at(hit.file),
      line: hit.line,
      message: `\`${hit.name}\` is imported from the generated table schemas, which do not export it, so it resolves to \`any\`.`,
      hint: 'The migrations are newer than the generated schemas: regenerate them from the migration files with `pikku db codegen`, or write the migration that creates this table.',
    })
  }

  for (const app of project.frontends) {
    const routesDir = join(app.dir, 'src', 'routes')
    for (const orphan of orphanedChildRoutes(routesDir)) {
      findings.push({
        id: 'orphaned-child-route',
        severity: 'error',
        step: 'checks',
        file: at(join(routesDir, orphan.parent)),
        message: `${orphan.parent} renders no <Outlet />, so its child routes (${orphan.children.join(', ')}) never mount.`,
        hint: 'Render <Outlet /> in the parent, or rename the parent to `<name>.index.tsx` so the children stop nesting under it.',
      })
    }
    for (const file of datalessDetailRoutes(routesDir)) {
      findings.push({
        id: 'dataless-detail-route',
        severity: 'warn',
        step: 'checks',
        file: at(join(routesDir, file)),
        message: `${file} is a detail route but neither it nor the page it imports loads any data.`,
        hint: 'A `$param` route exists to show one record: query it with the route param.',
      })
    }
    for (const hit of asI18nMisuse(join(app.dir, 'src'))) {
      findings.push({
        id: 'as-i18n-misuse',
        severity: 'warn',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `asI18n wraps a message or a template literal: ${hit.text}`,
        hint: '`m.*()` is already an I18nString, so drop the wrapper. A template literal hides hardcoded copy: move it into a message key with params. asI18n is only for opaque runtime values.',
      })
    }
  }
  return findings
}

const timed = async <T>(
  run: () => Promise<T>
): Promise<{ value: T; durationMs: number }> => {
  const startedAt = Date.now()
  const value = await run()
  return { value, durationMs: Date.now() - startedAt }
}

/** Codegen, the backend and frontend type-checks and the static checks over one pikku project, as structured findings. */
export async function runVerify(
  options: RunVerifyOptions
): Promise<VerifyResult> {
  const startedAt = new Date()
  const project = readVerifyProject(options.rootDir)
  const steps: VerifyStep[] = []
  const findings: VerifyFinding[] = []
  const add = (
    id: VerifyStepId,
    ok: boolean,
    durationMs: number,
    extra: Partial<VerifyStep> = {}
  ) => steps.push({ id, ok, durationMs, ...extra })

  const checks = await timed(async () => runStaticChecks(project))
  findings.push(...checks.value)
  add(
    'checks',
    !checks.value.some((f) => f.severity === 'error'),
    checks.durationMs
  )

  let codegenOk = true
  if (options.codegen === false) {
    add('codegen', true, 0, { skipped: 'disabled' })
  } else {
    const cli = options.pikkuCli ?? resolvePikkuCli(project.rootDir)
    if (!cli) {
      add('codegen', true, 0, { skipped: '@pikku/cli is not installed' })
    } else {
      const { value: run, durationMs } = await timed(() =>
        spawnBounded(
          process.execPath,
          [cli, 'all', '--json'],
          project.rootDir,
          options.codegenTimeoutMs ?? 180_000
        )
      )
      codegenOk = run.status === 0
      const found = codegenFindings(run.stderr).map((f) =>
        f.file ? { ...f, file: relativeTo(project.rootDir, f.file) } : f
      )
      findings.push(...found)
      if (!codegenOk && !found.some((f) => f.severity === 'error')) {
        findings.push({
          id: run.timedOut ? 'codegen-timeout' : 'codegen',
          severity: 'error',
          step: 'codegen',
          message: run.timedOut
            ? 'Codegen did not finish in time.'
            : run.error?.message ||
              tail(run) ||
              `pikku all exited ${run.status}`,
        })
      }
      add('codegen', codegenOk, durationMs)
    }
  }

  const typecheck = async (
    step: VerifyStepId,
    scope: TscRuleScope,
    tsconfig: string,
    cwd: string,
    target: string
  ) => {
    const { value, durationMs } = await timed(() =>
      runTypecheck(
        tsconfig,
        cwd,
        project.workspaceRoot,
        options.typecheckTimeoutMs ?? 180_000
      )
    )
    const locate = (file: string) =>
      relativeTo(project.rootDir, join(project.workspaceRoot, file))
    const found = tscFindings(value.result.diagnostics, scope, step, locate)
    findings.push(...found)
    const ok = value.run.status === 0
    if (!ok && found.length === 0) {
      findings.push({
        id: value.run.timedOut ? 'typecheck-timeout' : 'typecheck',
        severity: 'error',
        step,
        message: value.run.timedOut
          ? `The type-check of ${target} did not finish in time.`
          : value.run.error?.message ||
            tail(value.run) ||
            `tsc exited ${value.run.status}`,
      })
    }
    add(step, ok, durationMs, { target })
  }

  if (options.typecheck === false) {
    add('typecheck', true, 0, { skipped: 'disabled' })
  } else if (!codegenOk) {
    add('typecheck', false, 0, { skipped: 'codegen failed' })
  } else {
    await typecheck(
      'typecheck',
      'backend',
      project.tsconfig,
      project.rootDir,
      relativeTo(project.workspaceRoot, project.rootDir) || '.'
    )
  }

  const frontendTarget = (app: VerifyFrontend) =>
    relativeTo(project.workspaceRoot, app.dir)
  for (const app of options.frontends === false ? [] : project.frontends) {
    const target = frontendTarget(app)
    const broken = brokenMessageCatalogs(app.dir)
    for (const catalog of broken) {
      findings.push({
        id: 'broken-message-catalog',
        severity: 'error',
        step: 'frontend-typecheck',
        file: relativeTo(project.rootDir, catalog.file),
        message: `Message catalog is not valid JSON: ${catalog.error}`,
        hint: 'Paraglide keeps serving the last good compile of a catalog that does not parse, so every key added since reads as missing. Fix the JSON first.',
      })
    }
    if (broken.length > 0) {
      add('frontend-typecheck', false, 0, {
        target,
        skipped: 'message catalog does not parse',
      })
    } else if (!codegenOk) {
      add('frontend-typecheck', false, 0, {
        target,
        skipped: 'codegen failed',
      })
    } else {
      await typecheck(
        'frontend-typecheck',
        'frontend',
        join(app.dir, 'tsconfig.json'),
        app.dir,
        target
      )
    }
  }

  const result: VerifyResult = {
    ok:
      steps.every((s) => s.ok) && !findings.some((f) => f.severity === 'error'),
    rootDir: project.rootDir,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    steps,
    findings,
  }
  if (options.record !== false) await recordVerifyResult(project, result)
  return result
}

const lastRunPath = (project: VerifyProject) =>
  join(project.outDir, 'verify', 'last-run.json')

/** Writes a run where `readLastVerifyResult` finds it, so a CLI run and the console share one latest result. */
export async function recordVerifyResult(
  project: VerifyProject,
  result: VerifyResult
): Promise<void> {
  await mkdir(join(project.outDir, 'verify'), { recursive: true })
  await writeFile(lastRunPath(project), JSON.stringify(result, null, 2))
}

/** The most recent recorded verify run for this project, or null when none was recorded. */
export async function readLastVerifyResult(
  rootDir: string
): Promise<VerifyResult | null> {
  try {
    return JSON.parse(
      await readFile(lastRunPath(readVerifyProject(rootDir)), 'utf8')
    ) as VerifyResult
  } catch {
    return null
  }
}
