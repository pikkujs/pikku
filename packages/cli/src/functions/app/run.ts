import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import {
  NATIVE_PROJECT_DIR,
  checkNativeProject,
  createNativeProject,
  defaultNativeIdentifier,
  nativePackageJson,
  nativeSpecProblems,
  renderNativeNextSteps,
  syncNativeProject,
  type NativeMode,
  type NativeProblem,
  type NativeProjectSpec,
} from '@pikku/deploy-standalone/native'

import type {
  PikkuFrontendInput,
  PikkuNativeInput,
  PikkuNativePlatform,
} from '../../../types/config.js'
import type {
  AppListOutput,
  AppNativeAddInput,
  AppNativeCheckInput,
  AppNativeCheckOutput,
  AppNativeInitInput,
  AppNativeUpgradeInput,
  AppNativeWriteOutput,
} from './schemas.js'

/** Where the commands read and write: the project's own `pikku.config.json`. */
export type AppProject = {
  configDir: string
  rootDir: string
}

const CONFIG_FILE = 'pikku.config.json'

type RawConfig = {
  frontends?: Record<string, PikkuFrontendInput>
  [key: string]: unknown
}

/**
 * The config as written, not as resolved: the commands write it back, and a
 * resolved config has absolute paths and filled-in defaults nobody typed.
 */
