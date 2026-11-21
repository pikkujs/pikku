import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import {
  findMainEntry,
  findWorkspaceConfigs,
  isMarkedPackage,
} from '../../utils/project-packages.js'
import type { ValidateFinding } from './virtual-user-checks.js'

/**
 * The layout every Pikku project has, whatever its packages are called:
 *
 * - `pikku.config.json` at the project top level, and only one of it;
 * - generated output in `<config dir>/.pikku`, which every `#pikku/*` import
 *   resolves to, except in the main package, which has its own config and its own
 *   `.pikku`;
 * - `db/` and `emails/` beside the config (db under `rootDir`, emails under
 *   `emailTemplatesDir`), never inside a functions package;
 * - the code in the project's main package.
 *
 * A warning by default and an error with `--strict`, so a project moved into
 * the wrong shape is caught before it is released.
 */
export const LAYOUT_CONFIG_NOT_AT_ROOT = 'layout-config-not-at-root'
export const LAYOUT_CONFIG_DUPLICATE = 'layout-config-duplicate'
export const LAYOUT_DB_IN_PACKAGE = 'layout-db-in-package'
export const LAYOUT_EMAILS_IN_PACKAGE = 'layout-emails-in-package'
export const LAYOUT_PIKKU_IMPORT_NOT_ROOT = 'layout-pikku-import-not-root'

const CONFIG = 'pikku.config.json'
/** An addon carries its own config by design; it is not a second project config. */
const ADDON_MARKER = join('types', 'application-types.d.ts')

/** Never walked: installed, generated or deploy output, never a project's own config. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out'])

type LayoutConfig = {
  rootDir?: unknown
  emailTemplatesDir?: unknown
}

type PackageJson = {
  name?: string
  workspaces?: unknown
  imports?: Record<string, unknown>
}

const isAddonDir = (dir: string) => existsSync(join(dir, ADDON_MARKER))

const isInside = (child: string, parent: string) =>
  child === parent || child.startsWith(parent + sep)

const readPkg = async (dir: string): Promise<PackageJson | null> => {
  try {
    return await readJsonSafe<PackageJson>(join(dir, 'package.json'))
  } catch {
    return null
  }
}

/**
 * Every app `pikku.config.json` below `dir` (not `dir` itself). Only a file
 * named exactly `pikku.config.json` counts: `pikku.surface.json` and other
 * generated `pikku.*.json` files are not configs. Dot-directories (`.pikku`,
 * `.git`, `.deploy`, ...) and installed or built output are not walked.
 * `limit` stops the walk early once that many are found.
 */
export async function findNestedConfigs(
  dir: string,
  limit = Infinity,
  maxDepth = 6
): Promise<string[]> {
  const found: string[] = []
  const visit = async (current: string, depth: number): Promise<void> => {
    if (found.length >= limit || depth > maxDepth) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const child = join(current, entry.name)
      if (existsSync(join(child, CONFIG)) && !isAddonDir(child)) {
        found.push(join(child, CONFIG))
      }
      await visit(child, depth + 1)
    }
  }
  await visit(dir, 1)
  return found
}

/** The nearest directory strictly above `dir` whose package.json declares workspaces. */
const findWorkspaceRootAbove = async (
  dir: string
): Promise<string | undefined> => {
  let current = dirname(dir)
  while (true) {
    if ((await readPkg(current))?.workspaces) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** The package directory a source directory belongs to, never above `top`. */
const packageOf = (srcDir: string, top: string): string => {
  let current = srcDir
  while (isInside(current, top)) {
    if (existsSync(join(current, 'package.json'))) return current
    if (current === top) break
    current = dirname(current)
  }
  return top
}

const stringTargets = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringTargets)
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(stringTargets)
  }
  return []
}

/** The `.pikku` directory a path points into, or undefined when it names none. */
const pikkuDirOf = (target: string): string | undefined => {
  const parts = target.split(sep)
  const at = parts.lastIndexOf('.pikku')
  return at === -1 ? undefined : parts.slice(0, at + 1).join(sep)
}

type TsconfigJson = {
  extends?: unknown
  compilerOptions?: { baseUrl?: string; paths?: Record<string, unknown> }
}

/**
 * The tsconfig.json that governs a package: its own, else the nearest one
 * above it, never above `top`. tsc run from the package, bun, tsx and esbuild
 * all pick it by the same directory lookup.
 */
const governingTsconfig = (pkg: string, top: string): string | undefined => {
  let current = pkg
  while (isInside(current, top)) {
    const file = join(current, 'tsconfig.json')
    if (existsSync(file)) return file
    if (current === top) break
    current = dirname(current)
  }
  return undefined
}

/**
 * `compilerOptions.paths` as the compiler sees it, following relative
 * `extends`: the nearest file that sets `paths` wins, and its targets resolve
 * against the nearest `baseUrl`, else the directory of the file that set them.
 */
