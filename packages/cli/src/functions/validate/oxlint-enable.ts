import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { z } from 'zod'
import {
  OXLINT_CONFIG_FILES,
  OXLINT_REQUIRED_RULES,
  detectPackageManager,
  findOxlintConfig,
  isError,
  loadProject,
  locateOxlint,
  runOxlintRun,
  runOxlintSetupChecks,
  type OxlintExec,
  type PackageManager,
} from './oxlint-checks.js'

/**
 * Versions `pikku enable oxlint` installs. oxlint 1.86.0 declares the peer
 * `oxlint-tsgolint >=7.0.2003` (`npm view oxlint@1.86.0 peerDependencies`), so
 * the two ranges are chosen together; bump them together.
 */
export const OXLINT_VERSION = '^1.86.0'
export const OXLINT_TSGOLINT_VERSION = '^7.0.2003'

const LINT_SCRIPT = 'oxlint --type-aware'

export const EnableOxlintInput = z.object({
  dryRun: z.boolean().optional(),
})

export const EnableOxlintOutput = z.object({
  ok: z.boolean(),
  dryRun: z.boolean(),
  root: z.string(),
  packageManager: z.string(),
  /** What was done (or, with --dry-run, would be done). */
  actions: z.array(z.string()),
  /** Line diffs of the files touched, only with --dry-run. */
  diffs: z.array(z.object({ file: z.string(), diff: z.string() })),
  /** Problems the command could not fix itself, each with what to do. */
  manual: z.array(z.string()),
  /** Check 1 findings left after the run (id: message). */
  remaining: z.array(z.string()),
  /** Number of oxlint diagnostics in the app source; reported, never fixed. */
  lintFindings: z.number().nullable(),
})
export type EnableOxlintOutput = z.infer<typeof EnableOxlintOutput>

export type InstallFn = (
  command: string,
  args: string[],
  cwd: string
) => Promise<number>

const defaultInstall: InstallFn = (command, args, cwd) =>
  new Promise((done) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.on('error', () => done(127))
    child.on('close', (code) => done(code ?? 1))
  })

const REQUIRED_CONFIG = {
  options: { typeAware: true },
  rules: Object.fromEntries(OXLINT_REQUIRED_RULES.map((r) => [r, 'error'])),
}

/** A config file as it should be written when none exists. */
export const newOxlintConfig = (): Record<string, unknown> => ({
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: ['typescript', 'unicorn', 'oxc'],
  options: { ...REQUIRED_CONFIG.options },
  rules: { ...REQUIRED_CONFIG.rules },
})

export const snippetFor = (): string =>
  JSON.stringify(
    {
      plugins: ['typescript'],
      options: REQUIRED_CONFIG.options,
      rules: REQUIRED_CONFIG.rules,
    },
    null,
    2
  )

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export type MergeResult =
  | { kind: 'merged'; text: string; changed: boolean; warnings: string[] }
  | { kind: 'unsafe'; reason: string }

/**
 * Merge the required settings into the text of a `.oxlintrc.json`, keeping
 * every other key, rule, plugin and override. Returns the original text
 * untouched when nothing needs to change (so a second run is a no-op).
 * Anything that is not plain JSON is `unsafe`: it is never rewritten.
 */
export const mergeOxlintConfig = (text: string): MergeResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      kind: 'unsafe',
      reason: 'it is not plain JSON (comments or trailing commas)',
    }
  }
  if (!isObject(parsed)) {
    return { kind: 'unsafe', reason: 'its top level is not an object' }
  }
  const config = structuredClone(parsed)
  let changed = false
  const warnings: string[] = []

  // plugins: when set it replaces oxlint's defaults, so add to it; when unset
  // `typescript` is already on by default and stays that way.
  if (config.plugins !== undefined) {
    if (!Array.isArray(config.plugins)) {
      return { kind: 'unsafe', reason: '"plugins" is not an array' }
    }
    if (!config.plugins.includes('typescript')) {
      config.plugins.push('typescript')
      changed = true
    }
  }

  if (config.options !== undefined && !isObject(config.options)) {
    return { kind: 'unsafe', reason: '"options" is not an object' }
  }
  const options = (config.options ?? {}) as Record<string, unknown>
  if (options.typeAware !== true) {
    options.typeAware = true
    changed = true
  }
  config.options = options

  if (config.rules !== undefined && !isObject(config.rules)) {
    return { kind: 'unsafe', reason: '"rules" is not an object' }
  }
  const rules = (config.rules ?? {}) as Record<string, unknown>
  for (const rule of OXLINT_REQUIRED_RULES) {
    const current = rules[rule]
    if (current === undefined || !isError(current)) {
      // keep any options the user gave the rule, raise only the level
      rules[rule] = Array.isArray(current)
        ? ['error', ...current.slice(1)]
        : 'error'
      changed = true
    }
    const value = rules[rule]
    if (Array.isArray(value)) {
      for (const o of value.slice(1)) {
        if (isObject(o) && o.checksConditionals === false) {
          delete o.checksConditionals
          changed = true
        }
      }
    }
  }
  config.rules = rules

  if (Array.isArray(config.overrides)) {
    for (const override of config.overrides) {
      if (!isObject(override) || !isObject(override.rules)) continue
      for (const rule of OXLINT_REQUIRED_RULES) {
        const level = override.rules[rule]
        if (level !== undefined && !isError(level)) {
          warnings.push(
            `an override for ${JSON.stringify(override.files ?? [])} lowers ${rule}; left as is, remove it`
          )
        }
      }
    }
  }

  if (!changed) return { kind: 'merged', text, changed: false, warnings }
  return {
    kind: 'merged',
    text: JSON.stringify(config, null, 2) + '\n',
    changed: true,
    warnings,
  }
}

