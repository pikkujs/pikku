import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ValidateFinding } from './virtual-user-checks.js'
import { applyRuleSeverity } from './rule-severity.js'

/**
 * Rules `pikku validate` insists are on, at `error`, with type information.
 *
 * Webhook verification helpers are async. A caller that forgets `await` holds a
 * truthy Promise, so `if (!verify(sig)) reject()` accepts every request and
 * `tsc` does not flag the `!` form. These two rules (type-aware, so they need
 * `oxlint-tsgolint`) flag every shape of it: a negated or `&&`-ed promise, a
 * promise stored then branched on, and a bare un-awaited call.
 *
 * `no-empty` reports an empty `catch {}`, which turns a real failure into
 * "nothing happened". A comment inside the block is how a deliberate one says so.
 */
export const OXLINT_REQUIRED_RULES = [
  'typescript/no-misused-promises',
  'typescript/no-floating-promises',
  'no-empty',
] as const

type RequiredRule = (typeof OXLINT_REQUIRED_RULES)[number]

/** A rule option that keeps the rule on while switching off the case it is required for. */
export const DEFEATING_OPTIONS: Partial<
  Record<RequiredRule, { option: string; value: boolean; consequence: string }>
> = {
  'typescript/no-misused-promises': {
    option: 'checksConditionals',
    value: false,
    consequence: '`if (!verify(sig))` is not reported',
  },
  'no-empty': {
    option: 'allowEmptyCatch',
    value: true,
    consequence: 'an empty `catch {}` is not reported',
  },
}

/** A `no-restricted-imports` path: the whole module, or only the named exports. */
export type RestrictedPath = { name: string; importNames?: string[] }

/** A `no-restricted-properties` entry: `object.property`. */
export type RestrictedProperty = { object: string; property: string }

const FS_MODULES = [
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'fs-extra',
  'graceful-fs',
]

const CHILD_PROCESS_MODULES = [
  'child_process',
  'node:child_process',
  'execa',
  'cross-spawn',
  'shelljs',
]

const CLI_PARSER_MODULES = ['commander', 'yargs', 'minimist']

export type PolicyKey =
  | 'enforceContentService'
  | 'enforceVariablesService'
  | 'enforceSupervisor'
  | 'enforceCliCommands'
export type PolicyLevel = 'off' | 'warn' | 'error'
export type PolicyLevels = Record<PolicyKey, PolicyLevel>

const restrictedImports = (paths: RestrictedPath[], message: string) => [
  'error',
  {
    paths: paths.map((p) => ({ ...p, allowTypeImports: true, message })),
  },
]

/**
 * Objects that reach the runtime globals. oxlint 1.88.0 matches a bare
 * `{ object, property }` only, never a dotted object, so `globalThis.process`
 * is restricted as the property `process` of `globalThis`.
 */
const GLOBAL_OBJECTS = ['globalThis', 'global', 'self']
const viaGlobals = (property: string): RestrictedProperty[] =>
  GLOBAL_OBJECTS.map((object) => ({ object, property }))

const restrictedProperties = (
  properties: RestrictedProperty[],
  message: string
) => ['error', ...properties.map((p) => ({ ...p, message }))]

/**
 * Rules a `pikku.config.json` `lint` key requires while it is not `'off'`.
 * Unlike OXLINT_REQUIRED_RULES these may be relaxed per file through
 * `overrides`: tests, bootstrap and tooling legitimately read the disk, the
 * environment and the command line. Several keys share `no-restricted-imports`
 * and `no-restricted-properties`; `activePolicyRules` merges their entries.
 */
export const OXLINT_POLICY_RULES: Record<
  PolicyKey,
  { use: string; rules: Record<string, unknown> }
> = {
  enforceContentService: {
    use: 'the `content` service, which is keyed, project-scoped, and signs reads and writes',
    rules: {
      'no-restricted-imports': restrictedImports(
        FS_MODULES.map((name) => ({ name })),
        'Use the `content` service: keyed, project-scoped, with signed reads and writes.'
      ),
      'typescript/no-require-imports': 'error',
    },
  },
  enforceVariablesService: {
    use: 'the `variables` service for values and the `secrets` service for secrets',
    rules: {
      'no-restricted-properties': restrictedProperties(
        [{ object: 'process', property: 'env' }, ...viaGlobals('process')],
        'Use the `variables` service for values and the `secrets` service for secrets.'
      ),
    },
  },
  enforceSupervisor: {
    use: 'the Supervisor, which owns child processes, their lifecycle and their output',
    rules: {
      'no-restricted-imports': restrictedImports(
        CHILD_PROCESS_MODULES.map((name) => ({ name })),
        'Run processes through the Supervisor, not child_process.'
      ),
      'typescript/no-require-imports': 'error',
      'no-restricted-properties': restrictedProperties(
        [
          { object: 'Bun', property: 'spawn' },
          { object: 'Bun', property: 'spawnSync' },
          { object: 'Bun', property: '$' },
          ...viaGlobals('Bun'),
        ],
        'Run processes through the Supervisor, not Bun.spawn.'
      ),
    },
  },
  enforceCliCommands: {
    use: 'a `pikku` CLI command, which receives typed input instead of reading argv',
    rules: {
      'no-restricted-imports': restrictedImports(
        [
          ...CLI_PARSER_MODULES.map((name) => ({ name })),
          { name: 'node:util', importNames: ['parseArgs'] },
          { name: 'util', importNames: ['parseArgs'] },
        ],
        'Expose a `pikku` CLI command rather than parsing argv.'
      ),
      'no-restricted-properties': restrictedProperties(
        [
          { object: 'process', property: 'argv' },
          { object: 'Bun', property: 'argv' },
          { object: 'Deno', property: 'args' },
          ...viaGlobals('process'),
          ...viaGlobals('Bun'),
          ...viaGlobals('Deno'),
        ],
        'Expose a `pikku` CLI command rather than reading argv.'
      ),
    },
  },
}

