/**
 * Cloudflare provider adapter for the Pikku deploy pipeline.
 *
 * Handles all Cloudflare-specific concerns:
 * - Entry file generation (combined handler exports based on unit.handlers)
 * - wrangler.toml generation
 * - infra.json generation
 */

import { generateWranglerToml } from './wrangler-toml.js'
import { generateInfraManifest } from './infra-manifest.js'

export type DeploymentHandler =
  | {
      type: 'fetch'
      routes: Array<{ method: string; route: string; pikkuFuncId: string }>
    }
  | { type: 'queue'; queueName: string }
  | { type: 'scheduled'; schedule: string; taskName: string }

export interface DeploymentUnit {
  name: string
  role: string
  target: 'serverless' | 'server'
  functionIds: string[]
  services: Array<{ capability: string; sourceServiceName: string }>
  dependsOn: string[]
  handlers: DeploymentHandler[]
  tags: string[]
}

export interface DeploymentManifest {
  projectId: string
  units: DeploymentUnit[]
  queues: Array<{
    name: string
    consumerUnit: string
    consumerFunctionId: string
  }>
  scheduledTasks: Array<{
    name: string
    schedule: string
    unitName: string
    functionId: string
  }>
  channels: Array<{ name: string; route: string; unitName: string }>
  agents: Array<{ name: string; unitName: string; model: string }>
  mcpEndpoints: Array<{ unitName: string }>
  workflows: Array<{ name: string; orchestratorUnit: string }>
  secrets: Array<{
    secretId: string
    displayName: string
    description?: string
  }>
  variables: Array<{
    variableId: string
    displayName: string
    description?: string
  }>
}

export interface EntryGenerationContext {
  unit: DeploymentUnit
  unitDir: string
  bootstrapPath: string
  configImport: string
  configVar: string
  servicesImport: string
  servicesVar: string
  singletonServicesImport: string
  servicesType: string
}

/**
 * Extracts the unique handler types from a unit's handlers array.
 */
function getHandlerTypes(unit: DeploymentUnit): string[] {
  const types = new Set<string>()
  for (const handler of unit.handlers) {
    types.add(handler.type)
  }
  return [...types]
}

export class CloudflareProviderAdapter {
  readonly name = 'cloudflare'
  readonly deployDirName = 'cloudflare'

  /**
   * Determine which @pikku/cloudflare imports the unit needs based on its
   * service capabilities. Prevents pulling in kysely/workflow/AI code for
   * units that don't use those services.
   */
  private resolvePlatformImports(
    unit: DeploymentUnit,
    extraImports: string[] = []
  ): {
    cfImports: string[]
    needsD1: boolean
    needsQueue: boolean
    needsWorkflow: boolean
    needsAI: boolean
  } {
    const needsQueue = unit.services.some((s) => s.capability === 'queue')
    const needsWorkflow = unit.services.some(
      (s) => s.capability === 'workflow-state'
    )
    const needsAI = unit.services.some(
      (s) => s.capability === 'ai-storage' || s.capability === 'ai-model'
    )

    const cfImports = [...extraImports]
    if (needsQueue) cfImports.push('CloudflareQueueService')
    if (needsWorkflow) cfImports.push('CloudflareWorkflowService')
    if (needsAI)
      cfImports.push(
        'CloudflareAIStorageService',
        'CloudflareAgentRunService',
        'CloudflareAIRunStateService'
      )

    return {
      cfImports,
      needsD1: needsWorkflow || needsAI,
      needsQueue,
      needsWorkflow,
      needsAI,
    }
  }

  generateEntrySource(ctx: EntryGenerationContext): string {
    const { unit } = ctx

    // Gateway units use their own dedicated handler factories
    if (unit.role === 'channel') {
      return this.generateChannelGatewayEntry(ctx)
    }
    if (unit.role === 'mcp' || unit.role === 'agent') {
      return this.generateGatewayEntry(ctx)
    }
    // Workflow orchestrators need both fetch (HTTP routes) and queue (step dispatch)
    if (unit.role === 'workflow') {
      return this.generateGatewayEntry(ctx, true)
    }

    // Function and workflow-step units use the combined handler
    return this.generateCombinedHandlerEntry(ctx)
  }