/** Naive line diff: enough to read a plan, not a patch. */
export const lineDiff = (before: string, after: string): string => {
  const a = before.split('\n')
  const b = after.split('\n')
  const inA = new Set(a)
  const inB = new Set(b)
  return [
    ...a.filter((l) => !inB.has(l)).map((l) => `- ${l}`),
    ...b.filter((l) => !inA.has(l)).map((l) => `+ ${l}`),
  ].join('\n')
}

/**
 * The script to write for `scripts.lint`, or undefined to leave it. A missing
 * one becomes `oxlint --type-aware`; an oxlint one without `--type-aware` gets
 * the flag, but only when the config does not already set `typeAware`.
 */
export const fixLintScript = (
  current: unknown,
  configSetsTypeAware: boolean
): string | undefined => {
  if (current === undefined) return LINT_SCRIPT
  if (typeof current !== 'string') return undefined
  if (configSetsTypeAware) return undefined
  if (!/\boxlint\b/.test(current) || current.includes('--type-aware')) {
    return undefined
  }
  return current.replace(/\boxlint\b/, 'oxlint --type-aware')
}

export const installArgs = (
  pm: PackageManager,
  installDir: string,
  names: string[]
): string[] => {
  if (names.length === 0) return ['install']
  if (pm === 'npm') return ['install', '-D', ...names]
  if (pm === 'pnpm') {
    const workspace = existsSync(join(installDir, 'pnpm-workspace.yaml'))
    return ['add', '-D', ...(workspace ? ['-w'] : []), ...names]
  }
  return ['add', pm === 'yarn' ? '-D' : '-d', ...names]
}

type PackageJson = Record<string, unknown> & {
  scripts?: Record<string, unknown>
}

