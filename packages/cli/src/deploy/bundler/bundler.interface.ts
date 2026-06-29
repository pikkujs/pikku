/**
 * Bundler abstraction.
 *
 * A `Bundler` turns a deployment manifest's units into self-contained bundles.
 * The shared orchestration (dead-module stubbing, dependency extraction,
 * package.json + hashing) lives in `BaseBundler`; each runtime supplies only the
 * compile step via a `Bundler` implementation (esbuild for node, Bun.build for
 * bun). The runtime is resolved once in `services.ts` and injected — no
 * `typeof Bun` checks in the pipeline.
 */

import type {
  DeploymentManifest,
  DeploymentUnit,
  BundleOutput,
} from './types.js'

/**
 * Inputs the shared orchestration hands to a backend's runtime-specific compile
 * step. The backend writes `bundlePath` (and `${bundlePath}.map` when
 * `sourcemap`) itself and returns the external packages + optional metafile.
 */
export interface CompileInput {
  unitName: string
  entryPath: string
  bundlePath: string
  projectDir: string
  platform: 'node' | 'neutral' | 'browser'
  format: 'esm' | 'cjs'
  externals: string[]
  aliases?: Record<string, string>
  define?: Record<string, string>
  /** ESM require/__filename/__dirname shim, or undefined when not needed. */
  bannerJs?: string
  sourcemap: boolean
  emitMetafile: boolean
  /** Regexes for modules to replace with an empty `export {}` module. */
  deadPatterns: RegExp[]
}

export interface CompileResult {
  /** Real npm package names kept external — drive the unit's package.json. */
  externalPackages: Set<string>
  /** Stringified metafile when `emitMetafile` was set; otherwise undefined. */
  metafileJson?: string
}

export interface BundleUnitsOptions {
  externals?: string[]
  aliases?: Record<string, string>
  define?: Record<string, string>
  platform?: 'node' | 'neutral' | 'browser'
  format?: 'esm' | 'cjs'
  noRequireShim?: boolean
  sourcemap?: boolean
  emitMetafile?: boolean
  stubModules?: string[]
  resolveOutputDir?: (unit: DeploymentUnit, baseOutputDir: string) => string
}

export interface Bundler {
  bundleUnits(
    projectDir: string,
    manifest: DeploymentManifest,
    entryFiles: Map<string, string>,
    outputDir?: string,
    options?: BundleUnitsOptions
  ): Promise<BundleOutput>
}
