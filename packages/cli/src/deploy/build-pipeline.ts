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
  const manifest = analyzeDeployment(inspectorState, { projectId })
  logger.info(
    `Found ${manifest.units.length} units, ${manifest.queues.length} queues, ${manifest.scheduledTasks.length} scheduled tasks`
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

  // Step 2: Per-unit filtered codegen
  logger.info('Generating per-unit codegen...')
  const { unitPikkuDirs, errors: codegenErrors } = await generatePerUnitCodegen(
    {
      projectDir,
      manifest,
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
    }
  )

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

  const { results: bundled, errors: bundleErrors } = await bundleUnits(
    projectDir,
    manifest,
    entryFiles,
    providerDir,
    {
      externals: provider.getExternals?.(),
      aliases: provider.getAliases?.(),
      define: provider.getDefine?.(),
      platform: provider.getPlatform?.(),
    }
  )
  logger.info(
    `Bundled ${bundled.length} units${bundleErrors.length > 0 ? ` (${bundleErrors.length} failed)` : ''}`
  )

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
      await writeFile(join(providerDir, filename), content, 'utf-8')
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