export const OXLINT_TEST_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
]

/** Entry points and tooling, where the policy rules are off in the config `pikku enable oxlint` writes. */
export const OXLINT_BOOTSTRAP_FILES = [
  '**/start.ts',
  '**/server.ts',
  '**/bin/**',
  '**/scripts/**',
]

export const OXLINT_EXEMPT_FILES = [
  ...OXLINT_BOOTSTRAP_FILES,
  ...OXLINT_TEST_FILES,
]

export const policyLevels = (lint: unknown): PolicyLevels => {
  const levelOfKey = (key: PolicyKey): PolicyLevel => {
    const v = (lint as Record<string, unknown> | undefined)?.[key]
    return v === 'off' || v === 'warn' ? v : 'error'
  }
  return {
    enforceContentService: levelOfKey('enforceContentService'),
    enforceVariablesService: levelOfKey('enforceVariablesService'),
    enforceSupervisor: levelOfKey('enforceSupervisor'),
    enforceCliCommands: levelOfKey('enforceCliCommands'),
  }
}

/**
 * The rules the active policies add. A rule several policies share is written
 * once: their `no-restricted-imports` paths and `no-restricted-properties`
 * entries are concatenated, and it takes the strictest of their levels.
 */
export const activePolicyRules = (
  levels: PolicyLevels
): Record<string, unknown> => {
  const merged: Record<string, { level: PolicyLevel; options: unknown[] }> = {}
  for (const key of Object.keys(OXLINT_POLICY_RULES) as PolicyKey[]) {
    if (levels[key] === 'off') continue
    for (const [rule, value] of Object.entries(
      OXLINT_POLICY_RULES[key].rules
    )) {
      const options = Array.isArray(value) ? value.slice(1) : []
      const entry = merged[rule]
      if (!entry) {
        merged[rule] = { level: levels[key], options: structuredClone(options) }
        continue
      }
      if (levels[key] === 'error') entry.level = 'error'
      if (rule === 'no-restricted-imports') {
        const into = entry.options[0] as { paths: unknown[] }
        into.paths.push(...(options[0] as { paths: unknown[] }).paths)
      } else if (rule === 'no-restricted-properties') {
        const seen = new Set(
          (entry.options as RestrictedProperty[]).map(
            (o) => `${o.object}.${o.property}`
          )
        )
        for (const o of options as RestrictedProperty[]) {
          if (!seen.has(`${o.object}.${o.property}`)) {
            entry.options.push(structuredClone(o))
            seen.add(`${o.object}.${o.property}`)
          }
        }
      }
    }
  }
  return Object.fromEntries(
    Object.entries(merged).map(([rule, { level, options }]) => [
      rule,
      options.length > 0 ? [level, ...options] : level,
    ])
  )
}

/** The entries of `no-restricted-imports` (flat, or nested as `--print-config` prints it). */
export const restrictedPaths = (value: unknown): RestrictedPath[] => {
  const out: RestrictedPath[] = []
  if (!Array.isArray(value)) return out
  for (const o of value.slice(1).flat()) {
    if (typeof o === 'string') out.push({ name: o })
    const paths = (o as { paths?: unknown } | null)?.paths
    if (!Array.isArray(paths)) continue
    for (const p of paths) {
      if (typeof p === 'string') out.push({ name: p })
      else if (typeof (p as { name?: unknown })?.name === 'string') {
        const { name, importNames } = p as RestrictedPath
        out.push({
          name,
          ...(Array.isArray(importNames) ? { importNames } : {}),
        })
      }
    }
  }
  return out
}

const pathLabel = (p: RestrictedPath) =>
  p.importNames ? `${p.name} (${p.importNames.join(', ')})` : p.name

/** What `wanted` restricts that `value` does not: a whole module, or the named exports of one. */
export const missingRestrictedPaths = (
  value: unknown,
  wanted: unknown
): RestrictedPath[] => {
  const have = restrictedPaths(value)
  return restrictedPaths(wanted).filter(
    (w) =>
      !have.some(
        (h) =>
          h.name === w.name &&
          (!h.importNames ||
            (!!w.importNames &&
              w.importNames.every((n) => h.importNames!.includes(n))))
      )
  )
}

