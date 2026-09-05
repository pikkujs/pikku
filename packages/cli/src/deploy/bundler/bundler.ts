/**
 * Shared bundling orchestration for Pikku deploys.
 *
 * `BaseBundler` performs everything that is runtime-independent for each
 * deployment unit:
 * 1. Take a pre-generated entry point (provided by the deploy provider)
 * 2. Stub gen files / npm modules not needed by this unit
 * 3. Delegate the actual compile to a runtime backend (`compile`)
 * 4. Resolve external dependency versions into a minimal package.json
 * 5. Write all artifacts to `<outputDir>/<unit-name>/` and hash them
 *
 * The runtime-specific compile step lives in `NodeBundler` (esbuild) and
 * `BunBundler` (Bun.build); the right one is injected from `services.ts`.
 */

import { writeFile, mkdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import {
  resolveExternalVersions,
  generateMinimalPackageJson,
} from './dep-extractor.js'
import { findNativeAddons, nativeAddonBundleError } from './native-addon.js'
import type {
  DeploymentUnit,
  DeploymentManifest,
  BundleResult,
  BundleError,
  BundleOutput,
} from './types.js'
import type {
  Bundler,
  BundleUnitsOptions,
  CompileInput,
  CompileResult,
} from './bundler.interface.js'
import { SERVICE_MODULE_MAP } from './service-module-map.js'

/**
 * Mapping of service name -> gen file pattern that should be stubbed
 * when the service is not required by a deployment unit.
 */
const SERVICE_GEN_FILE_MAP: Record<string, RegExp> = {
  metaService: /pikku-meta-service\.gen/,
}

/**
 * Read the per-unit pikku-services.gen.ts and return the set of gen file
 * patterns that should be stubbed (because their service is not required).
 *
 * Exported for tests: the decision is easy to get subtly wrong and impossible
 * to observe from outside a real bundle, where it surfaces only as a missing
 * export at compile time.
 */
export async function getDeadGenFilePatterns(
  unitOutputDir: string
): Promise<RegExp[]> {
  const patterns: RegExp[] = []
  try {
    const servicesPath = join(unitOutputDir, '.pikku', 'pikku-services.gen.ts')
    const content = await readFile(servicesPath, 'utf-8')
    const match = content.match(
      /export const requiredSingletonServices = \{([^}]+)\}/
    )
    if (!match) return patterns

    const services = new Map<string, boolean>()
    for (const line of match[1].split('\n')) {
      const kv = line.match(/'([^']+)':\s*(true|false)/)
      if (kv) services.set(kv[1], kv[2] === 'true')
    }

    // Several service names can front the same npm modules — `agentRunner` and
    // `ai` both mean "this unit has a model" (SERVICE_CAPABILITY_MAP grants
    // 'ai-model' to each). A module set is therefore dead only when NO required
    // service claims it. Reading the unrequired services alone stubbed the AI
    // SDKs out of every unit that wired `ai`, because those units still report
    // `'agentRunner': false` on the line above `'ai': true` — and a unit that
    // asks for a model does import them, so the bundle failed rather than
    // shrinking.
    const claimed = new Set<string>()
    for (const [service, required] of services) {
      if (!required) continue
      for (const pattern of SERVICE_MODULE_MAP[service] ?? []) {
        claimed.add(pattern.source)
      }
    }

    for (const [service, required] of services) {
      if (required) continue
      const genPattern = SERVICE_GEN_FILE_MAP[service]
      if (genPattern) patterns.push(genPattern)
      for (const pattern of SERVICE_MODULE_MAP[service] ?? []) {
        if (!claimed.has(pattern.source)) patterns.push(pattern)
      }
    }
  } catch {
    // No services gen — no stubs needed
  }
  return patterns
}

const BUNDLE_FILENAME = 'bundle.js'
const METAFILE_FILENAME = 'metafile.json'
const PACKAGE_JSON_FILENAME = 'package.json'
const EXACT_DEPENDENCIES_FILENAME = 'exact-dependencies.json'

/**
 * Runtime-independent bundling orchestration. Subclasses implement only
 * `compile` — the actual esbuild / Bun.build invocation.
 */
export abstract class BaseBundler implements Bundler {
  /**
   * Runtime-specific compile step: write `input.bundlePath` (and its `.map`
   * when `input.sourcemap`) and return the external packages + optional
   * metafile JSON.
   */
  protected abstract compile(input: CompileInput): Promise<CompileResult>

  async bundleUnits(
    projectDir: string,
    manifest: DeploymentManifest,
    entryFiles: Map<string, string>,
    outputDir?: string,
    options?: BundleUnitsOptions
  ): Promise<BundleOutput> {
    const buildDir = outputDir ?? join(projectDir, '.deploy', 'build')
    const results: BundleResult[] = []
    const errors: BundleError[] = []

    if (manifest.units.length === 0) {
      return { results, errors }
    }

    for (const unit of manifest.units) {
      const entryPath = entryFiles.get(unit.name)
      if (!entryPath) {
        errors.push({
          unitName: unit.name,
          error: `No entry point provided for unit "${unit.name}"`,
        })
        continue
      }

      const unitOutputDir = options?.resolveOutputDir
        ? options.resolveOutputDir(unit, buildDir)
        : join(buildDir, unit.name)

      try {
        const result = await this.bundleUnit(
          unit,
          entryPath,
          unitOutputDir,
          projectDir,
          options ?? {}
        )
        results.push(result)
      } catch (err) {
        // AggregateError (thrown by Bun.build) carries per-file errors in `errors`.
        const aggErrors =
          err != null &&
          typeof err === 'object' &&
          'errors' in err &&
          Array.isArray((err as { errors: unknown }).errors)
            ? (err as { errors: Array<{ message?: unknown }> }).errors
                .map((e) => e?.message ?? String(e))
                .join('\n  ')
            : ''
        const message =
          (err instanceof Error ? err.message : String(err)) +
          (aggErrors ? `\n  ${aggErrors}` : '')
        errors.push({ unitName: unit.name, error: message })
      }
    }

    return { results, errors }
  }