export const runEnableOxlint = async (
  root: string,
  {
    dryRun = false,
    install = defaultInstall,
    exec,
  }: { dryRun?: boolean; install?: InstallFn; exec?: OxlintExec } = {}
): Promise<EnableOxlintOutput> => {
  const out: EnableOxlintOutput = {
    ok: true,
    dryRun,
    root,
    packageManager: 'bun',
    actions: [],
    diffs: [],
    manual: [],
    remaining: [],
    lintFindings: null,
  }
  const rel = (p: string) => relative(root, p) || '.'
  const project = await loadProject(root)
  if (!project) {
    out.ok = false
    out.manual.push(`no pikku.config.json in ${root}: run from a pikku app`)
    return out
  }
  const pm = detectPackageManager(project.installDir)
  out.packageManager = pm
  const pkgPath = join(project.installDir, 'package.json')

  // 1. dependencies
  const located = await locateOxlint(project)
  const missing = (['oxlint', 'oxlint-tsgolint'] as const).filter(
    (n) => !located.declared[n]
  )
  const notInstalled = !located.bin || !located.tsgolintInstalled
  let installNames: string[] = []
  let doInstall = false
  if (missing.length > 0) {
    installNames = missing.map(
      (n) => `${n}@${n === 'oxlint' ? OXLINT_VERSION : OXLINT_TSGOLINT_VERSION}`
    )
    doInstall = true
    out.actions.push(
      `devDependencies ${rel(pkgPath)}: add ${installNames.join(' ')} (${pm})`
    )
  } else if (notInstalled) {
    doInstall = true
    out.actions.push(
      `install: declared but missing from node_modules (${pm} install)`
    )
  } else {
    out.actions.push(
      'dependencies: oxlint and oxlint-tsgolint already installed'
    )
  }

  // 2. config
  const existing = findOxlintConfig(project)
  let configSetsTypeAware = false
  const writes: Array<{ file: string; before: string; after: string }> = []
  if (!existing) {
    const file = join(project.installDir, OXLINT_CONFIG_FILES[0])
    const after = JSON.stringify(newOxlintConfig(), null, 2) + '\n'
    writes.push({ file, before: '', after })
    configSetsTypeAware = true
    out.actions.push(`config: create ${rel(file)}`)
  } else if (existing.file.endsWith('.oxlintrc.json')) {
    const before = await readFile(existing.file, 'utf8')
    const merged = mergeOxlintConfig(before)
    if (merged.kind === 'unsafe') {
      out.ok = false
      out.manual.push(
        `cannot edit ${rel(existing.file)} safely: ${merged.reason}. Merge this into it by hand:\n${snippetFor()}`
      )
    } else {
      configSetsTypeAware = true
      out.manual.push(...merged.warnings)
      if (merged.changed) {
        writes.push({ file: existing.file, before, after: merged.text })
        out.actions.push(`config: update ${rel(existing.file)}`)
      } else {
        out.actions.push(`config: ${rel(existing.file)} already complete`)
      }
    }
  } else {
    out.ok = false
    out.manual.push(
      `cannot edit ${rel(existing.file)} safely: only .oxlintrc.json is rewritten. Add this to it by hand (plugins, options.typeAware, rules):\n${snippetFor()}`
    )
  }

  // 3. lint script
  const pkgText = existsSync(pkgPath) ? await readFile(pkgPath, 'utf8') : null
  let pkgAfter: string | undefined
  if (pkgText) {
    const pkg = JSON.parse(pkgText) as PackageJson
    const next = fixLintScript(pkg.scripts?.lint, configSetsTypeAware)
    if (next !== undefined) {
      pkg.scripts = { ...pkg.scripts, lint: next }
      pkgAfter = JSON.stringify(pkg, null, 2) + '\n'
      out.actions.push(`script: ${rel(pkgPath)} lint = "${next}"`)
    } else if (
      typeof pkg.scripts?.lint === 'string' &&
      !/\boxlint\b/.test(pkg.scripts.lint)
    ) {
      out.manual.push(
        `scripts.lint is "${pkg.scripts.lint}", not oxlint: left unchanged; run \`oxlint --type-aware\` alongside it`
      )
    }
  }

  if (dryRun) {
    for (const w of writes) {
      out.diffs.push({ file: rel(w.file), diff: lineDiff(w.before, w.after) })
    }
    if (pkgAfter && pkgText) {
      out.diffs.push({
        file: rel(pkgPath),
        diff: lineDiff(pkgText, pkgAfter),
      })
    }
    return out
  }

  for (const w of writes) await writeFile(w.file, w.after, 'utf8')

  // The package manager rewrites package.json itself when it adds, so the
  // script edit goes in first and the add merges into it.
  if (pkgAfter) await writeFile(pkgPath, pkgAfter, 'utf8')

  if (doInstall) {
    const args = installArgs(pm, project.installDir, installNames)
    const code = await install(pm, args, project.installDir)
    if (code !== 0) {
      out.ok = false
      out.manual.push(
        `install failed (exit ${code}): run \`${pm} ${args.join(' ')}\` in ${rel(project.installDir)}`
      )
    }
  }

  // 4. re-check
  const findings = await runOxlintSetupChecks(root, exec)
  out.remaining = findings
    .filter((f) => f.severity !== 'info')
    .map((f) => `${f.id}: ${f.message}`)
  if (out.remaining.length > 0) out.ok = false
  if (!findings.some((f) => f.id === 'oxlint-not-installed')) {
    const run = await runOxlintRun(root, exec)
    out.lintFindings = run.filter(
      (f) => f.id.startsWith('oxlint-') && f.severity !== 'info'
    ).length
  }
  return out
}

export const renderEnableOxlint = (
  _s: unknown,
  o: EnableOxlintOutput
): void => {
  console.log(
    `enable oxlint: ${o.ok ? 'ok' : 'incomplete'}${o.dryRun ? ' (dry run, nothing written)' : ''} root=${o.root} pm=${o.packageManager}`
  )
  for (const a of o.actions) console.log(`${o.dryRun ? 'plan' : 'done'}: ${a}`)
  for (const d of o.diffs) console.log(`diff ${d.file}\n${d.diff}`)
  for (const m of o.manual) console.log(`manual: ${m}`)
  for (const r of o.remaining) console.log(`remaining: ${r}`)
  if (o.lintFindings !== null) {
    console.log(
      `lint: ${o.lintFindings} oxlint finding(s) in app source, not fixed (run \`pikku validate\` to list them)`
    )
  }
  if (!o.ok) process.exitCode = 1
}