export const restrictedPropertiesOf = (
  value: unknown
): RestrictedProperty[] => {
  if (!Array.isArray(value)) return []
  return value
    .slice(1)
    .flat()
    .filter(
      (o): o is RestrictedProperty =>
        typeof (o as RestrictedProperty | null)?.object === 'string' &&
        typeof (o as RestrictedProperty).property === 'string'
    )
}

export const missingRestrictedProperties = (
  value: unknown,
  wanted: unknown
): RestrictedProperty[] => {
  const have = restrictedPropertiesOf(value)
  return restrictedPropertiesOf(wanted).filter(
    (w) => !have.some((h) => h.object === w.object && h.property === w.property)
  )
}

/** Every `no-restricted-imports` / `no-restricted-properties` entry of `wanted` that `value` lacks, as labels. */
export const missingPolicyEntries = (
  rule: string,
  value: unknown,
  wanted: unknown
): string[] =>
  rule === 'no-restricted-imports'
    ? missingRestrictedPaths(value, wanted).map(pathLabel)
    : rule === 'no-restricted-properties'
      ? missingRestrictedProperties(value, wanted).map(
          (p) => `${p.object}.${p.property}`
        )
      : []

/** `no-empty` -> `oxlint-eslint-no-empty`, the id a diagnostic of that rule is reported under. */
const findingIdOf = (rule: string) =>
  `oxlint-${(rule.includes('/') ? rule : `eslint/${rule}`).replace(/[^a-zA-Z0-9]+/g, '-')}`

const OXLINT_PACKAGES = ['oxlint', 'oxlint-tsgolint'] as const

/** The config files oxlint auto-discovers (verified against oxlint 1.79 and 1.86). */
export const OXLINT_CONFIG_FILES = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  'oxlint.config.ts',
] as const

/** Findings shown individually; the rest are counted in one summary. */
export const OXLINT_MAX_FINDINGS = 50

export const OXLINT_DEFAULT_TIMEOUT_SECONDS = 300

/**
 * Generated output the run never reports on. `--ignore-pattern` is additive to
 * the app's own `ignorePatterns`.
 */
const IGNORE_PATTERNS = [
  '**/*.gen.ts',
  '**/*.gen.tsx',
  '**/.pikku/**',
  '**/node_modules/**',
  '**/dist/**',
]

export type ExecResult = {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** Set when the binary could not be started at all. */
  spawnError?: string
}

export type OxlintExec = (
  file: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number }
) => Promise<ExecResult>

export const defaultExec: OxlintExec = (file, args, { cwd, timeoutMs }) =>
  new Promise((done) => {
    execFile(
      file,
      args,
      {
        cwd,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 512 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1' },
      },
      (error, stdout, stderr) => {
        const e = error as
          (NodeJS.ErrnoException & { killed?: boolean; code?: unknown }) | null
        if (e && typeof e.code === 'string') {
          done({
            code: null,
            stdout,
            stderr,
            timedOut: false,
            spawnError: e.message,
          })
          return
        }
        done({
          code: e ? ((e.code as number | undefined) ?? 1) : 0,
          stdout,
          stderr,
          timedOut: !!e?.killed,
        })
      }
    )
  })

type OxlintConfigShape = {
  rootDir?: unknown
  srcDirectories?: unknown
  outDir?: unknown
  scaffold?: Record<string, unknown>
  lint?: Record<string, unknown>
  validate?: {
    rules?: Record<string, unknown>
    oxlint?: { timeoutSeconds?: unknown }
  }
}

type PackageJson = {
  scripts?: Record<string, unknown>
  workspaces?: unknown
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

const stringOrUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/** `dir`, then each ancestor up to the filesystem root. */
const ancestors = (dir: string): string[] => {
  const out: string[] = []
  let current = resolve(dir)
  while (true) {
    out.push(current)
    const parent = dirname(current)
    if (parent === current) return out
    current = parent
  }
}

export type Project = {
  root: string
  config: OxlintConfigShape
  /** Directory `rootDir` resolves to; every config path is relative to it. */
  configRoot: string
  srcDirs: string[]
  scaffoldDir: string
  outDir: string | undefined
  /** package.json files that can declare or script oxlint for this app. */
  packages: Array<{ dir: string; pkg: PackageJson }>
  /** The workspace root, where a new devDependency belongs. */
  installDir: string
}

export const loadProject = async (root: string): Promise<Project | null> => {
  const config = await readJson<OxlintConfigShape>(
    join(root, 'pikku.config.json')
  )
  if (!config) return null
  const configRoot = stringOrUndefined(config.rootDir)
    ? resolve(root, config.rootDir as string)
    : root
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(configRoot, p))
  const srcDirs = (
    Array.isArray(config.srcDirectories) ? config.srcDirectories : []
  )
    .filter((d): d is string => typeof d === 'string')
    .map(abs)
  const scaffold = (config.scaffold ?? {}) as Record<string, unknown>
  const scaffoldDir = abs(
    stringOrUndefined(scaffold.pikkuDir) ??
      (srcDirs[0] ? join(srcDirs[0], 'scaffold') : 'src/scaffold')
  )

  // Every package.json that could carry the dependency or the lint script: the
  // functions package that owns each source directory, then the app root and
  // whatever workspace root sits above it.
  const packageDirs: string[] = []
  const addPackageDir = (dir: string) => {
    if (existsSync(join(dir, 'package.json')) && !packageDirs.includes(dir)) {
      packageDirs.push(dir)
    }
  }
  for (const src of srcDirs) {
    for (const dir of ancestors(src)) {
      if (existsSync(join(dir, 'package.json'))) {
        addPackageDir(dir)
        break
      }
    }
  }
  for (const dir of ancestors(configRoot)) addPackageDir(dir)

  const packages: Project['packages'] = []
  for (const dir of packageDirs) {
    const pkg = await readJson<PackageJson>(join(dir, 'package.json'))
    if (pkg) packages.push({ dir, pkg })
  }
  const installDir =
    packages.find(
      (p) => p.pkg.workspaces && ancestors(configRoot).includes(p.dir)
    )?.dir ?? configRoot

  return {
    root,
    config,
    configRoot,
    srcDirs,
    scaffoldDir,
    outDir: stringOrUndefined(config.outDir)
      ? abs(config.outDir as string)
      : undefined,
    packages,
    installDir,
  }
}

