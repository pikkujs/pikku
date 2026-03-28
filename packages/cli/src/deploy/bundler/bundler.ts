/**
 * Main esbuild bundling pipeline for Pikku Fabric.
 *
 * For each worker in a DeploymentManifest, this module:
 * 1. Generates a TypeScript entry point that imports only that worker's functions
 * 2. Runs esbuild with bundle:true, platform:browser, packages:external
 * 3. Parses the metafile to extract external dependencies
 * 4. Generates a minimal package.json with exact versions
 * 5. Writes all artifacts to `.fabric/build/<worker-name>/`
 */

import { build } from 'esbuild'
import { writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { generateEntryFiles } from './entry-generator.js'
import {
  extractDependencies,
  generateMinimalPackageJson,
} from './dep-extractor.js'
import type {
  DeploymentManifest,
  BundleResult,
  BundleError,
  BundleOutput,
  WorkerSpec,
} from './types.js'

const BUNDLE_FILENAME = 'bundle.js'
const METAFILE_FILENAME = 'metafile.json'
const PACKAGE_JSON_FILENAME = 'package.json'

interface BundleWorkerOptions {
  worker: WorkerSpec
  entryPath: string
  workerOutputDir: string
  projectDir: string
}

/**
 * Bundles a single worker using esbuild.
 *
 * Produces three files in the worker output directory:
 * - bundle.js: The bundled code (user code only, external deps as bare imports)
 * - metafile.json: esbuild's metafile for analysis
 * - package.json: Minimal manifest with only the external deps this worker needs
 */
async function bundleWorker(
  options: BundleWorkerOptions
): Promise<BundleResult> {
  const { worker, entryPath, workerOutputDir, projectDir } = options

  await mkdir(workerOutputDir, { recursive: true })

  const bundlePath = join(workerOutputDir, BUNDLE_FILENAME)
  const metafilePath = join(workerOutputDir, METAFILE_FILENAME)
  const packageJsonPath = join(workerOutputDir, PACKAGE_JSON_FILENAME)

  // Run esbuild
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    packages: 'external',
    metafile: true,
    target: 'es2022',
    outfile: bundlePath,
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
    // Ensure we handle TypeScript entry points
    loader: { '.ts': 'ts' },
  })

  // Write metafile
  const metafileJson = JSON.stringify(result.metafile, null, 2)
  await writeFile(metafilePath, metafileJson, 'utf-8')

  // Extract dependencies and generate minimal package.json
  const dependencies = await extractDependencies(result.metafile, projectDir)
  const packageJson = generateMinimalPackageJson(worker.name, dependencies)
  await writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  )

  // Get bundle size
  const bundleStat = await stat(bundlePath)

  return {
    workerName: worker.name,
    role: worker.role,
    bundlePath,
    packageJsonPath,
    metafilePath,
    bundleSizeBytes: bundleStat.size,
    externalPackages: dependencies,
  }
}

/**
 * Bundles all workers defined in a DeploymentManifest.
 *
 * For each worker:
 * 1. Generates a TypeScript entry point that imports its functions
 * 2. Runs esbuild to produce a single ESM bundle
 * 3. Extracts external dependencies from the esbuild metafile
 * 4. Generates a minimal package.json with exact versions
 *
 * Workers that fail to bundle are reported as errors but do not
 * prevent other workers from being bundled.
 *
 * @param projectDir - Root directory of the Pikku project being bundled
 * @param manifest - The deployment manifest describing all workers
 * @param outputDir - Base output directory (defaults to `<projectDir>/.fabric/build`)
 * @returns Results for successful bundles and errors for failed ones
 */
export async function bundleWorkers(
  projectDir: string,
  manifest: DeploymentManifest,
  outputDir?: string
): Promise<BundleOutput> {
  const buildDir = outputDir ?? join(projectDir, '.fabric', 'build')
  const results: BundleResult[] = []
  const errors: BundleError[] = []

  if (manifest.workers.length === 0) {
    return { results, errors }
  }

  // Step 1: Generate entry points for all workers
  const entryDir = join(buildDir, '_entries')
  const entryFiles = await generateEntryFiles(manifest.workers, entryDir)

  // Step 2: Bundle each worker
  for (const worker of manifest.workers) {
    const entryPath = entryFiles.get(worker.name)
    if (!entryPath) {
      errors.push({
        workerName: worker.name,
        role: worker.role,
        error: `No entry point generated for worker "${worker.name}"`,
      })
      continue
    }

    const workerOutputDir = join(buildDir, worker.name)

    try {
      const result = await bundleWorker({
        worker,
        entryPath,
        workerOutputDir,
        projectDir,
      })
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({
        workerName: worker.name,
        role: worker.role,
        error: message,
      })
    }
  }

  return { results, errors }
}
