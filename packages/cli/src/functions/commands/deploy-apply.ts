import { basename, join, dirname, relative } from 'node:path'
import { mkdir, writeFile, readFile, copyFile, access } from 'node:fs/promises'

import { pikkuVoidFunc } from '#pikku'
import { analyzeDeployment } from '../../deploy/analyzer/index.js'
import { generatePerUnitCodegen } from '../../deploy/codegen/index.js'
import { bundleUnits } from '../../deploy/bundler/index.js'
import {
  CloudflareProviderAdapter,
  deploy as cfDeploy,
} from '@pikku/deploy-cloudflare'
import { ServerlessProviderAdapter } from '@pikku/deploy-serverless'
import { AzureProviderAdapter } from '@pikku/deploy-azure'
import type {
  ProviderAdapter,
  EntryGenerationContext,
} from '../../deploy/provider-adapter.js'
import type { PlanChange } from '../../deploy/plan/types.js'
import type { InspectorState } from '@pikku/inspector'
import type { CloudflareInfraManifest } from '@pikku/deploy-cloudflare'

async function findLockfile(startDir: string): Promise<string | null> {
  let dir = startDir
  while (true) {
    const candidate = join(dir, 'yarn.lock')
    try {
      await access(candidate)
      return candidate
    } catch {
      const parent = dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  }
}

function toRelativeImport(fromDir: string, toFile: string): string {
  let rel = relative(fromDir, toFile).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel.replace(/\.ts$/, '.js')
}

function getEntryContext(
  unitDir: string,
  pikkuDir: string,
  unit: EntryGenerationContext['unit'],
  inspectorState: InspectorState
): EntryGenerationContext {
  const bootstrapRelative = relative(
    unitDir,
    join(pikkuDir, 'pikku-bootstrap.gen.js')
  )
  const bootstrapPath =
    bootstrapRelative.startsWith('./') || bootstrapRelative.startsWith('../')
      ? bootstrapRelative
      : `./${bootstrapRelative}`

  const {
    pikkuConfigFactory,
    singletonServicesFactory,
    singletonServicesType,
  } = inspectorState.filesAndMethods

  if (!pikkuConfigFactory || !singletonServicesFactory) {
    throw new Error(
      'Cannot generate deploy entries: createConfig and createSingletonServices must be defined in your project'
    )
  }

  const configRelative = toRelativeImport(unitDir, pikkuConfigFactory.file)
  const servicesRelative = toRelativeImport(
    unitDir,
    singletonServicesFactory.file
  )

  const singletonServicesImport = singletonServicesType
    ? `import type { ${singletonServicesType.type} } from '${toRelativeImport(unitDir, singletonServicesType.typePath)}'`
    : ''
  const servicesType = singletonServicesType
    ? `Partial<${singletonServicesType.type}>`
    : 'Record<string, unknown>'

  return {
    unit,
    unitDir,
    bootstrapPath,
    configImport: `import { ${pikkuConfigFactory.variable} } from '${configRelative}'`,
    configVar: pikkuConfigFactory.variable,
    servicesImport: `import { ${singletonServicesFactory.variable} } from '${servicesRelative}'`,
    servicesVar: singletonServicesFactory.variable,
    singletonServicesImport,
    servicesType,
  }
}

function sanitizeProjectId(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'pikku-project'
  )
}

async function resolveProjectId(projectDir: string): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(join(projectDir, 'package.json'), 'utf-8')
    )
    if (pkg.name) {
      const name = pkg.name.replace(/^@[^/]+\//, '')
      return sanitizeProjectId(name)
    }
  } catch (e: any) {
    if (e?.code !== 'ENOENT') {
      console.warn(`Warning: failed to read package.json: ${e?.message ?? e}`)
    }
  }
  return sanitizeProjectId(basename(projectDir))
}

function resolveProvider(_providerName?: string): ProviderAdapter {
  const name =
    _providerName ?? process.env.PIKKU_DEPLOY_PROVIDER ?? 'cloudflare'
  switch (name) {
    case 'cloudflare':
      return new CloudflareProviderAdapter()
    case 'serverless':
      return new ServerlessProviderAdapter()
    case 'azure':
      return new AzureProviderAdapter()
    default:
      throw new Error(`Unknown deploy provider: ${name}`)
  }
}

const ANSI = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

function logProgress(
  change: PlanChange,
  status: 'start' | 'done' | 'error',
  error?: string
) {
  const action = change.action
  const color =
    action === 'create'
      ? ANSI.green
      : action === 'update'
        ? ANSI.blue
        : action === 'delete'
          ? ANSI.red
          : ANSI.yellow

  if (status === 'start') {
    process.stdout.write(
      `  ${color}${action}${ANSI.reset} ${change.resourceType} ${ANSI.bold}${change.name}${ANSI.reset}...`
    )
  } else if (status === 'done') {
    process.stdout.write(` ${ANSI.green}done${ANSI.reset}\n`)
  } else {
    process.stdout.write(` ${ANSI.red}error: ${error}${ANSI.reset}\n`)
  }
}