export type Located = {
  /** Absolute path of the oxlint executable, if one is installed. */
  bin?: string
  tsgolintInstalled: boolean
  declared: Record<(typeof OXLINT_PACKAGES)[number], boolean>
}

/**
 * Where the app's own oxlint lives. Looks in each package that owns the app and
 * every directory above, because a workspace hoists `node_modules/.bin` to its
 * root while the pikku config sits in a member. Never a global install: `bun
 * run`/CI has none, and a global one would pass here and fail there.
 */
export const locateOxlint = async (project: Project): Promise<Located> => {
  const dirs = [
    ...new Set([
      ...project.packages.map((p) => p.dir),
      ...ancestors(project.configRoot),
    ]),
  ]
  let bin: string | undefined
  for (const dir of dirs) {
    const candidate = join(dir, 'node_modules', '.bin', 'oxlint')
    if (existsSync(candidate)) {
      bin = candidate
      break
    }
  }

  // oxlint finds tsgolint by resolving from itself, so the installed package
  // has to be on that path: beside `oxlint`, or in an ancestor `node_modules`.
  let tsgolintInstalled = false
  const roots = new Set(dirs)
  if (bin) {
    try {
      const real = await realpath(join(dirname(dirname(bin)), 'oxlint'))
      for (const dir of ancestors(dirname(real))) roots.add(dir)
    } catch {
      // `.bin/oxlint` without the package beside it: fall through to the dirs
    }
  }
  for (const dir of roots) {
    if (
      existsSync(
        join(dir, 'node_modules', 'oxlint-tsgolint', 'package.json')
      ) ||
      existsSync(join(dir, 'oxlint-tsgolint', 'package.json'))
    ) {
      tsgolintInstalled = true
      break
    }
  }

  const declares = (name: string) =>
    project.packages.some(({ pkg }) =>
      [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies].some(
        (deps) => deps && name in deps
      )
    )
  return {
    bin,
    tsgolintInstalled,
    declared: {
      oxlint: declares('oxlint'),
      'oxlint-tsgolint': declares('oxlint-tsgolint'),
    },
  }
}

/** The directory oxlint is run from: the nearest one at or above the app with a config. */
export const findOxlintConfig = (
  project: Project
): { dir: string; file: string } | undefined => {
  for (const dir of ancestors(project.configRoot)) {
    for (const name of OXLINT_CONFIG_FILES) {
      if (existsSync(join(dir, name))) return { dir, file: join(dir, name) }
    }
  }
  return undefined
}

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'

/** The package manager the lockfile at the install directory belongs to; bun when there is none. */
export const detectPackageManager = (installDir: string): PackageManager => {
  const has = (f: string) => existsSync(join(installDir, f))
  if (has('bun.lock') || has('bun.lockb')) return 'bun'
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  if (has('package-lock.json')) return 'npm'
  return 'bun'
}

const installCommand = (project: Project, names: string[]): string => {
  const pm = detectPackageManager(project.installDir)
  const list = names.join(' ')
  if (pm === 'bun') return `bun add -d ${list}`
  if (pm === 'pnpm') return `pnpm add -D ${list}`
  if (pm === 'yarn') return `yarn add -D ${list}`
  return `npm install -D ${list}`
}

const ENABLE_HINT = 'Run `pikku enable oxlint`'

const rel = (root: string, p: string): string => relative(root, p) || '.'

const CONFIG_SNIPPET = JSON.stringify(
  {
    options: { typeAware: true },
    rules: Object.fromEntries(OXLINT_REQUIRED_RULES.map((r) => [r, 'error'])),
  },
  null,
  2
)

const NO_VOID = [
  'Do NOT "fix" a report by writing `void verify(...)` (or `--fix-dangerously`): that only silences the rule while the promise is still never awaited.',
  'Await the call, or await it and check the result: `if (!(await verify(sig))) reject()`.',
].join('\n')

