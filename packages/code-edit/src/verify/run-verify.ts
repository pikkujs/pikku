import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { codegenFindings, resolvePikkuCli } from './codegen.js'
import {
  ownerDir,
  readVerifyProject,
  relativeTo,
  workspacePackageDirs,
  type VerifyFrontend,
  type VerifyProject,
} from './project.js'
import { datalessDetailRoutes, orphanedChildRoutes } from './route-checks.js'
import {
  brokenMessageCatalogs,
  I18N_GATE_TSCONFIG,
  jsxLiteralProps,
  asI18nArguments,
  asI18nStubs,
  sepArguments,
  jsxLiteralText,
  staleTableZod,
  stringLiteralCopy,
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
  /** Helper calls whose string arguments are user-facing copy (default: say, toast, notify). */
  copyHelpers?: string[]
  /**
   * Release mode. Every `asI18nStub` call is a warning while prototyping and an error here.
   */
  strict?: boolean
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

/** The static source checks: generated-schema drift, route wiring and i18n copy. Cheap, so they run before anything is spawned. */
export function runStaticChecks(
  project: VerifyProject,
  options: { copyHelpers?: readonly string[]; strict?: boolean } = {}
): VerifyFinding[] {
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
  }

  const ignored = (file: string): boolean => {
    const rel = relative(project.workspaceRoot, file)
    return project.i18nIgnore.some((p) => rel === p || rel.startsWith(`${p}/`))
  }
  const packageDirs = workspacePackageDirs(project.workspaceRoot)
  /** A nested package's files are checked under that package's own rules (its own gate), not its parent's. */
  const owned = (dir: string, file: string) =>
    ownerDir(packageDirs, file) === dir
  for (const dir of packageDirs) {
    for (const hit of jsxLiteralText(dir)) {
      if (ignored(hit.file) || !owned(dir, hit.file)) continue
      findings.push({
        id: 'jsx-literal-text',
        severity: 'warn',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `Hardcoded text in JSX: "${hit.text}"`,
        hint: 'Move the text into a message key and render `{m.your_key()}`, so it can be translated. Separators (`·`, `—`, `…`) are fine as they are. Copy in props is checked by jsx-literal-prop.',
      })
    }
    for (const hit of asI18nArguments(dir)) {
      if (ignored(hit.file) || !owned(dir, hit.file)) continue
      findings.push({
        id: 'as-i18n-argument',
        severity: 'error',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `${at(hit.file)}:${hit.line} passes ${hit.kind} to asI18n: ${hit.text}`,
        hint: 'pass a variable that already holds outside data; for your own copy add a message key and call m.<key>()',
      })
    }
    for (const hit of sepArguments(dir)) {
      if (ignored(hit.file) || !owned(dir, hit.file)) continue
      findings.push({
        id: 'sep-argument',
        severity: 'error',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `${at(hit.file)}:${hit.line} sep() argument is ${hit.reason}: ${hit.text}`,
        hint: 'sep() takes a literal of whitespace, punctuation and symbols only (for example " · " or "/"). Words, digits and anything that changes by language belong in a message key, m.<key>(), or Intl.ListFormat.',
      })
    }
    for (const hit of asI18nStubs(dir)) {
      if (ignored(hit.file) || !owned(dir, hit.file)) continue
      findings.push({
        id: 'i18n-stub',
        severity: options.strict ? 'error' : 'warn',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `${at(hit.file)}:${hit.line} asI18nStub("${hit.copy}") — fixture text; productise before release`,
        hint: 'Works in dev. Replace it with real data (asI18n(variable)) or a message key (m.<key>()) before release.',
      })
    }
    for (const hit of stringLiteralCopy(dir, {
      copyHelpers: options.copyHelpers,
    })) {
      if (ignored(hit.file) || !owned(dir, hit.file)) continue
      findings.push({
        id: 'string-literal-copy',
        severity: options.strict ? 'error' : 'warn',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `${at(hit.file)}:${hit.line} "${hit.text.slice(0, 60)}" — English outside JSX; use m.<key>() or asI18n(variable)`,
        hint: 'Text a person reads belongs in a message key (m.<key>()), or comes from outside data wrapped with asI18n(variable). Keys, ids, paths, class names and internal error messages are fine as they are; if this is one of those, add the folder to i18n.ignore.',
      })
    }
    for (const hit of jsxLiteralProps(dir, {
      helpers: options.copyHelpers,
    })) {
      if (ignored(hit.file) || !owned(dir, hit.file)) continue
      findings.push({
        id: 'jsx-literal-prop',
        severity: 'warn',
        step: 'checks',
        file: at(hit.file),
        line: hit.line,
        message: `Hardcoded copy in ${hit.via === 'child' ? 'a JSX child expression' : hit.via.endsWith('()') ? `a ${hit.via} call` : `the ${hit.via} prop`}: "${hit.text}"`,
        hint: 'Move the text into a message key and pass `m.your_key()` (with params for the parts that vary), so it can be translated. Class names, ids, links and code samples are fine as they are.',
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

  const checks = await timed(async () =>
    runStaticChecks(project, {
      copyHelpers: options.copyHelpers,
      strict: options.strict,
    })
  )
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

  /**
   * The DOM-types gate (`@pikku/react/i18n-jsx`): a frontend that has a `tsconfig.i18n.json` is also compiled
   * with it, and each error becomes an `i18n-gate` finding. No config file, no step. Errors the plain
   * type-check already reported are not repeated.
   */
  const known = new Set<string>()
  const i18nGate = async (gateDir: string, target: string) => {
    const gateTarget = `${target} (${I18N_GATE_TSCONFIG})`
    const { value, durationMs } = await timed(() =>
      runTypecheck(
        join(gateDir, I18N_GATE_TSCONFIG),
        gateDir,
        project.workspaceRoot,
        options.typecheckTimeoutMs ?? 180_000
      )
    )
    // one finding per file:line:code, whichever program (or earlier step) reported it first
    const key = (f: VerifyFinding) => `${f.file}:${f.line}:${f.code}`
    for (const f of findings) if (f.line !== undefined) known.add(key(f))
    const found = value.result.diagnostics
      .filter((d) => d.category === 'error')
      .map((d): VerifyFinding => ({
        id: 'i18n-gate',
        severity: 'error',
        step: 'frontend-typecheck',
        code: `TS${d.code}`,
        message: d.message,
        ...(d.line > 0
          ? {
              file: relativeTo(
                project.rootDir,
                join(project.workspaceRoot, d.file)
              ),
              line: d.line,
            }
          : {}),
        hint: 'Text shown to a person must go through i18n: put it in a message key and render `m.your_key()`, or wrap a value that comes from outside with `asI18n(value)`. A third-party component that takes plain text is outside this check.',
      }))
      .filter((f) => {
        if (f.line === undefined) return true
        const k = key(f)
        if (known.has(k)) return false
        known.add(k)
        return true
      })
    findings.push(...found)
    const ok = value.run.status === 0
    if (!ok && value.result.diagnostics.length === 0) {
      findings.push({
        id: value.run.timedOut ? 'typecheck-timeout' : 'i18n-gate',
        severity: 'error',
        step: 'frontend-typecheck',
        message: value.run.timedOut
          ? `The i18n gate of ${target} did not finish in time.`
          : value.run.error?.message ||
            tail(value.run) ||
            `tsc exited ${value.run.status}`,
      })
    }
    add('frontend-typecheck', ok, durationMs, { target: gateTarget })
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
      if (existsSync(join(app.dir, I18N_GATE_TSCONFIG))) {
        await i18nGate(app.dir, target)
      }
    }
  }

  /**
   * Library packages (`packages/*`, `packages/addons/*`, ...) that carry their own `tsconfig.i18n.json` are
   * gated too, so a block library is checked on its own and not only through the app that imports it.
   * Three programs at a time. An error two programs both report is one finding (`known`).
   */
  if (options.frontends !== false && codegenOk) {
    const declared = new Set(project.frontends.map((f) => f.dir))
    const extra = workspacePackageDirs(project.workspaceRoot).filter(
      (d) => !declared.has(d) && existsSync(join(d, I18N_GATE_TSCONFIG))
    )
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(3, extra.length) }, async () => {
        while (next < extra.length) {
          const dir = extra[next++]!
          await i18nGate(dir, relativeTo(project.workspaceRoot, dir))
        }
      })
    )
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
