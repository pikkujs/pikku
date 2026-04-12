import { basename, join, relative } from 'node:path'
import { readFile } from 'node:fs/promises'

import { pikkuVoidFunc } from '#pikku'
import type {
  ProviderAdapter,
  EntryGenerationContext,
} from '../../deploy/provider-adapter.js'
import type { PlanChange } from '../../deploy/plan/types.js'
import type { InspectorState } from '@pikku/inspector'
import type { CloudflareInfraManifest } from '@pikku/deploy-cloudflare'
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
  providerName?: string
): Promise<ProviderAdapter> {
  const name =
    providerName ??
    process.env.PIKKU_DEPLOY_PROVIDER ??
    config?.deploy?.defaultProvider ??
    'cloudflare'

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
      return mod.createAdapter()
    }
    if (typeof mod[adapterExportName] === 'function') {
      return new mod[adapterExportName]()
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
  red: '\x1b[31m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

function logProgress(
  change: PlanChange,
  _status: 'start' | 'done' | 'error',
  error?: string
) {
  if (_status === 'done') {
    process.stdout.write(` ${ANSI.green}done${ANSI.reset}\n`)
  } else if (_status === 'error') {
    process.stdout.write(` ${ANSI.red}error: ${error}${ANSI.reset}\n`)
  }
}

export const deployApply = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    const projectDir = config.rootDir
    const inspectorState = await getInspectorState(true)
    const projectId = await resolveProjectId(projectDir)
    const provider = await resolveProvider(config)

    // Build pipeline: analyze → codegen → bundle → configs
    const result = await runBuildPipeline({
      projectDir,
      projectId,
      provider,
      inspectorState,
      serverlessIncompatible: config.deploy?.serverlessIncompatible,
      getEntryContext,
      logger,
    })

    if (result.manifest.units.length === 0) {
      logger.info('No deployment units found. Nothing to deploy.')
      return
    }

    const { providerDir, bundled } = result

    // Deploy (provider-specific)
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
      const { deploy: cfDeploy } = await import('@pikku/deploy-cloudflare')
      const deployResult = await cfDeploy({
        accountId,
        apiToken,
        buildDir: providerDir,
        manifest: infraJson,
        onProgress: (step, detail) => {
          logProgress(
            {
              action: 'create',
              resourceType: step as PlanChange['resourceType'],
              name: detail,
              reason: '',
            },
            'done'
          )
        },
      })

      console.log('')
      if (deployResult.success) {
        logger.info(
          `${ANSI.green}${ANSI.bold}Deployment complete.${ANSI.reset}`
        )
        logger.info(
          `  ${deployResult.workersDeployed.length} workers deployed, ${deployResult.resourcesCreated.length} resources created`
        )
      } else {
        logger.error(
          `Deployment finished with ${deployResult.errors.length} error(s):`
        )
        for (const e of deployResult.errors) {
          logger.error(`  ${e.step}: ${e.error}`)
        }
      }
    } else {
      logger.info(`${ANSI.green}${ANSI.bold}Build complete.${ANSI.reset}`)
      logger.info(
        `  ${bundled.length} functions bundled to ${ANSI.bold}${providerDir}${ANSI.reset}`
      )
      if (provider.name === 'serverless') {
        logger.info(`\nTo deploy: cd ${providerDir} && npx serverless deploy`)
      } else if (provider.name === 'azure') {
        logger.info(
          `\nTo deploy: cd ${providerDir} && func azure functionapp publish <app-name>`
        )
      }
    }
  },
})