const NO_EMPTY_CATCH = [
  'Do NOT "fix" an empty catch by adding a comment and nothing else unless the failure is genuinely safe to ignore.',
  'Rethrow it, log it with context, or return something the caller can act on.',
].join('\n')

/** The typed shape of `oxlint --print-config` that these checks read. */
type ResolvedConfig = {
  plugins?: string[] | null
  rules?: Record<string, unknown>
  options?: { typeAware?: unknown } | null
  overrides?: Array<{
    files?: string[]
    plugins?: string[] | null
    rules?: Record<string, unknown> | null
  }> | null
}

const levelOf = (value: unknown): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v === 'number') return ['allow', 'warn', 'deny'][v]
  return typeof v === 'string' ? v : undefined
}
export const isError = (value: unknown) => {
  const level = levelOf(value)
  return level === 'error' || level === 'deny'
}

/**
 * `--print-config` nests the options one level down (`["deny", [{...}]]`)
 * while a config file holds them flat (`["error", {...}]`); both are read.
 */
const optionsDisableCoverage = (
  rule: RequiredRule,
  value: unknown
): string | null => {
  const defeat = DEFEATING_OPTIONS[rule]
  if (!defeat || !Array.isArray(value)) return null
  for (const o of value.slice(1).flat()) {
    if (
      o &&
      typeof o === 'object' &&
      (o as Record<string, unknown>)[defeat.option] === defeat.value
    ) {
      return `"${defeat.option}" is ${defeat.value}, so ${defeat.consequence}`
    }
  }
  return null
}

/**
 * Check 1 — oxlint is installed and configured for the rules that matter.
 *
 * Reports `oxlint-not-installed`, `oxlint-config-missing`,
 * `oxlint-rule-missing` and `oxlint-type-aware-off`. The resolved config comes
 * from `oxlint --print-config` run from the lint directory, not from parsing
 * the config file here, so `extends`, `overrides`, categories, rule aliases and
 * the `.json` / `.jsonc` / `oxlint.config.ts` formats are whatever oxlint
 * itself decides. When oxlint cannot be asked, the rules are reported missing:
 * a check that cannot prove them on does not pass them.
 */