export const deployApply = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    const projectDir = config.rootDir
    const deployDir = join(projectDir, '.deploy')
    const provider = resolveProvider()
    const providerDir = join(deployDir, provider.deployDirName)

    // Step 1: Analyze
    logger.info('Analyzing project...')
    const inspectorState = await getInspectorState(true)
    const projectId = await resolveProjectId(projectDir)
    const manifest = analyzeDeployment(inspectorState, { projectId })
    logger.info(
      `Found ${manifest.units.length} units, ${manifest.queues.length} queues, ${manifest.scheduledTasks.length} scheduled tasks`
    )

    if (manifest.units.length === 0) {
      logger.info('No deployment units found. Nothing to deploy.')
      return
    }

    // Step 2: Per-unit filtered codegen
    logger.info('Generating per-unit codegen...')
    const { unitPikkuDirs, errors: codegenErrors } =
      await generatePerUnitCodegen({
        projectDir,
        manifest,
        inspectorState,
        deployDir: providerDir,
        onProgress: (unitName, status, error) => {
          if (status === 'start') {
            logger.info(`  Codegen: ${unitName}...`)
          } else if (status === 'done') {
            logger.info(`  Codegen: ${unitName} ${ANSI.green}done${ANSI.reset}`)
          } else {
            logger.error(`  Codegen: ${unitName} failed — ${error}`)
          }
        },
      })

    if (codegenErrors.length > 0) {
      for (const e of codegenErrors) {
        logger.error(`  Codegen failed: ${e.unitName} — ${e.error}`)
      }
    }

    logger.info(
      `Codegen complete: ${unitPikkuDirs.size} units${codegenErrors.length > 0 ? ` (${codegenErrors.length} failed)` : ''}`
    )

    // Step 3: Generate entry points + Bundle
    logger.info('Generating entry points and bundling...')
    const entryFiles = new Map<string, string>()

    for (const unit of manifest.units) {
      const pikkuDir = unitPikkuDirs.get(unit.name)
      if (!pikkuDir) continue

      const unitDir = join(providerDir, unit.name)
      const entryPath = join(unitDir, 'entry.ts')
      await mkdir(unitDir, { recursive: true })

      const ctx = getEntryContext(unitDir, pikkuDir, unit, inspectorState)
      const source = provider.generateEntrySource(ctx)

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

    // Step 3b: Generate provider configs + infra manifest + lockfile
    const infraContent = provider.generateInfraManifest(manifest)
    if (infraContent) {
      await writeFile(join(providerDir, 'infra.json'), infraContent, 'utf-8')
      logger.info('Generated infrastructure manifest')
    }

    // Generate provider-level configs (e.g. serverless.yml)
    if (provider.generateProviderConfigs) {
      const providerConfigs = provider.generateProviderConfigs(manifest)
      for (const [filename, content] of providerConfigs) {
        await writeFile(join(providerDir, filename), content, 'utf-8')
        logger.info(`Generated ${filename}`)
      }
    }

    const lockfileSrc = await findLockfile(projectDir)
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

    // Step 4: Deploy (provider-specific)
    if (provider.name === 'cloudflare') {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
      const apiToken = process.env.CLOUDFLARE_API_TOKEN

      if (!accountId || !apiToken) {
        logger.error(
          'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables.'
        )
        return
      }

      const infraJson = JSON.parse(
        await readFile(join(providerDir, 'infra.json'), 'utf-8')
      ) as CloudflareInfraManifest

      logger.info('Deploying to Cloudflare...')
      const result = await cfDeploy({
        accountId,
        apiToken,
        buildDir: providerDir,
        manifest: infraJson,
        onProgress: (step, detail) => {
          logProgress(
            {
              action: 'create',
              resourceType: step as any,
              name: detail,
              reason: '',
            },
            'done'
          )
        },
      })

      console.log('')
      if (result.success) {
        logger.info(
          `${ANSI.green}${ANSI.bold}Deployment complete.${ANSI.reset}`
        )
        logger.info(
          `  ${result.workersDeployed.length} workers deployed, ${result.resourcesCreated.length} resources created`
        )
      } else {
        logger.error(
          `Deployment finished with ${result.errors.length} error(s):`
        )
        for (const e of result.errors) {
          logger.error(`  ${e.step}: ${e.error}`)
        }
      }
    } else if (provider.name === 'serverless') {
      logger.info(`${ANSI.green}${ANSI.bold}Build complete.${ANSI.reset}`)
      logger.info(
        `  ${bundled.length} functions bundled to ${ANSI.bold}${providerDir}${ANSI.reset}`
      )
      logger.info('')
      logger.info('To run locally:')
      logger.info(
        `  ${ANSI.bold}cd ${providerDir} && npx serverless offline start${ANSI.reset}`
      )
      logger.info('')
      logger.info('To deploy to AWS:')
      logger.info(
        `  ${ANSI.bold}cd ${providerDir} && npx serverless deploy${ANSI.reset}`
      )
    } else if (provider.name === 'azure') {
      logger.info(`${ANSI.green}${ANSI.bold}Build complete.${ANSI.reset}`)
      logger.info(
        `  ${bundled.length} functions bundled to ${ANSI.bold}${providerDir}${ANSI.reset}`
      )
      logger.info('')
      logger.info('To run locally:')
      logger.info(`  ${ANSI.bold}cd ${providerDir} && func start${ANSI.reset}`)
      logger.info('')
      logger.info('To deploy to Azure:')
      logger.info(
        `  ${ANSI.bold}cd ${providerDir} && func azure functionapp publish <app-name>${ANSI.reset}`
      )
    } else {
      logger.info(
        `${ANSI.green}${ANSI.bold}Build complete.${ANSI.reset} ${bundled.length} functions bundled.`
      )
    }
  },
})