const readTsconfigPaths = async (
  file: string
): Promise<{ paths: Record<string, unknown>; base: string } | undefined> => {
  let paths: { value: Record<string, unknown>; dir: string } | undefined
  let baseUrl: string | undefined
  const seen = new Set<string>()
  let current: string | undefined = file
  while (current && !seen.has(current) && existsSync(current)) {
    seen.add(current)
    const tsconfig = await readJsonSafe<TsconfigJson>(current).catch(() => null)
    const options = tsconfig?.compilerOptions
    if (!paths && options?.paths) {
      paths = { value: options.paths, dir: dirname(current) }
    }
    if (!baseUrl && options?.baseUrl) {
      baseUrl = resolve(dirname(current), options.baseUrl)
    }
    const parent = [tsconfig?.extends].flat()[0]
    current =
      typeof parent === 'string' && parent.startsWith('.')
        ? resolve(
            dirname(current),
            parent.endsWith('.json') ? parent : `${parent}.json`
          )
        : undefined
  }
  return paths && { paths: paths.value, base: baseUrl ?? paths.dir }
}

export type PikkuMapping = {
  /** Where it is declared, e.g. `tsconfig.json paths "#pikku/*"`. */
  source: string
  key: string
  /** The absolute target, or undefined when it names a package we cannot place. */
  target: string | undefined
}

/**
 * Every `#pikku*` mapping that applies to the code in `pkg`: the package's own
 * package.json `imports`, and the `paths` of the tsconfig that governs it (its
 * own, or the nearest one above it up to `configDir`).
 *
 * A functions package below the config reaches `<config dir>/.pikku` through
 * tsconfig `paths` — Node refuses an `imports` target that leaves the package
 * (`../`), and the workspace root is not a package a member can depend on.
 */
export async function pikkuMappingsOf(
  pkg: string,
  configDir: string
): Promise<PikkuMapping[]> {
  const mappings: PikkuMapping[] = []
  const tsconfigFile = governingTsconfig(pkg, configDir)
  const tsconfig = tsconfigFile && (await readTsconfigPaths(tsconfigFile))
  if (tsconfig && tsconfigFile) {
    const name = relative(configDir, tsconfigFile)
    for (const [key, value] of Object.entries(tsconfig.paths)) {
      if (!key.startsWith('#pikku')) continue
      for (const target of stringTargets(value)) {
        mappings.push({
          source: `${name} paths "${key}"`,
          key,
          target: resolve(tsconfig.base, target),
        })
      }
    }
  }
  const rootPkgName = (await readPkg(configDir))?.name
  const pkgJson = await readPkg(pkg)
  for (const [key, value] of Object.entries(pkgJson?.imports ?? {})) {
    if (!key.startsWith('#pikku')) continue
    for (const target of stringTargets(value)) {
      let abs: string | undefined
      if (target.startsWith('.')) {
        abs = resolve(pkg, target)
      } else if (rootPkgName && target.startsWith(rootPkgName + '/')) {
        abs = join(configDir, target.slice(rootPkgName.length + 1))
      }
      mappings.push({
        source: `package.json imports "${key}"`,
        key,
        target: abs,
      })
    }
  }
  return mappings
}

