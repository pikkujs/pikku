import { basename, join, relative } from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku'
import type {
  ProviderAdapter,
  EntryGenerationContext,
} from '../../deploy/provider-adapter.js'
import type { InspectorState } from '@pikku/inspector'
import type { Logger } from '@pikku/core/services'
import { runBuildPipeline } from '../../deploy/build-pipeline.js'

function toRelativeImport(fromDir: string, toFile: string): string {
  let rel = relative(fromDir, toFile).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel.replace(/\.ts$/, '.js')
}

export function getEntryContext(
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

  // MCP: when the unit's .pikku has a non-empty mcp.gen.json, import it and pass
  // it to the generated server so PikkuNodeHTTPServer mounts /mcp. Without this
  // the deployed bundle never serves MCP even though the dev server does.
  let mcpImport = ''
  let mcpServerOption = ''
  const mcpJsonAbs = join(pikkuDir, 'mcp', 'mcp.gen.json')
  if (existsSync(mcpJsonAbs)) {
    let hasMcp = false
    try {
      const parsed = JSON.parse(readFileSync(mcpJsonAbs, 'utf-8')) as {
        tools?: unknown[]
        resources?: unknown[]
        prompts?: unknown[]
      }
      hasMcp =
        (parsed.tools?.length ?? 0) +
          (parsed.resources?.length ?? 0) +
          (parsed.prompts?.length ?? 0) >
        0
    } catch (err) {
      console.warn(
        `[pikku] could not parse ${mcpJsonAbs} — skipping MCP mount: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    if (hasMcp) {
      const rel = relative(unitDir, mcpJsonAbs).replace(/\\/g, '/')
      const relImport = rel.startsWith('.') ? rel : `./${rel}`
      mcpImport = `import mcpJson from '${relImport}' with { type: 'json' }`
      mcpServerOption = 'mcpJson, '
    }
  }

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
    mcpImport,
    mcpServerOption,
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
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (err?.code !== 'ENOENT') {
      console.warn(`Warning: failed to read package.json: ${err?.message ?? e}`)
    }
  }
  return sanitizeProjectId(basename(projectDir))
}

export async function resolveProvider(
  config?: {
    deploy?: { providers: Record<string, string>; defaultProvider?: string }
  },
  providerName?: string,
  options?: { runtime?: string }
): Promise<ProviderAdapter> {
  const name = providerName ?? config?.deploy?.defaultProvider ?? 'cloudflare'

  const providers = config?.deploy?.providers ?? {
    cloudflare: '@pikku/deploy-cloudflare',
    serverless: '@pikku/deploy-serverless',
    azure: '@pikku/deploy-azure',
    standalone: '@pikku/deploy-standalone',
  }

  const packageName = providers[name]
  if (!packageName) {
    throw new Error(
      `Unknown deploy provider: '${name}'. Available: ${Object.keys(providers).join(', ')}`
    )
  }

  const adapterExportName =
    name.charAt(0).toUpperCase() + name.slice(1) + 'ProviderAdapter'

  try {
    const mod = await import(packageName)
    if (typeof mod.createAdapter === 'function') {
      return mod.createAdapter(options)
    }
    if (typeof mod[adapterExportName] === 'function') {
      return new mod[adapterExportName](options)
    }
    throw new Error(
      `Deploy provider '${packageName}' does not export createAdapter() or ${adapterExportName}`
    )
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND' ||
      err?.code === 'MODULE_NOT_FOUND'
    ) {
      throw new Error(
        `Deploy provider '${packageName}' is not installed. Run: yarn add ${packageName}`
      )
    }
    throw e
  }
}

const ANSI = {
  green: '\x1b[32m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

async function writeResultFile(
  resultFile: string | undefined,
  result: Record<string, unknown>
): Promise<void> {
  if (resultFile) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8')
  }
}

async function runDeploy(
  provider: ProviderAdapter,
  providerDir: string,
  logger: Logger,
  resultFile?: string
): Promise<void> {
  if (typeof provider.deploy !== 'function') {
    logger.error(`Provider '${provider.name}' does not support deploy.`)
    await writeResultFile(resultFile, {
      success: false,
      errors: [{ step: 'provider', error: 'No deploy support' }],
    })
    process.exit(1)
  }

  logger.info(`Deploying via ${provider.name}...`)

  let deployResult: {
    success: boolean
    workersDeployed?: unknown[]
    resourcesCreated?: unknown[]
    errors: Array<{ step: string; error: string }>
  }

  try {
    deployResult = await provider.deploy({
      buildDir: providerDir,
      logger,
      onProgress: (step: string, detail: string) => {
        logger.info({
          message: `[${step}] ${detail}`,
          type: 'progress',
          data: { progress: { step, detail } },
        })
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    deployResult = {
      success: false,
      errors: [{ step: 'deploy', error: message }],
    }
  }

  await writeResultFile(resultFile, deployResult)

  if (deployResult.success) {
    logger.info(`${ANSI.green}${ANSI.bold}Deployment complete.${ANSI.reset}`)
    logger.info(
      `  ${deployResult.workersDeployed?.length ?? 0} units deployed, ${deployResult.resourcesCreated?.length ?? 0} resources created`
    )
  } else {
    logger.error(
      `Deployment finished with ${deployResult.errors.length} error(s):`
    )
    for (const e of deployResult.errors) {
      logger.error(`  ${e.step}: ${e.error}`)
    }
  }
}

export const deployApply = pikkuSessionlessFunc<
  {
    fromPlan?: boolean
    provider?: string
    runtime?: string
    resultFile?: string
    debugArtifacts?: boolean
  },
  void
>({
  func: async ({ logger, config, getInspectorState, bundler }, data) => {
    const projectDir = config.rootDir
    const provider = await resolveProvider(config, data?.provider, {
      runtime: data?.runtime,
    })
    const fromPlan = data?.fromPlan ?? false
    const resultFile = data?.resultFile

    if (fromPlan) {
      // Skip build pipeline — deploy from existing plan output
      const { join } = await import('node:path')
      const { existsSync } = await import('node:fs')

      const providerDir = join(projectDir, '.deploy', provider.deployDirName)
      const infraPath = join(providerDir, 'infra.json')

      if (!existsSync(infraPath)) {
        logger.error(
          `No plan found at ${providerDir}. Run 'pikku deploy plan' first.`
        )
        await writeResultFile(resultFile, {
          success: false,
          errors: [{ step: 'plan', error: 'No plan found' }],
        })
        process.exit(1)
      }

      await runDeploy(provider, providerDir, logger, resultFile)
      return
    }

    // Full build + deploy pipeline
    const inspectorState = await getInspectorState(true)
    const projectId = await resolveProjectId(projectDir)

    const buildResult = await runBuildPipeline({
      projectDir,
      projectId,
      provider,
      inspectorState,
      serverlessIncompatible: config.deploy?.serverlessIncompatible,
      defaultTarget: config.deploy?.defaultTarget,
      getEntryContext,
      outDir: config.outDir,
      debugArtifacts: data?.debugArtifacts ?? false,
      logger,
      bundler,
    })

    if (buildResult.manifest.units.length === 0) {
      logger.info('No deployment units found. Nothing to deploy.')
      await writeResultFile(resultFile, {
        success: true,
        workersDeployed: [],
        resourcesCreated: [],
        errors: [],
      })
      return
    }

    const { providerDir, bundled } = buildResult

    if (typeof provider.deploy === 'function') {
      await runDeploy(provider, providerDir, logger, resultFile)
    } else {
      logger.info(`${ANSI.green}${ANSI.bold}Build complete.${ANSI.reset}`)
      logger.info(
        `  ${bundled.length} functions bundled to ${ANSI.bold}${providerDir}${ANSI.reset}`
      )
      await writeResultFile(resultFile, {
        success: true,
        buildOnly: true,
        unitCount: bundled.length,
      })
    }
  },
})