export const runOxlintSetupChecks = async (
  root: string,
  exec: OxlintExec = defaultExec
): Promise<ValidateFinding[]> => {
  const project = await loadProject(root)
  if (!project) return []
  const findings: ValidateFinding[] = []
  const pkgPath = join(project.installDir, 'package.json')
  const located = await locateOxlint(project)

  // (a) installed and declared
  const problems: string[] = []
  const names: string[] = []
  for (const name of OXLINT_PACKAGES) {
    const installed =
      name === 'oxlint' ? !!located.bin : located.tsgolintInstalled
    if (!located.declared[name]) {
      problems.push(`${name} is not in dependencies or devDependencies`)
      names.push(name)
    } else if (!installed) {
      problems.push(`${name} is declared but not installed`)
      names.push(name)
    }
  }
  if (problems.length > 0) {
    findings.push({
      id: 'oxlint-not-installed',
      severity: 'error',
      message: `oxlint is not set up for this app (${problems.join('; ')}) — pikku validate needs the app's own oxlint with type-aware rules (oxlint-tsgolint) to catch un-awaited promises, such as a webhook verification helper called without \`await\``,
      path: pkgPath,
      fixHint: [
        `Add the devDependencies to ${rel(root, pkgPath)}: ${installCommand(project, names)}`,
        'Then run the install so node_modules/.bin/oxlint and node_modules/oxlint-tsgolint exist.',
        ENABLE_HINT,
      ].join('\n'),
    })
  }

  // (b) configuration
  const config = findOxlintConfig(project)
  if (!config) {
    findings.push({
      id: 'oxlint-config-missing',
      severity: 'error',
      message: `no oxlint config found at or above ${rel(root, project.configRoot)} (looked for ${OXLINT_CONFIG_FILES.join(', ')}) — the type-aware promise rules are not enabled`,
      path: join(project.configRoot, '.oxlintrc.json'),
      fixHint: [
        `Create ${rel(root, join(project.installDir, '.oxlintrc.json'))} containing at least:`,
        CONFIG_SNIPPET,
        'Merge these keys into an existing config (for example under a different name) rather than adding a second file: oxlint refuses a directory holding both .oxlintrc.json and .oxlintrc.jsonc.',
        ENABLE_HINT,
      ].join('\n'),
    })
  }

  let resolved: ResolvedConfig | undefined
  let resolveError: string | undefined
  if (config && located.bin) {
    const result = await exec(located.bin, ['--print-config'], {
      cwd: config.dir,
      timeoutMs: 60_000,
    })
    try {
      resolved = JSON.parse(result.stdout) as ResolvedConfig
    } catch {
      resolveError = (
        result.spawnError ||
        result.stderr ||
        result.stdout ||
        'no output'
      ).trim()
    }
  }

  if (config && resolved) {
    const missing: string[] = []
    const reasons: string[] = []
    const hasTypescriptPlugin =
      !resolved.plugins || resolved.plugins.includes('typescript')
    for (const rule of OXLINT_REQUIRED_RULES) {
      const value = resolved.rules?.[rule]
      if (rule.startsWith('typescript/') && !hasTypescriptPlugin) {
        missing.push(rule)
        reasons.push(
          `${rule}: the "typescript" plugin is not in "plugins" (${(resolved.plugins ?? []).join(', ')})`
        )
      } else if (!isError(value)) {
        missing.push(rule)
        reasons.push(
          `${rule}: ${levelOf(value) ? `set to "${levelOf(value)}"` : 'not enabled'}, it must be "error"`
        )
      } else {
        const why = optionsDisableCoverage(rule, value)
        if (why) {
          missing.push(rule)
          reasons.push(`${rule}: ${why}`)
        }
      }
      for (const override of resolved.overrides ?? []) {
        const level = override.rules?.[rule]
        if (level !== undefined && !isError(level)) {
          missing.push(rule)
          reasons.push(
            `${rule}: an override for ${JSON.stringify(override.files ?? [])} sets it to "${levelOf(level)}"`
          )
        }
      }
    }
    if (reasons.length > 0) {
      findings.push({
        id: 'oxlint-rule-missing',
        severity: 'error',
        message: `${rel(root, config.file)} does not enforce ${[...new Set(missing)].join(' and ')} at "error" — ${reasons.join('; ')}. Without them a forgotten \`await\` on an async helper (\`if (!verify(sig))\`) or an empty \`catch {}\` is not caught`,
        path: config.file,
        fixHint: [
          `In ${rel(root, config.file)} (and anything it extends) make sure these are set:`,
          CONFIG_SNIPPET,
          'Remove any "overrides" entry that sets these rules to "off" or "warn", keep "typescript" in "plugins" if "plugins" is set, and do not pass { "checksConditionals": false } to typescript/no-misused-promises or { "allowEmptyCatch": true } to no-empty.',
          ENABLE_HINT,
        ].join('\n'),
      })
    }

    // type-aware mode: the config option, or the app's own lint script
    const scripts = project.packages.flatMap(({ pkg }) =>
      Object.values(pkg.scripts ?? {}).filter(
        (s): s is string => typeof s === 'string'
      )
    )
    const scriptTypeAware = scripts.some(
      (s) => /\boxlint\b/.test(s) && s.includes('--type-aware')
    )
    if (resolved.options?.typeAware !== true && !scriptTypeAware) {
      findings.push({
        id: 'oxlint-type-aware-off',
        severity: 'error',
        message: `oxlint is not type-aware for this app — typescript/no-misused-promises and typescript/no-floating-promises need type information and are silently skipped without it`,
        path: config.file,
        fixHint: [
          `Set "options": { "typeAware": true } in ${rel(root, config.file)} (oxlint 1.79+),`,
          'or pass --type-aware in the lint script, e.g. "lint": "oxlint --type-aware apps packages".',
          ENABLE_HINT,
        ].join('\n'),
      })
    }
    findings.push(
      ...policyFindings(
        root,
        config.file,
        resolved,
        policyLevels(project.config.lint)
      )
    )
  } else if (config && located.bin && resolveError !== undefined) {
    findings.push({
      id: 'oxlint-rule-missing',
      severity: 'error',
      message: `could not resolve the oxlint config ${rel(root, config.file)}, so ${OXLINT_REQUIRED_RULES.join(' and ')} cannot be shown to be on: ${resolveError.split('\n')[0]}`,
      path: config.file,
      fixHint: [
        `Run \`${rel(root, located.bin)} --print-config\` in ${rel(root, config.dir)} and fix what it reports (a directory with both .oxlintrc.json and .oxlintrc.jsonc, an unreadable extends, an oxlint too old for --print-config).`,
        'The resolved config must enable, at "error":',
        CONFIG_SNIPPET,
      ].join('\n'),
    })
  }

  return applyRuleSeverity(findings, project.config.validate?.rules)
}

const atLeast = (value: unknown, level: PolicyLevel): boolean => {
  const actual = levelOf(value)
  if (level === 'warn') return actual === 'warn' || isError(value)
  return isError(value)
}

/**
 * One finding per `lint` key whose oxlint rules are not on at the key's level:
 * `oxlint-enforce-content-service` and `oxlint-enforce-variables-service`, at
 * that level. `overrides` are not inspected, so a per-file exemption stands.
 */
