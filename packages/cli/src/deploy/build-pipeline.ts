/**
 * Shared build pipeline for deploy plan and apply.
 *
 * Runs: analyze → per-unit codegen → entry generation → bundle → configs
 * Outputs everything to .deploy/<provider>/ without deploying.
 */

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import type { InspectorState } from '@pikku/inspector'

import { analyzeDeployment } from './analyzer/index.js'
import type { DeploymentManifest } from './analyzer/manifest.js'
import { generatePerUnitCodegen } from './codegen/per-unit-codegen.js'
import type { Bundler } from './bundler/bundler.interface.js'
import type { BundleResult } from './bundler/types.js'
import type { ProviderAdapter } from './provider-adapter.js'
import {
  generateServerEntrySource,
  SERVER_DOCKERFILE,
  SERVER_DOCKERIGNORE,
} from './server-entry.js'

export interface BuildLogger {
  info(msg: string): void
  error(msg: string): void
  debug(msg: string): void
}

export interface BuildPipelineResult {
  manifest: DeploymentManifest
  providerDir: string
  deploymentManifestPath: string
  infraPath: string | null
  projectId: string
  bundled: BundleResult[]
  bundleErrors: Array<{ unitName: string; error: string }>
  codegenErrors: Array<{ unitName: string; error: string }>
}

const MERGED_SERVER_UNIT_NAME = 'pikku-server-container'
const UNITS_DIR_NAME = 'units'
const CONTAINER_DIR_NAME = 'container'

function attachBundleMetadata(
  manifest: DeploymentManifest,
  bundled: BundleResult[]
): void {
  if (bundled.length === 0) return
  const byUnitName = new Map(bundled.map((b) => [b.unitName, b]))
  for (const unit of manifest.units) {
    const bundle = byUnitName.get(unit.name)
    if (!bundle) continue
    unit.bundleHash = bundle.bundleHash
    unit.bundleSizeBytes = bundle.bundleSizeBytes
    unit.exactDependenciesHash = bundle.exactDependenciesHash
    unit.exactDependencies = bundle.exactDependencies
    unit.exactOptionalDependencies = bundle.exactOptionalDependencies
  }
}

function findLockfile(projectDir: string): string | null {
  for (const name of ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml']) {
    const p = join(projectDir, name)
    if (existsSync(p)) return p
  }
  return null
}

