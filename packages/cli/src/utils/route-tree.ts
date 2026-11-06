import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runScript } from './run-script.js'
import type { CheckDiagnostic } from './warm-typecheck.js'

const ROUTE_SCRIPTS = ['routes', 'generate:routes']
const FRAMEWORKS = ['react', 'solid', 'vue']
const GENERATOR = '@tanstack/router-generator'
const CLI = '@tanstack/router-cli'
const PLUGIN = '@tanstack/router-plugin'
const START_CORE = '@tanstack/start-plugin-core'

type PackageJson = {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  exports?: Record<string, any>
  module?: string
  main?: string
}

type RouterGenerator = {
  getConfig: (inline: object, configDirectory: string) => object
  Generator: new (options: { config: object; root: string }) => {
    run: () => Promise<void>
  }
}

const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

const dependenciesOf = (dir: string): Record<string, string> => {
  const pkg = readJson<PackageJson>(join(dir, 'package.json'))
  return { ...pkg?.dependencies, ...pkg?.devDependencies }
}

const frameworkOf = (
  dependencies: Record<string, string>,
  suffix: string
): string | undefined =>
  FRAMEWORKS.find((name) => dependencies[`@tanstack/${name}-${suffix}`])

/** Where the routes and their tree are: tsr.config.json, or the plugin's defaults. */
const routePaths = (dir: string) => {
  const config = readJson<{
    routesDirectory?: string
    generatedRouteTree?: string
  }>(join(dir, 'tsr.config.json'))
  return {
    routes: resolve(dir, config?.routesDirectory ?? 'src/routes'),
    tree: resolve(dir, config?.generatedRouteTree ?? 'src/routeTree.gen.ts'),
  }
}

/** Code routes need no tree, so the tooling alone is not enough to generate one. */
const usesFileRoutes = (dir: string): boolean => {
  const dependencies = dependenciesOf(dir)
  const hasTool =
    GENERATOR in dependencies ||
    CLI in dependencies ||
    PLUGIN in dependencies ||
    !!frameworkOf(dependencies, 'start')
  return hasTool && existsSync(routePaths(dir).routes)
}

/** The paths whose change means a frontend's route tree may be out of date. */
export const routeWatchPaths = (dirs: string[]): string[] =>
  dirs.filter(usesFileRoutes).flatMap((dir) => {
    const { routes, tree } = routePaths(dir)
    return [routes, tree]
  })

const findPackage = (from: string, name: string): string | undefined => {
  for (let at = from; ; at = dirname(at)) {
    const candidate = join(at, 'node_modules', name)
    if (existsSync(candidate)) return realpathSync(candidate)
    if (dirname(at) === at) return undefined
  }
}

/** The generator as the project resolves it, directly or through its tooling. */
const findGenerator = (dir: string): string | undefined => {
  const framework = frameworkOf(dependenciesOf(dir), 'start') ?? 'react'
  const routes = [
    [GENERATOR],
    [CLI, GENERATOR],
    [PLUGIN, GENERATOR],
    [`@tanstack/${framework}-start`, START_CORE, PLUGIN, GENERATOR],
  ]
  for (const route of routes) {
    let at: string | undefined = dir
    for (const name of route) at = at && findPackage(at, name)
    if (at) return at
  }
  return undefined
}

const loadGenerator = async (dir: string): Promise<RouterGenerator> => {
  const root = findGenerator(dir)
  if (!root) {
    throw new Error(`${GENERATOR} is not installed; add it to devDependencies`)
  }
  const pkg = readJson<PackageJson>(join(root, 'package.json'))
  const entry =
    pkg?.exports?.['.']?.import?.default ??
    pkg?.exports?.['.']?.import ??
    pkg?.module ??
    pkg?.main
  return import(pathToFileURL(join(root, entry)).href)
}

const sourceEntry = (dir: string, name: string): string | undefined =>
  ['ts', 'tsx']
    .map((extension) => join(dir, 'src', `${name}.${extension}`))
    .find(existsSync)

/**
 * What TanStack Start appends to the tree: without it, `Link` and friends are not
 * typed by the app's router. A copy of the plugin's footer, because the plugin
 * builds it from its resolved Vite config and exports no way to reach it.
 */
const startFooter = (dir: string, tree: string, framework: string) => {
  const router = sourceEntry(dir, 'router')
  if (!router) return []
  const importPath = (file: string) => {
    const path = relative(dirname(tree), file)
    return path.startsWith('.') ? path : `./${path}`
  }
  const start = sourceEntry(dir, 'start')
  return [
    [
      `import type { getRouter } from '${importPath(router)}'`,
      start
        ? `import type { startInstance } from '${importPath(start)}'`
        : `import type { createStart } from '@tanstack/${framework}-start'`,
      `declare module '@tanstack/${framework}-start' {`,
      '  interface Register {',
      '    ssr: true',
      '    router: Awaited<ReturnType<typeof getRouter>>',
      ...(start
        ? ['    config: Awaited<ReturnType<typeof startInstance.getOptions>>']
        : []),
      '  }',
      '}',
    ].join('\n'),
  ]
}

const generate = async (dir: string): Promise<void> => {
  const { Generator, getConfig } = await loadGenerator(dir)
  const dependencies = dependenciesOf(dir)
  const start = frameworkOf(dependencies, 'start')
  const config = getConfig(
    {
      disableLogging: true,
      target: start ?? frameworkOf(dependencies, 'router') ?? 'react',
      ...(start
        ? { routeTreeFileFooter: startFooter(dir, routePaths(dir).tree, start) }
        : {}),
    },
    dir
  )
  // The generator compares before it writes, so an unchanged tree keeps its mtime
  // and neither Vite nor the watcher hears about it.
  await new Generator({ config, root: dir }).run()
}

const withTimeout = <T>(work: Promise<T>, timeoutMs?: number): Promise<T> => {
  if (!timeoutMs) return work
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

const failure = (dir: string, reason: string): CheckDiagnostic => ({
  severity: 'error',
  code: 'ROUTES',
  message: `Could not generate the route tree in ${dir}: ${reason}`,
})

/**
 * The route tree is generated and gitignored, and normally only a running Vite
 * writes it, so a type check would otherwise depend on one being up. A `routes`
 * script wins; otherwise the project's own generator runs here.
 */
export const generateRouteTrees = async (
  dirs: string[],
  timeoutMs?: number
): Promise<CheckDiagnostic[]> => {
  const problems: CheckDiagnostic[] = []
  for (const dir of dirs.filter(usesFileRoutes)) {
    const { scripts } = readJson<PackageJson>(join(dir, 'package.json')) ?? {}
    const script = ROUTE_SCRIPTS.find((name) => scripts?.[name])
    if (script) {
      const failed = await runScript(dir, script, timeoutMs)
      if (failed) problems.push(failure(dir, `${script} script: ${failed}`))
      continue
    }
    try {
      await withTimeout(generate(dir), timeoutMs)
    } catch (error) {
      problems.push(
        failure(dir, error instanceof Error ? error.message : String(error))
      )
    }
  }
  return problems
}