  /**
   * Generates entry source for function/workflow-step units.
   * Produces a combined export object with fetch/queue/scheduled handlers
   * based on the unit's handlers array.
   */
  private generateCombinedHandlerEntry(ctx: EntryGenerationContext): string {
    const handlerTypes = getHandlerTypes(ctx.unit)
    const platform = this.resolvePlatformImports(ctx.unit, [
      'createCloudflareHandler',
    ])

    const lines: string[] = [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createCloudflareHandler } from '@pikku/cloudflare/handler'`,
      `import type { CloudflareEnv } from '@pikku/cloudflare/handler'`,
      ...(platform.needsQueue
        ? [`import { CloudflareQueueService } from '@pikku/cloudflare/queue'`]
        : []),
      ...(platform.needsD1
        ? [
            `import { ${[
              ...(platform.needsWorkflow ? ['CloudflareWorkflowService'] : []),
              ...(platform.needsAI
                ? [
                    'CloudflareAIStorageService',
                    'CloudflareAgentRunService',
                    'CloudflareAIRunStateService',
                  ]
                : []),
            ].join(', ')} } from '@pikku/cloudflare/d1'`,
            `import type { D1Database } from '@cloudflare/workers-types'`,
          ]
        : []),
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx, platform),
      ``,
      `export default createCloudflareHandler(`,
      `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices },`,
      `  ${JSON.stringify(handlerTypes)}`,
      `)`,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Generates entry source for channel units.
   * Uses the WebSocket handler factory and exports the DO class.
   */
  private generateChannelGatewayEntry(ctx: EntryGenerationContext): string {
    const platform = this.resolvePlatformImports(ctx.unit, [
      'createCloudflareWebSocketHandler',
    ])

    const lines: string[] = [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createCloudflareWebSocketHandler } from '@pikku/cloudflare/handler'`,
      `import type { CloudflareEnv } from '@pikku/cloudflare/handler'`,
      ...(platform.needsQueue
        ? [`import { CloudflareQueueService } from '@pikku/cloudflare/queue'`]
        : []),
      ...(platform.needsD1
        ? [
            `import { ${[
              ...(platform.needsWorkflow ? ['CloudflareWorkflowService'] : []),
              ...(platform.needsAI
                ? [
                    'CloudflareAIStorageService',
                    'CloudflareAgentRunService',
                    'CloudflareAIRunStateService',
                  ]
                : []),
            ].join(', ')} } from '@pikku/cloudflare/d1'`,
            `import type { D1Database } from '@cloudflare/workers-types'`,
          ]
        : []),
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx, platform),
      ``,
      `export { PikkuWebSocketHibernationServer as WebSocketHibernationServer } from '@pikku/cloudflare/websocket'`,
      `export default createCloudflareWebSocketHandler({ createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices })`,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Generates entry source for mcp, agent, and workflow units.
   * Uses the standard worker handler factory.
   */
  private generateGatewayEntry(
    ctx: EntryGenerationContext,
    includeQueueHandler = false
  ): string {
    // Build the service binding map from dependsOn
    const bindingEntries = ctx.unit.dependsOn.map((dep) => {
      const bindingName = toWorkerBinding(dep)
      return `    '${fromKebab(dep)}': '${bindingName}'`
    })
    const bindingsMap = `{\n${bindingEntries.join(',\n')}\n  }`

    const handlerName = includeQueueHandler
      ? 'createCloudflareHandler'
      : 'createCloudflareWorkerHandler'
    const platform = this.resolvePlatformImports(ctx.unit, [
      handlerName,
      'CloudflareDeploymentService',
    ])

    const handlerTypes = includeQueueHandler ? `["fetch", "queue"]` : ''

    const exportLine = includeQueueHandler
      ? `export default createCloudflareHandler(\n  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices },\n  ${handlerTypes}\n)`
      : `export default createCloudflareWorkerHandler({ createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices })`

    const handlerImport = includeQueueHandler
      ? `import { createCloudflareHandler } from '@pikku/cloudflare/handler'`
      : `import { createCloudflareWorkerHandler } from '@pikku/cloudflare/handler'`

    const lines: string[] = [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      handlerImport,
      `import type { CloudflareEnv } from '@pikku/cloudflare/handler'`,
      `import { CloudflareDeploymentService } from '@pikku/cloudflare/deployment'`,
      ...(platform.needsQueue
        ? [`import { CloudflareQueueService } from '@pikku/cloudflare/queue'`]
        : []),
      ...(platform.needsD1
        ? [
            `import { ${[
              ...(platform.needsWorkflow ? ['CloudflareWorkflowService'] : []),
              ...(platform.needsAI
                ? [
                    'CloudflareAIStorageService',
                    'CloudflareAgentRunService',
                    'CloudflareAIRunStateService',
                  ]
                : []),
            ].join(', ')} } from '@pikku/cloudflare/d1'`,
            `import type { D1Database } from '@cloudflare/workers-types'`,
          ]
        : []),
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generateGatewayPlatformServicesBlock(ctx, platform, bindingsMap),
      ``,
      exportLine,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Generates the createPlatformServices function block shared by all entry types.
   */
  private generatePlatformServicesBlock(
    ctx: EntryGenerationContext,
    platform: ReturnType<CloudflareProviderAdapter['resolvePlatformImports']>
  ): string[] {
    const lines = [
      `const createPlatformServices = async (env: CloudflareEnv): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  services.schema = new CFWorkerSchemaService(logger)`,
    ]
    if (platform.needsQueue) {
      lines.push(`  services.queueService = new CloudflareQueueService(env)`)
    }
    if (platform.needsWorkflow) {
      lines.push(
        `  if (env.WORKFLOW_DB) {`,
        `    const workflowService = new CloudflareWorkflowService(env.WORKFLOW_DB as D1Database)`,
        `    await workflowService.init()`,
        `    services.workflowService = workflowService`,
        `  }`
      )
    }
    if (platform.needsAI) {
      lines.push(
        `  if (env.DB) {`,
        `    const db = env.DB as D1Database`,
        `    const aiStorage = new CloudflareAIStorageService(db)`,
        `    await aiStorage.init()`,
        `    services.aiStorage = aiStorage`,
        `    services.agentRunService = new CloudflareAgentRunService(db)`,
        `    const aiRunState = new CloudflareAIRunStateService(db)`,
        `    await aiRunState.init()`,
        `    services.aiRunState = aiRunState`,
        `  }`
      )
    }
    lines.push(`  return services`, `}`)
    return lines
  }

  /**
   * Platform services for gateway units — includes CloudflareDeploymentService
   * for dispatching RPC calls to function workers via service bindings.
   */
  private generateGatewayPlatformServicesBlock(
    ctx: EntryGenerationContext,
    platform: ReturnType<CloudflareProviderAdapter['resolvePlatformImports']>,
    bindingsMap: string
  ): string[] {
    const lines = [
      `const createPlatformServices = async (env: CloudflareEnv): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  services.schema = new CFWorkerSchemaService(logger)`,
    ]
    if (platform.needsQueue) {
      lines.push(`  services.queueService = new CloudflareQueueService(env)`)
    }
    if (platform.needsWorkflow) {
      lines.push(
        `  if (env.WORKFLOW_DB) {`,
        `    const workflowService = new CloudflareWorkflowService(env.WORKFLOW_DB as D1Database)`,
        `    await workflowService.init()`,
        `    services.workflowService = workflowService`,
        `  }`
      )
    }
    if (platform.needsAI) {
      lines.push(
        `  if (env.DB) {`,
        `    const db = env.DB as D1Database`,
        `    const aiStorage = new CloudflareAIStorageService(db)`,
        `    await aiStorage.init()`,
        `    services.aiStorage = aiStorage`,
        `    services.agentRunService = new CloudflareAgentRunService(db)`,
        `    const aiRunState = new CloudflareAIRunStateService(db)`,
        `    await aiRunState.init()`,
        `    services.aiRunState = aiRunState`,
        `  }`
      )
    }
    lines.push(
      `  services.deploymentService = new CloudflareDeploymentService(`,
      `    env,`,
      `    services.jwt,`,
      `    services.secrets,`,
      `    ${bindingsMap}`,
      `  )`,
      `  return services`,
      `}`
    )
    return lines
  }

  generateUnitConfigs(
    unit: DeploymentUnit,
    manifest: DeploymentManifest,
    projectId: string
  ): Map<string, string> {
    const configs = new Map<string, string>()
    configs.set(
      'wrangler.toml',
      generateWranglerToml(unit, manifest, projectId)
    )
    return configs
  }

  generateProviderConfigs(_manifest: DeploymentManifest): Map<string, string> {
    return new Map()
  }

  generateInfraManifest(manifest: DeploymentManifest): string | null {
    const infra = generateInfraManifest(manifest)
    return JSON.stringify(infra, null, 2)
  }

  getExternals(): string[] {
    return ['node:*', 'cloudflare:*', 'uWebSockets.js']
  }

  getAliases(): Record<string, string> {
    return { crypto: 'node:crypto' }
  }

  getDefine(): Record<string, string> {
    return {
      'process.versions.electron': 'undefined',
      'process.versions.node': '"22.0.0"',
    }
  }

  async deploy(options: {
    buildDir: string
    logger: { info(msg: string): void; error(msg: string): void }
    onProgress?: (step: string, detail: string) => void
  }) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = process.env.CLOUDFLARE_API_TOKEN
    const dispatchNamespace = process.env.CLOUDFLARE_DISPATCH_NAMESPACE

    if (!accountId || !apiToken) {
      return {
        success: false,
        errors: [
          {
            step: 'auth',
            error:
              'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables.',
          },
        ],
      }
    }

    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { deploy } = await import('./deploy.js')

    const infraJson = JSON.parse(
      await readFile(join(options.buildDir, 'infra.json'), 'utf-8')
    )

    // Error if any server-target units exist — container deploy requires Fabric
    const serverUnits = Object.entries(infraJson.units || {}).filter(
      ([_, u]) => (u as Record<string, unknown>).target === 'server'
    )
    if (serverUnits.length > 0) {
      const names = serverUnits.map(([name]) => name).join(', ')
      return {
        success: false,
        errors: [
          {
            step: 'validation',
            error: `Project contains server-target functions (${names}) which require a container runtime. Server deploy is available via Pikku Fabric (https://pikku.dev/fabric).`,
          },
        ],
      }
    }

    return deploy({
      accountId,
      apiToken,
      buildDir: options.buildDir,
      manifest: infraJson,
      onProgress: options.onProgress,
      dispatchNamespace,
    })
  }
}

/** Convert kebab-case unit name to SCREAMING_SNAKE_CASE binding name */
function toWorkerBinding(name: string): string {
  return name.replace(/-/g, '_').toUpperCase()
}

/** Convert kebab-case to camelCase (for function name lookup) */
function fromKebab(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}