  /**
   * A serverless compile, with a native addon reported as one. Without this the
   * failure is the addon's wrapper failing to resolve `node:*`, which names
   * neither the package nor the reason — see `native-addon.ts`.
   */
  private async compileForServerless(
    input: CompileInput
  ): Promise<CompileResult> {
    try {
      return await this.compile(input)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const hits = await findNativeAddons(message)
      if (hits.length === 0) throw error
      throw new Error(
        `${nativeAddonBundleError(input.unitName, hits)}\n\n${message}`,
        { cause: error }
      )
    }
  }

  private async bundleUnit(
    unit: DeploymentUnit,
    entryPath: string,
    unitOutputDir: string,
    projectDir: string,
    options: BundleUnitsOptions
  ): Promise<BundleResult> {
    await mkdir(unitOutputDir, { recursive: true })

    const bundlePath = join(unitOutputDir, BUNDLE_FILENAME)
    const metafilePath = join(unitOutputDir, METAFILE_FILENAME)
    const packageJsonPath = join(unitOutputDir, PACKAGE_JSON_FILENAME)
    const exactDependenciesPath = join(
      unitOutputDir,
      EXACT_DEPENDENCIES_FILENAME
    )

    // Determine which gen files to stub based on per-unit service requirements,
    // plus any provider-supplied module stubs (modules the provider's runtime
    // never executes — e.g. the `postgres` driver on CF Workers, which use a
    // libsql/Turso dialect; the postgres branch is URL-gated and never taken).
    const deadPatterns = await getDeadGenFilePatterns(unitOutputDir)
    for (const source of options.stubModules ?? []) {
      deadPatterns.push(new RegExp(source))
    }

    const platform = options.platform ?? 'node'
    const format = options.format ?? 'esm'
    const externals = options.externals ?? ['node:*']
    const sourcemap = options.sourcemap ?? false
    const emitMetafile = options.emitMetafile ?? false

    // For ESM + node platform, CJS deps may use require() / __filename /
    // __dirname for builtins or to locate native addons (the `bindings`
    // package, used transitively by `pg`, calls `__filename` directly). esbuild
    // wraps require() as __require() which fails at runtime in ESM, and leaves
    // `__filename` / `__dirname` as undefined references. The banner shims all
    // three so CJS builtins resolve and native-addon loaders find their .node
    // files. Skipped when the provider opts out via `noRequireShim` (e.g. CF
    // Workers — `import.meta.url` is undefined there, so the shim crashes).
    const bannerJs =
      format === 'esm' && platform === 'node' && !options.noRequireShim
        ? `import { createRequire as __pikkuCreateRequire } from 'node:module'; import { fileURLToPath as __pikkuFileURLToPath } from 'node:url'; import { dirname as __pikkuDirname } from 'node:path'; const require = __pikkuCreateRequire(import.meta.url); const __filename = __pikkuFileURLToPath(import.meta.url); const __dirname = __pikkuDirname(__filename);`
        : undefined

    const compileInput: CompileInput = {
      unitName: unit.name,
      entryPath,
      bundlePath,
      projectDir,
      platform,
      format,
      externals,
      aliases: options.aliases,
      define: options.define,
      bannerJs,
      sourcemap,
      emitMetafile,
      deadPatterns,
    }
    const { externalPackages, metafileJson } =
      platform === 'node'
        ? await this.compile(compileInput)
        : await this.compileForServerless(compileInput)

    // Metafile is large (~1.6MB/unit) and never needed at runtime — only
    // persisted for debugging.
    if (emitMetafile && metafileJson) {
      await writeFile(metafilePath, metafileJson, 'utf-8')
    }

    // Extract dependencies and generate minimal package.json
    const { exactDependencies, exactOptionalDependencies } =
      await resolveExternalVersions(externalPackages, projectDir)
    const packageJson = generateMinimalPackageJson(
      unit.name,
      exactDependencies,
      exactOptionalDependencies
    )
    await writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    )
    await writeFile(
      exactDependenciesPath,
      JSON.stringify(
        {
          dependencies: Object.fromEntries(
            Object.entries(exactDependencies).sort(([a], [b]) =>
              a.localeCompare(b)
            )
          ),
          optionalDependencies: Object.fromEntries(
            Object.entries(exactOptionalDependencies).sort(([a], [b]) =>
              a.localeCompare(b)
            )
          ),
        },
        null,
        2
      ),
      'utf-8'
    )

    // Get bundle size + hashes
    const bundleStat = await stat(bundlePath)
    const bundleContents = await readFile(bundlePath)
    const bundleHash = createHash('sha256').update(bundleContents).digest('hex')
    const exactDependenciesHash = createHash('sha256')
      .update(
        JSON.stringify({
          dependencies: Object.entries(exactDependencies).sort(([a], [b]) =>
            a.localeCompare(b)
          ),
          optionalDependencies: Object.entries(exactOptionalDependencies).sort(
            ([a], [b]) => a.localeCompare(b)
          ),
        })
      )
      .digest('hex')

    return {
      unitName: unit.name,
      bundlePath,
      packageJsonPath,
      exactDependenciesPath,
      metafilePath,
      bundleSizeBytes: bundleStat.size,
      bundleHash,
      exactDependenciesHash,
      exactDependencies,
      exactOptionalDependencies,
    }
  }
}
