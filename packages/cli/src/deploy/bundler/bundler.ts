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

interface BundleUnitOptions {
  unit: DeploymentUnit
  entryPath: string
  unitOutputDir: string
  projectDir: string
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
  const { unit, entryPath, unitOutputDir, projectDir } = options

  await mkdir(unitOutputDir, { recursive: true })

  const bundlePath = join(unitOutputDir, BUNDLE_FILENAME)
  const metafilePath = join(unitOutputDir, METAFILE_FILENAME)
  const packageJsonPath = join(unitOutputDir, PACKAGE_JSON_FILENAME)

  // Determine which gen files to stub based on per-unit service requirements
  const deadPatterns = await getDeadGenFilePatterns(unitOutputDir)

  // Run esbuild — bundle user code, keep npm packages external.
  // The stub plugin replaces gen files for unused services with empty
  // modules, preventing Node.js-only code from entering the bundle.
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    metafile: true,
    target: 'es2022',
    outfile: bundlePath,
    minify: false,
    sourcemap: true,
    logLevel: 'warning',
    loader: { '.ts': 'ts' },
    plugins: [createDeadModuleStubPlugin(deadPatterns)],
  })

  // Write metafile
  const metafileJson = JSON.stringify(result.metafile, null, 2)
  await writeFile(metafilePath, metafileJson, 'utf-8')

  // Extract dependencies and generate minimal package.json
  const dependencies = await extractDependencies(result.metafile, projectDir)
  const packageJson = generateMinimalPackageJson(unit.name, dependencies)
  await writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  )

  // Get bundle size
  const bundleStat = await stat(bundlePath)

  return {
    unitName: unit.name,
    bundlePath,
    packageJsonPath,
    metafilePath,
    bundleSizeBytes: bundleStat.size,
    externalPackages: dependencies,
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
  outputDir?: string
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

    const unitOutputDir = join(buildDir, unit.name)

    try {
      const result = await bundleUnit({
        unit,
        entryPath,
        unitOutputDir,
        projectDir,
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
