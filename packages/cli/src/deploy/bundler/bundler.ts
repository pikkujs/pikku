/**
 * Main esbuild bundling pipeline for Pikku.
 *
 * For each deployment unit in a DeploymentManifest, this module:
 * 1. Takes a pre-generated entry point (provided by the deploy provider)
 * 2. Runs esbuild with bundle:true, npm packages external
 * 3. Stubs Node.js-only gen files that aren't needed by this unit
 * 4. Parses the metafile to extract external dependencies
 * 5. Generates a minimal package.json with exact versions
 * 6. Writes all artifacts to `<outputDir>/<unit-name>/`
 */

import { build, type Plugin } from 'esbuild'
import { writeFile, mkdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import {
  extractDependencies,
  generateMinimalPackageJson,
} from './dep-extractor.js'
import type {
  DeploymentManifest,
  DeploymentUnit,
  BundleResult,
  BundleError,
  BundleOutput,
} from './types.js'

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
 */
async function getDeadGenFilePatterns(
  unitOutputDir: string
): Promise<RegExp[]> {
  const patterns: RegExp[] = []
  try {
    const servicesPath = join(unitOutputDir, '.pikku', 'pikku-services.gen.ts')
    const content = await readFile(servicesPath, 'utf-8')
    const match = content.match(
      /export const requiredSingletonServices = \{([^}]+)\}/
    )
    if (match) {
      for (const line of match[1].split('\n')) {
        const kv = line.match(/'([^']+)':\s*false/)
        if (kv && SERVICE_GEN_FILE_MAP[kv[1]]) {
          patterns.push(SERVICE_GEN_FILE_MAP[kv[1]])
        }
      }
    }
  } catch {
    // No services gen — no stubs needed
  }
  return patterns
}

/**
 * esbuild plugin that stubs gen files for services not needed by this unit.
 * This prevents Node.js-only modules (e.g. LocalMetaService which uses fs)
 * from being pulled into serverless worker bundles via dynamic imports.
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

const BUNDLE_FILENAME = 'bundle.js'
const METAFILE_FILENAME = 'metafile.json'
const PACKAGE_JSON_FILENAME = 'package.json'
const EXACT_DEPENDENCIES_FILENAME = 'exact-dependencies.json'

interface BundleUnitOptions {
  unit: DeploymentUnit
  entryPath: string
  unitOutputDir: string
  projectDir: string
  externals?: string[]
  aliases?: Record<string, string>
  define?: Record<string, string>
  platform?: 'node' | 'neutral' | 'browser'
  format?: 'esm' | 'cjs'
  noRequireShim?: boolean
  /** Emit a `.js.map` sourcemap next to the bundle (debug-only). Default false. */
  sourcemap?: boolean
  /** Persist esbuild's metafile to `metafile.json` (debug-only). Default false. */
  emitMetafile?: boolean
}

/**
 * Bundles a single deployment unit using esbuild.
 *
 * Produces three files in the unit output directory:
 * - bundle.js: The bundled code (user code only, external deps as bare imports)
 * - metafile.json: esbuild's metafile for analysis
 * - package.json: Minimal manifest with only the external deps this unit needs
 */
