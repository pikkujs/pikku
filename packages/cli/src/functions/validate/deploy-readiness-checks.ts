import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonSafe, readTextSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

const lines = (...parts: string[]): string => parts.join('\n')

type Manifest = {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, unknown>
  resolutions?: Record<string, unknown>
}

type Severity = (
  id: string,
  message: string,
  path: string,
  fixHint: string
) => void

/** A findings array with the two reporters bound to it. */
const collect = (): {
  findings: ValidateFinding[]
  e: Severity
  w: Severity
} => {
  const findings: ValidateFinding[] = []
  const push =
    (severity: 'error' | 'warn'): Severity =>
    (id, message, path, fixHint) => {
      findings.push({ id, severity, message, path, fixHint })
    }
  return { findings, e: push('error'), w: push('warn') }
}

type Semver = [number, number, number]

/** major.minor.patch out of a spec, ignoring range prefixes and suffixes. */
const parseSemver = (spec: string): Semver | null => {
  const m = spec.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const sameVersion = (a: Semver, b: Semver): boolean =>
  a.every((part, i) => part === b[i])

const isOlder = (a: Semver, b: Semver): boolean => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

/**
 * The legacy name for pikkufabric.config.json.
 *
 * Renamed once the config stopped being fabric-the-repo's own file and became
 * the thing a deployed project hands the platform. The build container looks
 * for the new name only, so a project still carrying the old one deploys as if
 * it had never been linked: no frontends, no production branch, and a failure
 * whose message ("pikkufabric.config.json not found in repository root") names
 * a file the author believes they already wrote.
 */
const LEGACY_CONFIG_NAME = 'fabric.config.json'

/**
 * Packages a hoist can pick the wrong copy of.
 *
 * Distinct from the physical-copy check next door, which is about peer
 * virtualization splitting module state. This is about the deploy's install
 * hoisting one version into the root and a workspace member resolving to it
 * although it asked for another. The symptom is an import that exists in the
 * version the member declared and not in the version that won: `Export named
 * 'createJsonLinesResponseHandler' not found in module
 * node_modules/@ai-sdk/provider-utils/dist/index.js`, then schema generation
 * failing for every schema at once.
 *
 * Only packages that are (a) routinely pulled in transitively at several
 * versions and (b) unforgiving about which one wins belong here.
 *
 * Reported as a warning across majors only. Two patch releases of the same
 * major in a lockfile is ordinary and the estate is full of it in projects
 * that deploy fine; two majors is the shape that broke, and it is still a risk
 * rather than a proof, because whether it bites depends on which copy the
 * hoist happens to lift.
 */
const HOIST_SENSITIVE_PKGS = [
  '@ai-sdk/provider',
  '@ai-sdk/provider-utils',
  'ai',
  'zod',
  '@pikku/core',
]

/** `"<key>": ["<name>@<version>", …]` — one resolved package per line. */
const LOCK_ENTRY = /^\s*"[^"]+":\s*\["(@?[^"@]+(?:\/[^"@]+)?)@([^"]+)"/

/**
 * Every resolved version of each package named in a bun.lock.
 *
 * Reads the lockfile as text rather than parsing it: bun.lock is JSONC, and a
 * tolerant line scan over entries that are unambiguous by shape beats keeping a
 * JSONC parser honest against a format bun still revises.
 */
export const lockedVersions = (lock: string): Map<string, Set<string>> => {
  const versions = new Map<string, Set<string>>()
  for (const line of lock.split('\n')) {
    const m = line.match(LOCK_ENTRY)
    if (!m) continue
    const [, name, version] = m
    const seen = versions.get(name) ?? new Set<string>()
    seen.add(version)
    versions.set(name, seen)
  }
  return versions
}

/**
 * Checks that only matter because the project gets deployed.
 *
 * Every one of these passed locally and failed on a build host, which is the
 * only reason they are worth a check: a class of failure that a developer can
 * reproduce is one they can also fix without being told.
 */
export const runDeployReadinessChecks = async (
  root: string
): Promise<ValidateFinding[]> => {
  const { findings, e, w } = collect()

  // ── the config under its retired name ──────────────────────────────────
  const legacyPath = join(root, LEGACY_CONFIG_NAME)
  if (
    existsSync(legacyPath) &&
    !existsSync(join(root, 'pikkufabric.config.json'))
  ) {
    e(
      'fabric-config-legacy-name',
      `${LEGACY_CONFIG_NAME} is the retired name for pikkufabric.config.json — the build container looks for the new name only, so this project deploys as an unlinked one and aborts with "pikkufabric.config.json not found in repository root"`,
      legacyPath,
      lines(
        'Rename it, keeping the file in git history:',
        `  git mv ${LEGACY_CONFIG_NAME} pikkufabric.config.json`,
        'The contents are unchanged — only the filename moved.'
      )
    )
  }

  const rootPkgPath = join(root, 'package.json')
  const rootPkg = await readJsonSafe<Manifest>(rootPkgPath)

  // ── an override that pins the whole tree ───────────────────────────────
  // `overrides`/`resolutions` beat every declared range, including the ranges
  // in the manifests validate reads to decide a version is fine. A pin left
  // behind from a bisect keeps winning silently until something that needs the
  // newer package is installed beside it.
  const pins: Record<string, unknown> = {
    ...rootPkg?.overrides,
    ...rootPkg?.resolutions,
  }
  const declared = {
    ...rootPkg?.dependencies,
    ...rootPkg?.devDependencies,
  }
  for (const [pkg, pin] of Object.entries(pins)) {
    if (typeof pin !== 'string' || !pkg.startsWith('@pikku/')) continue
    const spec = declared[pkg]
    if (typeof spec !== 'string') continue
    const pinned = parseSemver(pin)
    const wanted = parseSemver(spec)
    if (!pinned || !wanted || sameVersion(pinned, wanted)) continue
    const older = isOlder(pinned, wanted)
    e(
      `pikku-override-skew-${pkg.replace(/[@/]/g, '-')}`,
      `${pkg} is declared as "${spec}" but pinned to "${pin}" by ${rootPkg?.overrides?.[pkg] !== undefined ? 'overrides' : 'resolutions'} — the pin wins at install, so the installed copy is ${older ? 'older' : 'different'} than the one the project asks for`,
      rootPkgPath,
      lines(
        `Set both to the same version, or drop the pin if it has outlived its reason:`,
        `  "${pkg}": "${spec}"`,
        'The @pikku/* packages are released together and a mixed set is not a supported combination.'
      )
    )
  }

  // ── one major per hoist-sensitive package ──────────────────────────────
  const lock = await readTextSafe(join(root, 'bun.lock'))
  if (lock) {
    const versions = lockedVersions(lock)
    for (const pkg of HOIST_SENSITIVE_PKGS) {
      const resolved = versions.get(pkg)
      if (!resolved) continue
      const majors = new Set(
        [...resolved].map((v) => parseSemver(v)?.[0]).filter((m) => m != null)
      )
      if (majors.size < 2) continue
      const sorted = [...resolved].sort((a, b) => {
        const x = parseSemver(a) ?? [0, 0, 0]
        const y = parseSemver(b) ?? [0, 0, 0]
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
      })
      w(
        `dup-locked-major-${pkg.replace(/[@/]/g, '-')}`,
        `bun.lock resolves "${pkg}" across ${majors.size} majors (${sorted.join(', ')}) — the deploy hoists one of them into the root, and a workspace member that asked for another gets it instead`,
        join(root, 'bun.lock'),
        lines(
          `Pin the version the project actually wants in the root package.json:`,
          '  "overrides": {',
          `    "${pkg}": "${sorted[sorted.length - 1]}"`,
          '  }',
          'then `bun install --lockfile-only` and confirm the lock holds one major.',
          'Check which major is right first: it is the one a *direct* dependency requires, which is not always the newest in the lock.'
        )
      )
    }
  }

  findings.push(...(await runParaglideCompileChecks(root)))
  return findings
}

/** `paraglideVitePlugin({ … })` options that only the app's own build knows. */
const PARAGLIDE_LAYOUT_OPTIONS = ['outputStructure', 'strategy', 'outdir']

/**
 * Paraglide output the deploy will generate differently than the app does.
 *
 * The build container compiles translations before the type-check, and it does
 * it by invoking the paraglide CLI. A bare invocation takes every default:
 * `message-modules`, one file per message, emitted on demand. An app whose vite
 * plugin asks for anything else — `locale-modules`, a different outdir, a
 * non-default strategy — gets a tree the plugin never described and a
 * type-check against files that are not where its tsconfig says they are.
 *
 * The container prefers the app's own `i18n:compile` script when it declares
 * one, which is the only way the two can agree: the script is the single place
 * the flags are written down.
 */
export const runParaglideCompileChecks = async (
  root: string
): Promise<ValidateFinding[]> => {
  const { findings, e, w } = collect()
  const appsDir = join(root, 'apps')
  if (!existsSync(appsDir)) return findings

  let entries: string[]
  try {
    entries = (await readdir(appsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return findings
  }

  for (const name of entries) {
    const appPath = join(appsDir, name)
    const pkg = await readJsonSafe<Manifest>(join(appPath, 'package.json'))
    if (!pkg) continue
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (!deps['@inlang/paraglide-js']) continue
    if (!existsSync(join(appPath, 'project.inlang', 'settings.json'))) continue

    const viteConfig =
      (await readTextSafe(join(appPath, 'vite.config.ts'))) ??
      (await readTextSafe(join(appPath, 'vite.config.js')))
    if (!viteConfig?.includes('paraglide')) continue

    const configured = PARAGLIDE_LAYOUT_OPTIONS.filter((option) =>
      new RegExp(`\\b${option}\\s*:`).test(viteConfig)
    )
    const hasCompileScript = typeof pkg.scripts?.['i18n:compile'] === 'string'
    if (hasCompileScript || configured.length === 0) continue

    // `outdir` alone is the starter template's own shape and the CLI default
    // the container passes, so it is not on its own a disagreement.
    const layoutOnly = configured.filter((o) => o !== 'outdir')
    const report = layoutOnly.length > 0 ? e : w
    report(
      `paraglide-compile-script-missing-${name}`,
      `apps/${name} configures paraglide's ${configured.map((o) => `\`${o}\``).join(' and ')} in its vite config but declares no "i18n:compile" script — the deploy compiles translations with the paraglide CLI's defaults, so the type-check runs against a different output tree than the one the plugin describes`,
      join(appPath, 'package.json'),
      lines(
        'Write the flags down once, where both builds read them:',
        '  "scripts": {',
        `    "i18n:compile": "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide${layoutOnly.includes('outputStructure') ? ' --outputStructure locale-modules' : ''}"`,
        '  }',
        'The build container prefers this script over its own CLI invocation, which is what keeps the two in agreement.'
      )
    )
  }

  return findings
}
