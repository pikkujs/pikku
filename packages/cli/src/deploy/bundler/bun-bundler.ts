/**
 * Bun (Bun.build) bundler backend.
 *
 * Used when the CLI runs under Bun (bun projects). Bun resolves its own `.bun`
 * store / per-workspace symlinks natively — esbuild's `nodePaths` walk assumes a
 * hoisted root and can't — so no esbuild dependency is needed. Bun's metafile
 * does NOT record external imports, so externals are captured via the resolve
 * plugin instead (that capture drives per-unit dependency extraction).
 */

import { writeFile } from 'node:fs/promises'

import { BaseBundler } from './bundler.js'
import type { CompileInput, CompileResult } from './bundler.interface.js'

/**
 * Minimal typing for the subset of Bun's bundler API used here. The CLI does not
 * depend on `@types/bun` (it also runs under Node), so the `Bun` global is
 * accessed through this structural type rather than the ambient one.
 */
interface BunBuildArtifact {
  kind: string
  text(): Promise<string>
}
interface BunBuildResult {
  success: boolean
  logs: unknown[]
  outputs: BunBuildArtifact[]
  metafile?: unknown
}
interface BunPlugin {
  name: string
  setup(build: {
    onResolve(
      opts: { filter: RegExp; namespace?: string },
      cb: (args: {
        path: string
        importer: string
      }) => { path: string; namespace?: string; external?: boolean } | undefined
    ): void
    onLoad(
      opts: { filter: RegExp; namespace?: string },
      cb: () => { contents: string; loader: string }
    ): void
  }): void
}
interface BunBuildApi {
  build(opts: {
    entrypoints: string[]
    target?: 'browser' | 'node' | 'bun'
    format?: 'esm' | 'cjs' | 'iife'
    minify?:
      | boolean
      | { whitespace?: boolean; identifiers?: boolean; syntax?: boolean }
    sourcemap?: 'none' | 'linked' | 'external' | 'inline'
    define?: Record<string, string>
    banner?: string
    external?: string[]
    metafile?: boolean
    plugins?: BunPlugin[]
  }): Promise<BunBuildResult>
}

function getBun(): BunBuildApi {
  const bun = (globalThis as { Bun?: BunBuildApi }).Bun
  if (!bun) {
    throw new Error('BunBundler used outside the Bun runtime')
  }
  return bun
}

const pkgHead = (spec: string): string =>
  spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : spec.split('/')[0]

/**
 * Unified resolve plugin. Bun resolves its `.bun` store natively, so this plugin
 * only replicates the option-driven behaviour the esbuild backend gets for free:
 *   - `aliases`: rewrite bare builtins to their `node:`-prefixed form (CF's
 *     nodejs_compat_v2 only resolves prefixed imports).
 *   - stub patterns (dead services + provider `stubModules`): empty module.
 *   - `externals`: keep external (node:*, cloudflare:*, declared npm deps) and
 *     CAPTURE the real npm package names — Bun's metafile omits external
 *     imports, so capture is how per-unit dependency extraction works.
 */
function createBunResolvePlugin(opts: {
  aliases?: Record<string, string>
  externals: string[]
  stubPatterns: RegExp[]
  captured: Set<string>
}): BunPlugin {
  const { aliases, externals, stubPatterns, captured } = opts
  const externalMatchers = externals.map((pat) => {
    if (pat.endsWith('*')) {
      const prefix = pat.slice(0, -1)
      return (s: string) => s.startsWith(prefix)
    }
    return (s: string) => s === pat || s.startsWith(pat + '/')
  })
  return {
    name: 'pikku-bun-resolve',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        let path = args.path
        // Relative / absolute → let Bun resolve natively.
        if (path.startsWith('.') || path.startsWith('/')) return
        // Builtin alias (e.g. crypto → node:crypto).
        if (aliases && aliases[path]) path = aliases[path]
        // Dead/stubbed modules → empty module.
        if (stubPatterns.some((re) => re.test(path))) {
          return { path, namespace: 'pikku-stub' }
        }
        // node: builtins are always external (covers aliased builtins on CF).
        if (path.startsWith('node:')) return { path, external: true }
        // Provider externals (cloudflare:*, declared npm deps).
        if (externalMatchers.some((m) => m(path))) {
          // Only real npm packages are install-time deps (skip scheme imports).
          if (!path.includes(':')) captured.add(pkgHead(path))
          return { path, external: true }
        }
        // Everything else → Bun bundles it (resolving the .bun store natively).
        return
      })
      build.onLoad({ filter: /.*/, namespace: 'pikku-stub' }, () => ({
        contents: 'export {}',
        loader: 'js',
      }))
    },
  }
}

export class BunBundler extends BaseBundler {
  protected async compile(input: CompileInput): Promise<CompileResult> {
    const captured = new Set<string>()
    const result = await getBun().build({
      entrypoints: [input.entryPath],
      target: input.platform === 'node' ? 'node' : 'browser',
      format: input.format === 'cjs' ? 'cjs' : 'esm',
      // identifiers:true is safe — pikku's only name-based reflection
      // (error→status mapping) compares a class against an instance of the SAME
      // (consistently-renamed) class, and workflow exceptions hardcode their
      // `.name` string. So full minification preserves correctness.
      minify: { whitespace: true, syntax: true, identifiers: true },
      sourcemap: input.sourcemap ? 'external' : 'none',
      define: input.define,
      banner: input.bannerJs,
      external: input.externals,
      metafile: input.emitMetafile,
      plugins: [
        createBunResolvePlugin({
          aliases: input.aliases,
          externals: input.externals,
          stubPatterns: input.deadPatterns,
          captured,
        }),
      ],
    })
    if (!result.success) {
      throw new Error(
        `Bun.build failed for unit "${input.unitName}":\n` +
          result.logs.map((l) => String(l)).join('\n')
      )
    }

    const entryArtifact =
      result.outputs.find((o) => o.kind === 'entry-point') ?? result.outputs[0]
    await writeFile(input.bundlePath, await entryArtifact.text(), 'utf-8')
    if (input.sourcemap) {
      const mapArtifact = result.outputs.find((o) => o.kind === 'sourcemap')
      if (mapArtifact) {
        await writeFile(
          `${input.bundlePath}.map`,
          await mapArtifact.text(),
          'utf-8'
        )
      }
    }

    return {
      externalPackages: captured,
      metafileJson:
        input.emitMetafile && result.metafile
          ? JSON.stringify(result.metafile, null, 2)
          : undefined,
    }
  }
}