const readRawConfig = (project: AppProject): RawConfig => {
  const path = join(project.configDir, CONFIG_FILE)
  if (!existsSync(path)) {
    throw new AppRefusal(
      `no ${CONFIG_FILE} in ${project.configDir} — apps are declared in its "frontends"`
    )
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as RawConfig
}

const writeRawConfig = (project: AppProject, config: RawConfig): void => {
  writeFileSync(
    join(project.configDir, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf-8'
  )
}

class AppRefusal extends Error {}

const frontendOf = (config: RawConfig, name: string): PikkuFrontendInput => {
  const frontend = config.frontends?.[name]
  if (!frontend) {
    const known = Object.keys(config.frontends ?? {})
    throw new AppRefusal(
      known.length > 0
        ? `no frontend named "${name}" — this project has ${known.join(', ')}`
        : `no frontend named "${name}", and "frontends" in ${CONFIG_FILE} is empty. Create one with \`pikku app new ${name}\`.`
    )
  }
  return frontend
}

const absolute = (base: string, path: string) =>
  isAbsolute(path) ? path : join(base, path)

const cwdOf = (project: AppProject, frontend: PikkuFrontendInput) =>
  absolute(project.configDir, frontend.cwd)

const distOf = (project: AppProject, frontend: PikkuFrontendInput) =>
  absolute(cwdOf(project, frontend), frontend.dist ?? 'dist')

const nativeDirOf = (project: AppProject, frontend: PikkuFrontendInput) =>
  join(cwdOf(project, frontend), NATIVE_PROJECT_DIR)

const modeOf = (
  project: AppProject,
  frontend: PikkuFrontendInput,
  native: PikkuNativeInput
): NativeMode => {
  if (native.url && native.bundleServer) {
    throw new AppRefusal(
      'native sets both "url" and "bundleServer" — the window shows either a deployed server or the bundled one, not both'
    )
  }
  if (native.url) return { kind: 'url', url: native.url }
  if (native.bundleServer) return { kind: 'sidecar' }
  return {
    kind: 'bundle',
    frontendDist: relative(
      nativeDirOf(project, frontend),
      distOf(project, frontend)
    ),
  }
}

const specOf = (
  project: AppProject,
  name: string,
  frontend: PikkuFrontendInput,
  native: PikkuNativeInput
): NativeProjectSpec => ({
  dir: nativeDirOf(project, frontend),
  name,
  identifier: native.identifier,
  productName: native.productName ?? name,
  platforms: native.platforms,
  plugins: native.plugins ?? [],
  mode: modeOf(project, frontend, native),
  devUrl: frontend.dev?.port
    ? `http://localhost:${frontend.dev.port}`
    : undefined,
})

/** Every other app holding `identifier` — the OS would treat them as one app. */
const identifierClashes = (
  config: RawConfig,
  name: string,
  identifier: string
): string[] =>
  Object.entries(config.frontends ?? {})
    .filter(
      ([other, frontend]) =>
        other !== name && frontend.native?.identifier === identifier
    )
    .map(([other]) => other)

const assertAcceptable = (
  config: RawConfig,
  name: string,
  frontend: PikkuFrontendInput,
  spec: NativeProjectSpec
): void => {
  if (spec.mode.kind === 'bundle' && frontend.kind === 'ssr') {
    throw new AppRefusal(
      `"${name}" is a server-rendered frontend (kind: "ssr"), and a native app has no server to render it. ` +
        'Build it as a static SPA and set its kind to "spa", or pass --url <deployed origin> to open the running site instead.'
    )
  }
  const clashes = identifierClashes(config, name, spec.identifier)
  if (clashes.length > 0) {
    throw new AppRefusal(
      `${spec.identifier} is already ${clashes.join(', ')}'s identifier. Two apps sharing one replace each other on install and share a data directory — pass --identifier.`
    )
  }
  const problems = nativeSpecProblems(spec)
  if (problems.length > 0) {
    throw new AppRefusal(problems.join('; '))
  }
}

const splitList = (raw: string | readonly string[] | undefined): string[] =>
  (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
    .flatMap((entry: string) => entry.split(','))
    .map((entry: string) => entry.trim().toLowerCase())
    .filter(Boolean)

const rootPackageName = (project: AppProject): string | undefined => {
  try {
    return JSON.parse(
      readFileSync(join(project.rootDir, 'package.json'), 'utf-8')
    ).name
  } catch {
    return undefined
  }
}

/**
 * Add the Tauri CLI, its JS API and one package per plugin to the frontend's
 * `package.json`, leaving any version already there alone.
 */
const syncPackageJson = (dir: string, plugins: readonly string[]): boolean => {
  const path = join(dir, 'package.json')
  if (!existsSync(path)) return false
  const before = readFileSync(path, 'utf-8')
  const pkg = JSON.parse(before)
  const wanted = nativePackageJson(plugins)
  for (const field of ['dependencies', 'devDependencies', 'scripts'] as const) {
    pkg[field] = { ...wanted[field], ...pkg[field] }
  }
  const after = `${JSON.stringify(pkg, null, 2)}\n`
  if (after === before) return false
  writeFileSync(path, after, 'utf-8')
  return true
}

/** How this project runs a package script, judged by its lockfile. */
const scriptRunner = (project: AppProject): string => {
  const has = (file: string) => existsSync(join(project.rootDir, file))
  if (has('bun.lock') || has('bun.lockb')) return 'bun run'
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  return 'npm run'
}

const hasRust = (): boolean =>
  spawnSync('rustc', ['-V'], { stdio: 'ignore' }).status === 0

const refused = (name: string, error: unknown): AppNativeWriteOutput => {
  if (!(error instanceof AppRefusal)) throw error
  return {
    name,
    dir: '',
    created: false,
    written: [],
    nextSteps: [],
    refusal: error.message,
  }
}

/**
 * Write the native project a frontend's `native` entry describes, and the
 * entry itself: the config is the source of truth, so the flags given here are
 * saved there first and every later `add`, `upgrade` and `check` reads them
 * back from it.
 */
export const runAppNativeInit = async (
  project: AppProject,
  input: AppNativeInitInput
): Promise<AppNativeWriteOutput> => {
  try {
    const config = readRawConfig(project)
    const frontend = frontendOf(config, input.name)
    const existing: Partial<PikkuNativeInput> = frontend.native ?? {}

    const flagged = (
      [
        input.desktop && 'desktop',
        input.android && 'android',
        input.ios && 'ios',
      ] as const
    ).filter(Boolean) as PikkuNativePlatform[]
    const bundleServer = input.url
      ? undefined
      : (input.bundleServer ?? existing.bundleServer)
    const native: PikkuNativeInput = {
      identifier:
        input.identifier ??
        existing.identifier ??
        defaultNativeIdentifier(rootPackageName(project), input.name),
      productName: input.productName ?? existing.productName,
      platforms:
        flagged.length > 0
          ? flagged
          : (existing.platforms ??
            (bundleServer ? ['desktop'] : ['desktop', 'android', 'ios'])),
      plugins: [
        ...new Set([...(existing.plugins ?? []), ...splitList(input.plugins)]),
      ],
      url: input.bundleServer ? undefined : (input.url ?? existing.url),
      bundleServer,
    }
    const cleaned = Object.fromEntries(
      Object.entries(native).filter(([, value]) => value !== undefined)
    ) as PikkuNativeInput

    const spec = specOf(project, input.name, frontend, cleaned)
    assertAcceptable(config, input.name, frontend, spec)

    frontend.native = cleaned
    writeRawConfig(project, config)

    const created = !existsSync(join(spec.dir, 'tauri.conf.json'))
    const { written } = created
      ? await createNativeProject(spec)
      : await syncNativeProject(spec)
    if (syncPackageJson(cwdOf(project, frontend), spec.plugins)) {
      written.push('../package.json')
    }

    return {
      name: input.name,
      dir: spec.dir,
      created,
      written,
      nextSteps: renderNativeNextSteps({
        cwd: relative(process.cwd(), cwdOf(project, frontend)) || '.',
        run: scriptRunner(project),
        mode: spec.mode,
        platforms: spec.platforms,
        plugins: spec.plugins,
        hasRust: hasRust(),
      }),
      refusal: null,
    }
  } catch (error) {
    return refused(input.name, error)
  }
}

const nativeOf = (
  frontend: PikkuFrontendInput,
  name: string
): PikkuNativeInput => {
  if (!frontend.native) {
    throw new AppRefusal(
      `"${name}" has no native app yet. Create one with \`pikku app native init ${name}\`.`
    )
  }
  return frontend.native
}

const runSync = async (
  project: AppProject,
  name: string,
  change: (native: PikkuNativeInput) => PikkuNativeInput
): Promise<AppNativeWriteOutput> => {
  try {
    const config = readRawConfig(project)
    const frontend = frontendOf(config, name)
    const before = nativeOf(frontend, name)
    const native = change(before)
    const spec = specOf(project, name, frontend, native)
    assertAcceptable(config, name, frontend, spec)

    if (native !== before) {
      frontend.native = native
      writeRawConfig(project, config)
    }
    const { written } = await syncNativeProject(spec)
    if (syncPackageJson(cwdOf(project, frontend), spec.plugins)) {
      written.push('../package.json')
    }
    return {
      name,
      dir: spec.dir,
      created: false,
      written,
      nextSteps: [],
      refusal: null,
    }
  } catch (error) {
    return refused(name, error)
  }
}

/** Add plugins to a native app: the config first, then pikku's files from it. */
export const runAppNativeAdd = (
  project: AppProject,
  input: AppNativeAddInput
): Promise<AppNativeWriteOutput> => {
  const plugins = splitList(input.plugins)
  if (plugins.length === 0) {
    return Promise.resolve(
      refused(
        input.name,
        new AppRefusal(
          `name the plugins to add, e.g. \`pikku app native add ${input.name} store biometric\``
        )
      )
    )
  }
  return runSync(project, input.name, (native) => ({
    ...native,
    plugins: [...new Set([...(native.plugins ?? []), ...plugins])],
  }))
}

/** Rewrite pikku's half of a native app from the config as it stands. */
export const runAppNativeUpgrade = (
  project: AppProject,
  input: AppNativeUpgradeInput
): Promise<AppNativeWriteOutput> =>
  runSync(project, input.name, (native) => native)

/**
 * Check one native app, or every one — including the problems only visible
 * across apps, like two sharing an identifier.
 */
export const runAppNativeCheck = async (
  project: AppProject,
  input: AppNativeCheckInput
): Promise<AppNativeCheckOutput> => {
  try {
    const config = readRawConfig(project)
    const names = input.name
      ? [input.name]
      : Object.entries(config.frontends ?? {})
          .filter(([, frontend]) => frontend.native)
          .map(([name]) => name)

    const apps: AppNativeCheckOutput['apps'] = []
    for (const name of names) {
      const frontend = frontendOf(config, name)
      const native = nativeOf(frontend, name)
      const problems: NativeProblem[] = []
      const clashes = identifierClashes(config, name, native.identifier)
      if (clashes.length > 0) {
        problems.push({
          level: 'error',
          message: `${native.identifier} is also ${clashes.join(', ')}'s identifier — the OS would treat them as one app`,
          fix: `give each app its own native.identifier in ${CONFIG_FILE}`,
        })
      }
      try {
        const spec = specOf(project, name, frontend, native)
        if (spec.mode.kind === 'bundle' && frontend.kind === 'ssr') {
          problems.push({
            level: 'error',
            message: `"${name}" is server-rendered (kind: "ssr"), so there is no static build to bundle`,
            fix: 'build it as a static SPA, or set native.url to a deployed origin',
          })
        }
        problems.push(
          ...(await checkNativeProject(spec, {
            distDir: distOf(project, frontend),
          }))
        )
      } catch (error) {
        if (!(error instanceof AppRefusal)) throw error
        problems.push({
          level: 'error',
          message: error.message,
          fix: `correct "${name}".native in ${CONFIG_FILE}`,
        })
      }
      apps.push({ name, problems })
    }
    return { apps, refusal: null }
  } catch (error) {
    if (!(error instanceof AppRefusal)) throw error
    return { apps: [], refusal: error.message }
  }
}

/** Every app in `frontends`, with where it lives and what it ships as. */
export const runAppList = (project: AppProject): AppListOutput => {
  const config = readRawConfig(project)
  return {
    apps: Object.entries(config.frontends ?? {}).map(([name, frontend]) => ({
      name,
      cwd: frontend.cwd,
      kind: frontend.kind ?? null,
      serves: frontend.serves ?? null,
      servedAt: frontend.serve ? (frontend.serve.urlPrefix ?? '/') : null,
      native: frontend.native
        ? {
            identifier: frontend.native.identifier,
            platforms: frontend.native.platforms,
            mode: frontend.native.url
              ? ('url' as const)
              : frontend.native.bundleServer
                ? ('sidecar' as const)
                : ('bundle' as const),
            plugins: frontend.native.plugins ?? [],
          }
        : null,
    })),
  }
}