async function bundleUnit(options: BundleUnitOptions): Promise<BundleResult> {
  const {
    unit,
    entryPath,
    unitOutputDir,
    projectDir,
    externals,
    aliases,
    define,
    platform,
    format,
    sourcemap,
    emitMetafile,
  } = options

  await mkdir(unitOutputDir, { recursive: true })

  const bundlePath = join(unitOutputDir, BUNDLE_FILENAME)
  const metafilePath = join(unitOutputDir, METAFILE_FILENAME)
  const packageJsonPath = join(unitOutputDir, PACKAGE_JSON_FILENAME)
  const exactDependenciesPath = join(unitOutputDir, EXACT_DEPENDENCIES_FILENAME)

  // Determine which gen files to stub based on per-unit service requirements
  const deadPatterns = await getDeadGenFilePatterns(unitOutputDir)

  // Run esbuild — inline everything into a self-contained bundle.
  // Only Node built-ins are kept external (CF Workers provides them).
  // The stub plugin replaces gen files for unused services with empty
  // modules, preventing Node.js-only code from entering the bundle.
  // Resolve node_modules paths up the directory tree for workspace packages
  const nodePaths: string[] = []
  let dir = projectDir
  while (true) {
    const nm = join(dir, 'node_modules')
    nodePaths.push(nm)
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  // For ESM + node platform, CJS deps may use require() / __filename / __dirname
  // for builtins or to locate native addons (the `bindings` package, used
  // transitively by `pg` and many others, calls `__filename` directly). esbuild
  // wraps require() as __require() which fails at runtime in ESM, and leaves
  // `__filename` / `__dirname` as undefined references. The banner shims all
  // three via createRequire / fileURLToPath so CJS builtins resolve and native-
  // addon loaders find their .node files.
  // Skipped when the provider opts out via `noRequireShim` (e.g. CF Workers
  // — `import.meta.url` is undefined there, so the shim crashes at boot).
  const resolvedFormat = format ?? 'esm'
  const banner =
    resolvedFormat === 'esm' &&
    (platform ?? 'node') === 'node' &&
    !options.noRequireShim
      ? {
          js: `import { createRequire as __pikkuCreateRequire } from 'node:module'; import { fileURLToPath as __pikkuFileURLToPath } from 'node:url'; import { dirname as __pikkuDirname } from 'node:path'; const require = __pikkuCreateRequire(import.meta.url); const __filename = __pikkuFileURLToPath(import.meta.url); const __dirname = __pikkuDirname(__filename);`,
        }
      : undefined

  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    absWorkingDir: projectDir,
    nodePaths,
    platform: platform ?? 'node',
    format: resolvedFormat,
    banner,
    metafile: true,
    target: 'es2022',
    outfile: bundlePath,
    // Minify every deploy bundle — esbuild output ships straight to the runtime
    // (CF Workers / container), tsc is never the bundler. keepNames preserves
    // Function.name / constructor.name so name-based reflection still works.
    minify: true,
    keepNames: true,
    sourcemap: sourcemap ?? false,
    logLevel: 'warning',
    loader: { '.ts': 'ts' },
    external: externals ?? ['node:*'],
    alias: aliases,
    define,
    plugins: [createDeadModuleStubPlugin(deadPatterns)],
  })

  // Always produced in-memory (drives dependency extraction); only persisted
  // when requested — it's large (~1.6MB/unit) and never needed at runtime.
  if (emitMetafile) {
    const metafileJson = JSON.stringify(result.metafile, null, 2)
    await writeFile(metafilePath, metafileJson, 'utf-8')
  }

  // Extract dependencies and generate minimal package.json
  const { exactDependencies, exactOptionalDependencies } =
    await extractDependencies(result.metafile, projectDir)
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

  // Get bundle size
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

/**
 * Bundles all deployment units defined in a DeploymentManifest.
 *
 * Entry points must be pre-generated by the provider-specific package
 * (e.g. @pikku/deploy-cloudflare) and passed in as entryFiles.
 *
 * @param projectDir - Root directory of the Pikku project
 * @param manifest - The deployment manifest describing all units
 * @param entryFiles - Map of unit name -> entry file path (generated by the deploy provider)
 * @param outputDir - Base output directory (defaults to `<projectDir>/.deploy/build`)
 */
export async function bundleUnits(
  projectDir: string,
  manifest: DeploymentManifest,
  entryFiles: Map<string, string>,
  outputDir?: string,
  options?: {
    externals?: string[]
    aliases?: Record<string, string>
    define?: Record<string, string>
    platform?: 'node' | 'neutral' | 'browser'
    format?: 'esm' | 'cjs'
    noRequireShim?: boolean
    sourcemap?: boolean
    emitMetafile?: boolean
    resolveOutputDir?: (unit: DeploymentUnit, baseOutputDir: string) => string
  }
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
      const result = await bundleUnit({
        unit,
        entryPath,
        unitOutputDir,
        projectDir,
        ...options,
      })
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({
        unitName: unit.name,
        error: message,
      })
    }
  }

  return { results, errors }
}