export async function runProjectLayoutChecks(
  configDir: string,
  options: { strict?: boolean } = {}
): Promise<ValidateFinding[]> {
  const severity = options.strict ? 'error' : 'warn'
  const findings: ValidateFinding[] = []
  const rel = (p: string) => relative(configDir, p) || '.'

  let config: LayoutConfig | null
  try {
    config = await readJsonSafe<LayoutConfig>(join(configDir, CONFIG))
  } catch {
    // An unparseable config is reported by the app-project check.
    return []
  }
  if (!config) return []

  // 1. The config sits at the project top level.
  const ownPkg = await readPkg(configDir)
  if (existsSync(join(configDir, 'package.json')) && !ownPkg?.workspaces) {
    const top = await findWorkspaceRootAbove(configDir)
    // A workspace that holds several projects (a monorepo of examples) has no
    // single top level; and a workspace root with its own config is reported
    // below, as a second config.
    if (
      top &&
      !existsSync(join(top, CONFIG)) &&
      (await findNestedConfigs(top, 2)).length === 1
    ) {
      findings.push({
        id: LAYOUT_CONFIG_NOT_AT_ROOT,
        severity,
        message: `pikku.config.json is inside the package ${relative(top, configDir)}; it belongs at the project top level (${top}), beside the workspace package.json`,
        path: join(configDir, CONFIG),
        fixHint: `Move pikku.config.json, db/ and emails/ to ${top}, rewrite its paths (emailTemplatesDir, ...) relative to it, and point #pikku/* at ${join(top, '.pikku')}.`,
      })
    }
  }

  // 2. Exactly one config in the project, apart from the packages of its workspace.
  const rootDir =
    typeof config.rootDir === 'string'
      ? resolve(configDir, config.rootDir)
      : configDir
  const listedConfigs = new Set(
    findWorkspaceConfigs(rootDir)
      .filter((member) => isMarkedPackage(member.config))
      .map((member) => join(member.dir, CONFIG))
  )
  for (const extra of await findNestedConfigs(configDir)) {
    if (listedConfigs.has(extra)) continue
    findings.push({
      id: LAYOUT_CONFIG_DUPLICATE,
      severity,
      message: `a second pikku.config.json at ${rel(extra)}; a project has exactly one, at its top level (${join(configDir, CONFIG)}), plus one in its main package and in each addon of its workspace`,
      path: extra,
      fixHint:
        'Merge what it sets into the top-level pikku.config.json and delete it, or make it a workspace package with a "main": true or "addon" marker. An addon keeps its own config only beside types/application-types.d.ts.',
    })
  }

  const mainEntry = findMainEntry(rootDir)
  const packages = [
    ...new Set(
      (mainEntry ? [mainEntry] : []).map((d) =>
        packageOf(resolve(rootDir, d), configDir)
      )
    ),
  ]
  const nestedPackages = packages.filter((p) => p !== configDir)

  // 3. db/ and emails/ beside the config, not in a functions package.
  const rootDb = join(rootDir, 'db')
  const emailTemplatesDir =
    typeof config.emailTemplatesDir === 'string'
      ? isAbsolute(config.emailTemplatesDir)
        ? config.emailTemplatesDir
        : join(configDir, config.emailTemplatesDir)
      : undefined
  const rootEmails = emailTemplatesDir ?? join(configDir, 'emails')
  for (const pkg of nestedPackages) {
    const pkgDb = join(pkg, 'db')
    if (existsSync(pkgDb) && !existsSync(rootDb)) {
      findings.push({
        id: LAYOUT_DB_IN_PACKAGE,
        severity,
        message: `db/ is inside the package ${rel(pkg)}; it belongs beside pikku.config.json (${rootDb})`,
        path: pkgDb,
        fixHint: `Move ${rel(pkgDb)} to ${rel(rootDb)}: pikku db reads migrations and tables from <rootDir>/db.`,
      })
    }
    const pkgEmails = join(pkg, 'emails')
    if (
      existsSync(pkgEmails) &&
      !existsSync(rootEmails) &&
      !isInside(rootEmails, pkg)
    ) {
      findings.push({
        id: LAYOUT_EMAILS_IN_PACKAGE,
        severity,
        message: `emails/ is inside the package ${rel(pkg)}; it belongs beside pikku.config.json (${rootEmails})`,
        path: pkgEmails,
        fixHint: `Move ${rel(pkgEmails)} to ${rel(rootEmails)} and set "emailTemplatesDir": "${rel(rootEmails)}" in pikku.config.json.`,
      })
    } else if (emailTemplatesDir && isInside(emailTemplatesDir, pkg)) {
      findings.push({
        id: LAYOUT_EMAILS_IN_PACKAGE,
        severity,
        message: `emailTemplatesDir points inside the package ${rel(pkg)}; email templates belong beside pikku.config.json (${join(configDir, 'emails')})`,
        path: emailTemplatesDir,
        fixHint: `Move ${rel(emailTemplatesDir)} to emails/ and set "emailTemplatesDir": "emails" in pikku.config.json.`,
      })
    }
  }

  // 4. #pikku/* resolves to the generated output of the package that owns the
  // code. A package with a pikku.config.json of its own (the main package) has its own
  // pass and its own `.pikku`, which its package.json `imports` name. Any other
  // package below the config reaches <config dir>/.pikku through tsconfig `paths`
  // (in its own tsconfig or the one above it); a package.json `imports` there can
  // only name a `.pikku` inside the package, which is a copy or a symlink.
  const rootOut = join(configDir, '.pikku')
  for (const pkg of packages) {
    const ownsPass = pkg !== configDir && existsSync(join(pkg, CONFIG))
    const outDir = ownsPass ? join(pkg, '.pikku') : rootOut
    const wrong = new Set<string>()
    for (const mapping of await pikkuMappingsOf(pkg, configDir)) {
      const dir = mapping.target && pikkuDirOf(mapping.target)
      if (dir && dir !== outDir) wrong.add(mapping.source)
    }
    if (wrong.size === 0) continue
    const tsconfigFile =
      governingTsconfig(pkg, configDir) ?? join(pkg, 'tsconfig.json')
    const toOut = relative(dirname(tsconfigFile), outDir)
    const target = toOut.startsWith('..') ? toOut : `./${toOut}`
    findings.push({
      id: LAYOUT_PIKKU_IMPORT_NOT_ROOT,
      severity,
      message: `${rel(pkg) === '.' ? 'the project' : `the package ${rel(pkg)}`} resolves #pikku/* to a .pikku that is not the generated output (${[...wrong].join(', ')}); generated files are always written to ${outDir}`,
      path: pkg,
      fixHint: ownsPass
        ? `Point every #pikku/* entry in ${rel(pkg)}/package.json "imports" at ./.pikku: this package has its own pikku.config.json, so its generated files are in ${rel(outDir)}.`
        : pkg === configDir
          ? 'Point every #pikku/* mapping at ./.pikku beside pikku.config.json.'
          : `Map #pikku/* with tsconfig paths in ${rel(tsconfigFile)}: "#pikku/*.js": ["${target}/*.ts"], "#pikku/*": ["${target}/*/index.ts"]. Remove the #pikku entries from ${rel(pkg)}/package.json "imports" and any ${rel(pkg)}/.pikku symlink: Node refuses an imports target outside the package.`,
    })
  }

  return findings
}
