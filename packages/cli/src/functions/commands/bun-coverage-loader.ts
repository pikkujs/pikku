import { readFile } from 'node:fs/promises'

export interface BunCoverageLoaderOptions {
  rootDir: string
}

interface BunPluginBuild {
  onLoad(
    constraints: { filter: RegExp },
    callback: (args: {
      path: string
    }) => Promise<{ contents: string; loader: 'ts' | 'tsx' } | undefined>
  ): void
}

interface BunGlobal {
  plugin(plugin: { name: string; setup(build: BunPluginBuild): void }): void
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const shouldInstrument = (path: string) =>
  !path.includes('/node_modules/') &&
  !path.includes('/.pikku/') &&
  !/\.(gen|test|d)\.tsx?$/.test(path)

/**
 * Registers a Bun loader plugin that runs istanbul-lib-instrument over the
 * project's TypeScript sources so `__coverage__` counters exist at runtime.
 * Bun has no V8 precise coverage (`node:inspector` throws "Coverage APIs are
 * not supported"), so instrumentation at load time is the coverage backend
 * there. Must be called before the user bootstrap is imported.
 */
export async function registerBunCoverageLoader({
  rootDir,
}: BunCoverageLoaderOptions): Promise<void> {
  const bun = (globalThis as { Bun?: BunGlobal }).Bun
  if (!bun) {
    throw new Error('registerBunCoverageLoader called outside Bun')
  }
  const { createInstrumenter } = await import('istanbul-lib-instrument')
  const instrumenter = createInstrumenter({
    esModules: true,
    compact: false,
    parserPlugins: [
      'typescript',
      'importAttributes',
      'topLevelAwait',
      'decorators-legacy',
    ],
  })
  const filter = new RegExp(`^${escapeRegExp(rootDir)}/.*\\.tsx?$`)
  bun.plugin({
    name: 'pikku-istanbul-coverage',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        // Bun (≥1.3.14) rejects `return undefined` from onLoad with
        // "onLoad() expects an object returned", so non-instrumented files
        // (.gen/.test/.d, node_modules) pass through as an object instead.
        const source = await readFile(args.path, 'utf-8')
        const loader = args.path.endsWith('.tsx') ? 'tsx' : 'ts'
        if (!shouldInstrument(args.path)) return { contents: source, loader }
        return { contents: instrumenter.instrumentSync(source, args.path), loader }
      })
    },
  })
}