export async function runBuildPipeline(options: {
  projectDir: string
  projectId: string
  provider: ProviderAdapter
  inspectorState: InspectorState
  serverlessIncompatible?: string[]
  defaultTarget?: 'serverless' | 'server'
  getEntryContext: (
    unitDir: string,
    pikkuDir: string,
    unit: DeploymentManifest['units'][0],
    state: InspectorState
  ) => unknown
  deployDir?: string
  outDir?: string
  /** Emit sourcemaps + per-unit `metafile.json` (debug-only). Default false. */
  debugArtifacts?: boolean
  logger: BuildLogger
  /** Runtime-specific bundler (esbuild for node, Bun.build for bun). */
  bundler: Bundler
}): Promise<BuildPipelineResult> {
  const {
    projectDir,
    projectId,
    provider,
    inspectorState,
    getEntryContext,
    debugArtifacts,
    logger,
    bundler,
  } = options
  const deployDir = options.deployDir ?? join(projectDir, '.deploy')
  const providerDir = join(deployDir, provider.deployDirName)

  // Step 1: Analyze
  const workflowQueues = provider.workflowQueues ?? true
  const manifest = analyzeDeployment(inspectorState, {
    projectId,
    serverlessIncompatible: options.serverlessIncompatible,
    defaultTarget: options.defaultTarget,
    workflowQueues,
  })

  let bundled: BundleResult[] = []
  let bundleErrors: Array<{ unitName: string; error: string }> = []
  let codegenErrors: Array<{ unitName: string; error: string }> = []
  let infraPath: string | null = null
  const deploymentManifestPath = join(providerDir, 'deployment-manifest.json')
  const unitsDir = join(providerDir, UNITS_DIR_NAME)
  const containerDir = join(providerDir, CONTAINER_DIR_NAME)

  if (provider.singleUnit) {
    // Single-unit mode: bundle everything into one unit, use project's .pikku/ directly
    logger.info('Building standalone bundle...')

    const unitName = projectId
    const singleUnit: DeploymentManifest['units'][0] = {
      name: unitName,
      role: 'function',
      target: 'serverless',
      functionIds: Object.keys(inspectorState.functions.meta),
      services: [],
      dependsOn: [],
      handlers: [],
      tags: [],
    }
    manifest.units = [singleUnit]

    const unitDir = join(providerDir, unitName)
    const pikkuDir = options.outDir ?? join(projectDir, '.pikku')
    await mkdir(unitDir, { recursive: true })

    const ctx = getEntryContext(unitDir, pikkuDir, singleUnit, inspectorState)
    const source = provider.generateEntrySource(ctx as never)

    const entryPath = join(unitDir, 'entry.ts')
    await writeFile(entryPath, source, 'utf-8')

    const entryFiles = new Map<string, string>()
    entryFiles.set(unitName, entryPath)

    const bundleResult = await bundler.bundleUnits(
      projectDir,
      manifest,
      entryFiles,
      providerDir,
      {
        externals: provider.getExternals?.(),
        stubModules: provider.getStubModules?.(),
        aliases: provider.getAliases?.(),
        define: provider.getDefine?.(),
        platform: provider.getPlatform?.(),
        format: provider.getFormat?.(),
        noRequireShim: provider.getNoRequireShim?.(),
        sourcemap: debugArtifacts,
        emitMetafile: debugArtifacts,
      }
    )
    bundled = bundleResult.results
    bundleErrors = bundleResult.errors
    attachBundleMetadata(manifest, bundled)

    logger.info(
      `Bundled standalone${bundleErrors.length > 0 ? ` (${bundleErrors.length} errors)` : ''}`
    )
  } else {
    // Multi-unit mode: per-function decomposition
    const serverlessUnits = manifest.units.filter(
      (u) => u.target === 'serverless'
    )
    const serverUnits = manifest.units.filter((u) => u.target === 'server')

    logger.info(
      `Found ${manifest.units.length} units (${serverlessUnits.length} serverless, ${serverUnits.length} server), ${manifest.queues.length} queues, ${manifest.scheduledTasks.length} scheduled tasks`
    )

    if (manifest.units.length === 0) {
      return {
        manifest,
        providerDir,
        deploymentManifestPath,
        infraPath,
        projectId,
        bundled: [],
        bundleErrors: [],
        codegenErrors: [],
      }
    }

    // Step 2: Per-unit filtered codegen (serverless units only)
    // Server units share a single codegen pass (step 2b).
    const serverlessManifest = { ...manifest, units: serverlessUnits }
    logger.info('Generating per-unit codegen...')
    const { unitPikkuDirs, errors: serverlessCodegenErrors } =
      await generatePerUnitCodegen({
        projectDir,
        manifest: serverlessManifest,
        inspectorState,
        deployDir: unitsDir,
        workflowQueues,
        onProgress: (unitName, status, error) => {
          if (status === 'start') {
            logger.info(`  Codegen: ${unitName}...`)
          } else if (status === 'done') {
            logger.info(`  Codegen: ${unitName} done`)
          } else if (status === 'error') {
            logger.error(`  Codegen: ${unitName} failed — ${error}`)
          }
        },
      })
    codegenErrors = serverlessCodegenErrors

    // Step 2b: Server units — single codegen pass with all server function IDs
    if (serverUnits.length > 0) {
      const serverUnitName = MERGED_SERVER_UNIT_NAME

      // Create a merged server unit with all server function IDs
      const mergedServerUnit: DeploymentManifest['units'][0] = {
        name: serverUnitName,
        role: 'function',
        target: 'server',
        functionIds: serverUnits.flatMap((u) => u.functionIds),
        services: [],
        dependsOn: [],
        handlers: serverUnits.flatMap((u) => u.handlers),
        tags: [],
      }

      // Run per-unit codegen for the merged server unit (tree-shakes to only server functions)
      const serverManifest = { ...manifest, units: [mergedServerUnit] }
      const { unitPikkuDirs: serverPikkuDirs, errors: serverCodegenErrors } =
        await generatePerUnitCodegen({
          projectDir,
          manifest: serverManifest,
          inspectorState,
          deployDir: containerDir,
          resolveUnitDir: () => containerDir,
          workflowQueues,
          onProgress: (unitName, status, error) => {
            if (status === 'start') logger.info(`  Codegen: ${unitName}...`)
            else if (status === 'done')
              logger.info(`  Codegen: ${unitName} done`)
            else if (status === 'error')
              logger.error(`  Codegen: ${unitName} failed — ${error}`)
          },
        })

      for (const [k, v] of serverPikkuDirs) unitPikkuDirs.set(k, v)
      codegenErrors.push(...serverCodegenErrors)

      // Replace individual server units with the merged one in the manifest
      manifest.units = [...serverlessUnits, mergedServerUnit]

      logger.info(
        `  Server container: ${serverUnits.length} functions merged into one unit`
      )
    }

    logger.info(`Codegen complete: ${unitPikkuDirs.size} units`)

    // Step 3: Generate entry points + Bundle
    logger.info('Bundling...')
    const serverlessEntryFiles = new Map<string, string>()
    const serverEntryFiles = new Map<string, string>()

    for (const unit of manifest.units) {
      const pikkuDir = unitPikkuDirs.get(unit.name)
      if (!pikkuDir) continue

      const unitDir =
        unit.target === 'server' ? containerDir : join(unitsDir, unit.name)
      const entryPath = join(unitDir, 'entry.ts')
      await mkdir(unitDir, { recursive: true })

      const ctx = getEntryContext(unitDir, pikkuDir, unit, inspectorState)
      const source =
        unit.target === 'server'
          ? (provider.generateServerEntrySource?.(ctx as never) ??
            generateServerEntrySource(ctx as never))
          : provider.generateEntrySource(ctx as never)

      await writeFile(entryPath, source, 'utf-8')
      if (unit.target === 'server') {
        serverEntryFiles.set(unit.name, entryPath)
      } else {
        serverlessEntryFiles.set(unit.name, entryPath)
      }
    }

    const aggregated: BundleResult[] = []
    const aggregatedErrors: Array<{ unitName: string; error: string }> = []

    if (serverlessEntryFiles.size > 0) {
      const serverlessManifestForBundle = {
        ...manifest,
        units: manifest.units.filter((u) => u.target !== 'server'),
      }
      const result = await bundler.bundleUnits(
        projectDir,
        serverlessManifestForBundle,
        serverlessEntryFiles,
        providerDir,
        {
          externals: provider.getExternals?.(),
          stubModules: provider.getStubModules?.(),
          aliases: provider.getAliases?.(),
          define: provider.getDefine?.(),
          platform: provider.getPlatform?.(),
          format: provider.getFormat?.(),
          noRequireShim: provider.getNoRequireShim?.(),
          sourcemap: debugArtifacts,
          emitMetafile: debugArtifacts,
          resolveOutputDir: (unit) => join(unitsDir, unit.name),
        }
      )
      aggregated.push(...result.results)
      aggregatedErrors.push(...result.errors)
    }

    if (serverEntryFiles.size > 0) {
      // Server bundles use `@pikku/node-http-server` (pure JS), so esbuild
      // can inline everything except node builtins. The bundler still
      // emits a package.json from the metafile; if a user pulls in a
      // native module the dep extractor surfaces it and `npm install`
      // inside the container picks it up.
      const serverManifestForBundle = {
        ...manifest,
        units: manifest.units.filter((u) => u.target === 'server'),
      }
      const result = await bundler.bundleUnits(
        projectDir,
        serverManifestForBundle,
        serverEntryFiles,
        providerDir,
        {
          externals: ['node:*'],
          aliases: undefined,
          define: undefined,
          platform: 'node',
          format: 'esm',
          noRequireShim: false,
          sourcemap: debugArtifacts,
          emitMetafile: debugArtifacts,
          resolveOutputDir: () => containerDir,
        }
      )
      aggregated.push(...result.results)
      aggregatedErrors.push(...result.errors)

      // Emit Dockerfile + .dockerignore alongside bundle.js for any
      // orchestrator that wants to `docker build` the container directly.
      if (result.results.length > 0) {
        await writeFile(
          join(containerDir, 'Dockerfile'),
          SERVER_DOCKERFILE,
          'utf-8'
        )
        await writeFile(
          join(containerDir, '.dockerignore'),
          SERVER_DOCKERIGNORE,
          'utf-8'
        )
      }
    }

    bundled = aggregated
    bundleErrors = aggregatedErrors
    attachBundleMetadata(manifest, bundled)

    logger.info(
      `Bundled ${bundled.length} units${bundleErrors.length > 0 ? ` (${bundleErrors.length} failed)` : ''}`
    )
  }

  if (bundleErrors.length > 0) {
    for (const f of bundleErrors) {
      logger.error(`  Failed: ${f.unitName} — ${f.error}`)
    }
  }

  // Step 4: Generate configs + infra manifest
  await mkdir(providerDir, { recursive: true })
  await writeFile(
    deploymentManifestPath,
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )
  logger.info('Generated deployment manifest')

  const infraContent = provider.generateInfraManifest(manifest)
  if (infraContent) {
    infraPath = join(providerDir, 'infra.json')
    await writeFile(infraPath, infraContent, 'utf-8')
    logger.info('Generated infrastructure manifest')
  }

  if (provider.emitSideArtifacts) {
    await provider.emitSideArtifacts({
      buildDir: providerDir,
      manifest,
      logger,
    })
  }

  if (provider.generateProviderConfigs) {
    const providerConfigs = provider.generateProviderConfigs(manifest)
    for (const [filename, content] of providerConfigs) {
      const filePath = join(providerDir, filename)
      await mkdir(join(filePath, '..'), { recursive: true })
      await writeFile(filePath, content, 'utf-8')
    }
  }

  const lockfileSrc = findLockfile(projectDir)
  let configCount = 0
  for (const unit of manifest.units) {
    // Server units don't take per-unit provider configs (no wrangler.toml,
    // etc.) — their runtime is the emitted Dockerfile + bundle.js. Skip
    // both the provider config emit and the lockfile copy; the bundle is
    // self-contained and the Docker build uses npm install on its own.
    if (unit.target === 'server') continue

    const unitDir = provider.singleUnit
      ? join(providerDir, unit.name)
      : join(unitsDir, unit.name)
    await mkdir(unitDir, { recursive: true })
    const configs = provider.generateUnitConfigs(unit, manifest, projectId)
    for (const [filename, content] of configs) {
      await writeFile(join(unitDir, filename), content, 'utf-8')
    }
    if (lockfileSrc) {
      await copyFile(lockfileSrc, join(unitDir, 'yarn.lock'))
    }
    configCount++
  }
  logger.info(`Generated ${configCount} provider config files`)

  return {
    manifest,
    providerDir,
    deploymentManifestPath,
    infraPath,
    projectId,
    bundled,
    bundleErrors,
    codegenErrors,
  }
}
