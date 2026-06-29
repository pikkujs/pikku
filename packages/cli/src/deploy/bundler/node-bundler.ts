/**
 * Node (esbuild) bundler backend.
 *
 * Used when the CLI runs under Node (yarn/npm projects). esbuild resolves deps
 * via `nodePaths` walking up the directory tree, which assumes a flat, hoisted
 * `node_modules` — exactly what yarn/npm produce. For bun's per-workspace
 * symlink layout use `BunBundler` instead (selected in `services.ts`).
 */

import { build, type Plugin } from 'esbuild'
import { join } from 'node:path'

import { extractExternalPackages } from './dep-extractor.js'
import { BaseBundler } from './bundler.js'
import type { CompileInput, CompileResult } from './bundler.interface.js'

/**
 * esbuild plugin that stubs gen files / modules not needed by this unit,
 * preventing Node-only modules (e.g. LocalMetaService using fs) from being
 * pulled into serverless worker bundles via dynamic imports.
 */
function createDeadModuleStubPlugin(patterns: RegExp[]): Plugin {
  return {
    name: 'pikku-dead-module-stub',
    setup(build) {
      if (patterns.length === 0) return
      const combined = new RegExp(patterns.map((p) => p.source).join('|'))
      build.onResolve({ filter: combined }, (args) => ({
        path: args.path,
        namespace: 'pikku-stub',
      }))
      build.onLoad({ filter: /.*/, namespace: 'pikku-stub' }, () => ({
        contents: 'export {}',
        loader: 'js',
      }))
    },
  }
}

export class NodeBundler extends BaseBundler {
  protected async compile(input: CompileInput): Promise<CompileResult> {
    // Resolve node_modules paths up the directory tree for workspace packages.
    const nodePaths: string[] = []
    let dir = input.projectDir
    while (true) {
      nodePaths.push(join(dir, 'node_modules'))
      const parent = join(dir, '..')
      if (parent === dir) break
      dir = parent
    }

    const result = await build({
      entryPoints: [input.entryPath],
      bundle: true,
      absWorkingDir: input.projectDir,
      nodePaths,
      platform: input.platform,
      format: input.format,
      banner: input.bannerJs ? { js: input.bannerJs } : undefined,
      metafile: true,
      target: 'es2022',
      outfile: input.bundlePath,
      // Minify every deploy bundle — esbuild output ships straight to the
      // runtime (CF Workers / container), tsc is never the bundler. keepNames
      // preserves Function.name / constructor.name so name-based reflection
      // still works.
      minify: true,
      keepNames: true,
      sourcemap: input.sourcemap,
      logLevel: 'warning',
      loader: { '.ts': 'ts' },
      external: input.externals,
      alias: input.aliases,
      define: input.define,
      plugins: [createDeadModuleStubPlugin(input.deadPatterns)],
    })

    return {
      externalPackages: extractExternalPackages(result.metafile),
      metafileJson: input.emitMetafile
        ? JSON.stringify(result.metafile, null, 2)
        : undefined,
    }
  }
}
