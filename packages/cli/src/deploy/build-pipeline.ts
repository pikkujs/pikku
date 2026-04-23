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
import { bundleUnits } from './bundler/index.js'
import type { BundleResult } from './bundler/index.js'
import type { ProviderAdapter } from './provider-adapter.js'

export interface BuildLogger {
  info(msg: string): void
  error(msg: string): void
  debug(msg: string): void
}

export interface BuildPipelineResult {
  manifest: DeploymentManifest
  providerDir: string
  projectId: string
  bundled: BundleResult[]
  bundleErrors: Array<{ unitName: string; error: string }>
  codegenErrors: Array<{ unitName: string; error: string }>
}

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
    unit.externalPackagesHash = bundle.externalPackagesHash
    unit.externalPackages = bundle.externalPackages
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
  getEntryContext: (
    unitDir: string,
    pikkuDir: string,
    unit: DeploymentManifest['units'][0],
    state: InspectorState
  ) => unknown
  deployDir?: string
  logger: BuildLogger
}): Promise<BuildPipelineResult> {
  const {
    projectDir,
    projectId,
    provider,
    inspectorState,
    getEntryContext,
    logger,
  } = options
  const deployDir = options.deployDir ?? join(projectDir, '.deploy')
  const providerDir = join(deployDir, provider.deployDirName)

  // Step 1: Analyze
  const manifest = analyzeDeployment(inspectorState, {
    projectId,
    serverlessIncompatible: options.serverlessIncompatible,
  })

  let bundled: BundleResult[] = []
  let bundleErrors: Array<{ unitName: string; error: string }> = []
  let codegenErrors: Array<{ unitName: string; error: string }> = []

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
    const pikkuDir = join(projectDir, '.pikku')
    await mkdir(unitDir, { recursive: true })

    const ctx = getEntryContext(unitDir, pikkuDir, singleUnit, inspectorState)
    const source = provider.generateEntrySource(ctx as never)

    const entryPath = join(unitDir, 'entry.ts')
    await writeFile(entryPath, source, 'utf-8')

    const entryFiles = new Map<string, string>()
    entryFiles.set(unitName, entryPath)

    const bundleResult = await bundleUnits(
      projectDir,
      manifest,
      entryFiles,
      providerDir,
      {
        externals: provider.getExternals?.(),
        aliases: provider.getAliases?.(),
        define: provider.getDefine?.(),
        platform: provider.getPlatform?.(),
        format: provider.getFormat?.(),
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
        deployDir: providerDir,
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
      const serverUnitName = 'server'

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
          deployDir: providerDir,
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
    const entryFiles = new Map<string, string>()

    for (const unit of manifest.units) {
      const pikkuDir = unitPikkuDirs.get(unit.name)
      if (!pikkuDir) continue

      const unitDir = join(providerDir, unit.name)
      const entryPath = join(unitDir, 'entry.ts')
      await mkdir(unitDir, { recursive: true })

      const ctx = getEntryContext(unitDir, pikkuDir, unit, inspectorState)
      const source = provider.generateEntrySource(ctx as never)

      await writeFile(entryPath, source, 'utf-8')
      entryFiles.set(unit.name, entryPath)
    }

    const bundleResult = await bundleUnits(
      projectDir,
      manifest,
      entryFiles,
      providerDir,
      {
        externals: provider.getExternals?.(),
        aliases: provider.getAliases?.(),
        define: provider.getDefine?.(),
        platform: provider.getPlatform?.(),
        format: provider.getFormat?.(),
      }
    )
    bundled = bundleResult.results
    bundleErrors = bundleResult.errors
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
  const infraContent = provider.generateInfraManifest(manifest)
  if (infraContent) {
    await writeFile(join(providerDir, 'infra.json'), infraContent, 'utf-8')
    logger.info('Generated infrastructure manifest')
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
  for (const unit of manifest.units) {
    const unitDir = join(providerDir, unit.name)
    await mkdir(unitDir, { recursive: true })
    const configs = provider.generateUnitConfigs(unit, manifest, projectId)
    for (const [filename, content] of configs) {
      await writeFile(join(unitDir, filename), content, 'utf-8')
    }
    if (lockfileSrc) {
      await copyFile(lockfileSrc, join(unitDir, 'yarn.lock'))
    }
  }
  logger.info(`Generated ${manifest.units.length} provider config files`)

  return {
    manifest,
    providerDir,
    projectId,
    bundled,
    bundleErrors,
    codegenErrors,
  }
}