const policyFindings = (
  root: string,
  configFile: string,
  resolved: ResolvedConfig,
  levels: PolicyLevels
): ValidateFinding[] => {
  const findings: ValidateFinding[] = []
  for (const key of Object.keys(OXLINT_POLICY_RULES) as PolicyKey[]) {
    const level = levels[key]
    if (level === 'off') continue
    const policy = OXLINT_POLICY_RULES[key]
    const reasons: string[] = []
    for (const [rule, wanted] of Object.entries(policy.rules)) {
      const value = resolved.rules?.[rule]
      if (!atLeast(value, level)) {
        reasons.push(
          `${rule}: ${levelOf(value) ? `set to "${levelOf(value)}"` : 'not enabled'}, it must be at least "${level}"`
        )
        continue
      }
      const missing = missingPolicyEntries(rule, value, wanted)
      if (missing.length > 0)
        reasons.push(`${rule}: does not restrict ${missing.join(', ')}`)
    }
    if (reasons.length === 0) continue
    findings.push({
      id: `oxlint-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      severity: level,
      message: `lint.${key} is "${level}" but ${rel(root, configFile)} does not enforce it — ${reasons.join('; ')}. Code that should go through ${policy.use} is not caught`,
      path: configFile,
      fixHint: [
        `In ${rel(root, configFile)} make sure these are set (an "overrides" entry may switch them off for specific files):`,
        JSON.stringify({ rules: policy.rules }, null, 2),
        `Or set "lint": { "${key}": "off" } in pikku.config.json.`,
        ENABLE_HINT,
      ].join('\n'),
    })
  }
  return findings
}

type OxlintDiagnostic = {
  message?: string
  code?: string
  severity?: string
  help?: string
  url?: string
  filename?: string
  labels?: Array<{ span?: { line?: number; column?: number } }>
}

/** `typescript(no-misused-promises)` -> `typescript/no-misused-promises`. */
const ruleOf = (code: string | undefined): string | undefined => {
  const m = /^([^()]+)\((.+)\)$/.exec(code ?? '')
  return m ? `${m[1]}/${m[2]}` : code
}

/** The CLI args of the run. Read-only by construction: no `--fix*` flag exists here. */
export const oxlintRunArgs = (
  project: Pick<Project, 'srcDirs' | 'scaffoldDir' | 'outDir'>,
  cwd: string
): string[] => {
  const ignore = [...IGNORE_PATTERNS]
  for (const dir of [project.scaffoldDir, project.outDir]) {
    if (!dir) continue
    const r = relative(cwd, dir)
    if (r && !r.startsWith('..') && !isAbsolute(r)) ignore.push(`${r}/**`)
  }
  return [
    '--type-aware',
    '--format',
    'json',
    '--no-error-on-unmatched-pattern',
    ...ignore.flatMap((p) => ['--ignore-pattern', p]),
    // Relative to cwd where possible: oxlint compares paths against its own
    // (symlink-resolved) working directory to decide which config is the root,
    // and an absolute path through a symlink (/var -> /private/var) breaks it.
    ...project.srcDirs.map((dir) => {
      const r = relative(cwd, dir)
      return r && !r.startsWith('..') && !isAbsolute(r) ? r : dir
    }),
  ]
}

const rank = (f: ValidateFinding, required: Set<string>): number =>
  (f.severity === 'error' ? 0 : f.severity === 'warn' ? 2 : 4) +
  (required.has(f.id) ? 0 : 1)

/**
 * Check 2 — run the app's own oxlint, type-aware, over `srcDirectories`.
 *
 * Runs last. Skipped (with an info finding saying why) when check 1 found
 * oxlint or oxlint-tsgolint not installed, since there is nothing to run.
 * Generated output is excluded, and no fix flag is ever passed: `--fix` leaves
 * these rules alone and `--fix-dangerously` rewrites a bare `verify(sig)` to
 * `void verify(sig)`, silencing the bug instead of fixing it.
 *
 * Each diagnostic becomes a finding `oxlint-<plugin>-<rule>` at the severity
 * oxlint gave it (error -> error, warning -> warn), capped at
 * OXLINT_MAX_FINDINGS plus one summary. `validate.rules["oxlint-run"] = "off"`
 * skips the run; `validate.oxlint.timeoutSeconds` bounds it.
 */
export const runOxlintRun = async (
  root: string,
  exec: OxlintExec = defaultExec
): Promise<ValidateFinding[]> => {
  const project = await loadProject(root)
  if (!project) return []
  const rules = project.config.validate?.rules
  if (rules?.['oxlint-run'] === 'off') return []

  const pkgPath = join(project.installDir, 'package.json')
  const skip = (reason: string): ValidateFinding[] =>
    applyRuleSeverity(
      [
        {
          id: 'oxlint-run-skipped',
          severity: 'info',
          message: `oxlint was not run: ${reason}`,
          path: pkgPath,
          fixHint:
            'Fix the oxlint-not-installed finding above; the lint run happens automatically once oxlint and oxlint-tsgolint are installed.',
        },
      ],
      rules
    )

  const located = await locateOxlint(project)
  if (!located.bin || !located.tsgolintInstalled) {
    return skip(
      `${[!located.bin && 'oxlint', !located.tsgolintInstalled && 'oxlint-tsgolint'].filter(Boolean).join(' and ')} not installed`
    )
  }
  const srcDirs = project.srcDirs.filter((d) => existsSync(d))
  if (srcDirs.length === 0) return skip('no srcDirectories exist on disk')

  const cwd = findOxlintConfig(project)?.dir ?? project.configRoot
  const timeoutSeconds =
    typeof project.config.validate?.oxlint?.timeoutSeconds === 'number' &&
    project.config.validate.oxlint.timeoutSeconds > 0
      ? project.config.validate.oxlint.timeoutSeconds
      : OXLINT_DEFAULT_TIMEOUT_SECONDS
  const args = oxlintRunArgs({ ...project, srcDirs }, cwd)
  const command = `${rel(root, located.bin)} ${args.join(' ')}`

  const result = await exec(located.bin, args, {
    cwd,
    timeoutMs: timeoutSeconds * 1000,
  })

  const failed = (message: string, hint: string): ValidateFinding[] =>
    applyRuleSeverity(
      [
        {
          id: 'oxlint-run-failed',
          severity: 'error',
          message,
          path: pkgPath,
          fixHint: hint,
        },
      ],
      rules
    )

  if (result.timedOut) {
    return failed(
      `oxlint did not finish within ${timeoutSeconds}s and was stopped`,
      `Raise "validate": { "oxlint": { "timeoutSeconds": N } } in pikku.config.json, or reproduce with: (cd ${rel(root, cwd)} && ${command})`
    )
  }

  let parsed: { diagnostics?: OxlintDiagnostic[]; number_of_files?: number }
  try {
    const start = result.stdout.indexOf('{')
    parsed = JSON.parse(result.stdout.slice(start))
  } catch {
    const detail = (
      result.spawnError ||
      result.stderr ||
      result.stdout ||
      `exit code ${result.code}`
    ).trim()
    return failed(
      `oxlint failed without producing a report (exit ${result.code}): ${detail.split('\n').slice(0, 5).join(' | ')}`,
      `Reproduce with: (cd ${rel(root, cwd)} && ${command})`
    )
  }

  const required = new Set(OXLINT_REQUIRED_RULES.map(findingIdOf))
  const diagnostics = parsed.diagnostics ?? []
  const all: ValidateFinding[] = diagnostics.map((d) => {
    const rule = ruleOf(d.code)
    const file = resolve(cwd, d.filename ?? '')
    const span = d.labels?.find((l) => l.span?.line)?.span
    const where = span
      ? `${rel(root, file)}:${span.line}:${span.column}`
      : rel(root, file)
    const id = rule ? findingIdOf(rule) : 'oxlint-diagnostic'
    const hints = [d.help, d.url].filter(Boolean) as string[]
    if (rule === 'typescript/no-floating-promises') hints.push(NO_VOID)
    if (rule === 'typescript/no-misused-promises') {
      hints.push(
        'A Promise is truthy: await it before branching on it, e.g. `if (!(await verify(sig)))`.'
      )
    }
    if (rule === 'eslint/no-empty') hints.push(NO_EMPTY_CATCH)
    if (
      rule === 'eslint/no-restricted-imports' ||
      rule === 'typescript/no-require-imports'
    ) {
      hints.push(
        `Read and write files through ${OXLINT_POLICY_RULES.enforceContentService.use}. For a file that genuinely needs the disk, switch the rule off for it in an "overrides" entry, or set "lint": { "enforceContentService": "off" } in pikku.config.json.`
      )
    }
    if (rule === 'node/no-process-env') {
      hints.push(
        `Read configuration through ${OXLINT_POLICY_RULES.enforceVariablesService.use}. For bootstrap code that genuinely needs the environment, switch the rule off for it in an "overrides" entry, or set "lint": { "enforceVariablesService": "off" } in pikku.config.json.`
      )
    }
    return {
      id,
      severity:
        d.severity === 'error'
          ? 'error'
          : d.severity === 'warning'
            ? 'warn'
            : 'info',
      message: `${where} ${d.message ?? 'oxlint diagnostic'} (${rule ?? 'oxlint'})`,
      path: file,
      fixHint:
        hints.join('\n') || 'See the oxlint documentation for this rule.',
    }
  })
  const findings = applyRuleSeverity(all, rules)
  findings.sort((a, b) => rank(a, required) - rank(b, required))

  const shown = findings.slice(0, OXLINT_MAX_FINDINGS)
  const hidden = findings.slice(OXLINT_MAX_FINDINGS)
  if (hidden.length > 0) {
    const errors = hidden.filter((f) => f.severity === 'error').length
    shown.push({
      id: 'oxlint-more-findings',
      severity: 'info',
      message: `${hidden.length} more oxlint finding${hidden.length === 1 ? '' : 's'} not shown (${errors} error${errors === 1 ? '' : 's'}, ${hidden.length - errors} other) — the first ${OXLINT_MAX_FINDINGS} are listed, errors first`,
      path: pkgPath,
      fixHint: `List them all with: (cd ${rel(root, cwd)} && ${command})`,
    })
  }

  if (parsed.number_of_files === 0) {
    shown.push(
      ...applyRuleSeverity(
        [
          {
            id: 'oxlint-no-files-linted',
            severity: 'warn',
            message: `oxlint linted 0 files under ${srcDirs.map((d) => rel(root, d)).join(', ')} — an ignorePatterns entry or an unmatched path is hiding the app source, so nothing was checked`,
            path: pkgPath,
            fixHint:
              'Check "ignorePatterns" in the oxlint config (and anything it extends) and the srcDirectories in pikku.config.json.',
          },
        ],
        rules
      )
    )
  }
  return shown
}
