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

type DeploymentHandler =
  | {
      type: 'fetch'
      routes: Array<{ method: string; route: string; pikkuFuncId: string }>
    }
  | { type: 'queue'; queueName: string }
  | { type: 'scheduled'; schedule: string; taskName: string }

interface DeploymentUnit {
  name: string
  role: string
  functionIds: string[]
  services: Array<{ capability: string; sourceServiceName: string }>
  dependsOn: string[]
  handlers: DeploymentHandler[]
  tags: string[]
}

interface DeploymentManifest {
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

interface EntryGenerationContext {
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

  generateEntrySource(ctx: EntryGenerationContext): string {
    const { unit } = ctx

    // Gateway units use their own dedicated handler factories
    if (unit.role === 'channel') {
      return this.generateChannelGatewayEntry(ctx)
    }
    if (
      unit.role === 'mcp' ||
      unit.role === 'agent' ||
      unit.role === 'workflow'
    ) {
      return this.generateGatewayEntry(ctx)
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

    const lines: string[] = [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createCloudflareHandler } from '@pikku/cloudflare'`,
      `import type { CloudflareEnv } from '@pikku/cloudflare'`,
      `import { CloudflareQueueService, CloudflareWorkflowService, CloudflareAIStorageService, CloudflareAgentRunService, CloudflareAIRunStateService } from '@pikku/cloudflare'`,
      `import type { D1Database } from '@cloudflare/workers-types'`,
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx),
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
    const lines: string[] = [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createCloudflareWebSocketHandler } from '@pikku/cloudflare'`,
      `import type { CloudflareEnv } from '@pikku/cloudflare'`,
      `import { CloudflareQueueService, CloudflareWorkflowService, CloudflareAIStorageService, CloudflareAgentRunService, CloudflareAIRunStateService } from '@pikku/cloudflare'`,
      `import type { D1Database } from '@cloudflare/workers-types'`,
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx),
      ``,
      `export { PikkuWebSocketHibernationServer as WebSocketHibernationServer } from '@pikku/cloudflare'`,
      `export default createCloudflareWebSocketHandler({ createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices })`,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Generates entry source for mcp, agent, and workflow units.
   * Uses the standard worker handler factory.
   */
  private generateGatewayEntry(ctx: EntryGenerationContext): string {
    // Build the service binding map from dependsOn
    const bindingEntries = ctx.unit.dependsOn.map((dep) => {
      const bindingName = toWorkerBinding(dep)
      return `    '${fromKebab(dep)}': '${bindingName}'`
    })
    const bindingsMap = `{\n${bindingEntries.join(',\n')}\n  }`

    const lines: string[] = [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createCloudflareWorkerHandler } from '@pikku/cloudflare'`,
      `import type { CloudflareEnv } from '@pikku/cloudflare'`,
      `import { CloudflareQueueService, CloudflareWorkflowService, CloudflareAIStorageService, CloudflareAgentRunService, CloudflareAIRunStateService, CloudflareDeploymentService } from '@pikku/cloudflare'`,
      `import type { D1Database } from '@cloudflare/workers-types'`,
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generateGatewayPlatformServicesBlock(ctx, bindingsMap),
      ``,
      `export default createCloudflareWorkerHandler({ createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices })`,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Generates the createPlatformServices function block shared by all entry types.
   */
  private generatePlatformServicesBlock(ctx: EntryGenerationContext): string[] {
    return [
      `const createPlatformServices = async (env: CloudflareEnv): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  services.schema = new CFWorkerSchemaService(logger)`,
      `  if (requiredSingletonServices.queueService) {`,
      `    services.queueService = new CloudflareQueueService(env)`,
      `  }`,
      `  if (requiredSingletonServices.workflowService && env.WORKFLOW_DB) {`,
      `    const workflowService = new CloudflareWorkflowService(env.WORKFLOW_DB as D1Database)`,
      `    await workflowService.init()`,
      `    services.workflowService = workflowService`,
      `  }`,
      `  if (requiredSingletonServices.aiStorage && env.DB) {`,
      `    const db = env.DB as D1Database`,
      `    const aiStorage = new CloudflareAIStorageService(db)`,
      `    await aiStorage.init()`,
      `    services.aiStorage = aiStorage`,
      `    services.agentRunService = new CloudflareAgentRunService(db)`,
      `    const aiRunState = new CloudflareAIRunStateService(db)`,
      `    await aiRunState.init()`,
      `    services.aiRunState = aiRunState`,
      `  }`,
      `  return services`,
      `}`,
    ]
  }

  /**
   * Platform services for gateway units — includes CloudflareDeploymentService
   * for dispatching RPC calls to function workers via service bindings.
   */
  private generateGatewayPlatformServicesBlock(
    ctx: EntryGenerationContext,
    bindingsMap: string
  ): string[] {
    return [
      `const createPlatformServices = async (env: CloudflareEnv): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  services.schema = new CFWorkerSchemaService(logger)`,
      `  if (requiredSingletonServices.queueService) {`,
      `    services.queueService = new CloudflareQueueService(env)`,
      `  }`,
      `  if (requiredSingletonServices.workflowService && env.WORKFLOW_DB) {`,
      `    const workflowService = new CloudflareWorkflowService(env.WORKFLOW_DB as D1Database)`,
      `    await workflowService.init()`,
      `    services.workflowService = workflowService`,
      `  }`,
      `  if (requiredSingletonServices.aiStorage && env.DB) {`,
      `    const db = env.DB as D1Database`,
      `    const aiStorage = new CloudflareAIStorageService(db)`,
      `    await aiStorage.init()`,
      `    services.aiStorage = aiStorage`,
      `    services.agentRunService = new CloudflareAgentRunService(db)`,
      `    const aiRunState = new CloudflareAIRunStateService(db)`,
      `    await aiRunState.init()`,
      `    services.aiRunState = aiRunState`,
      `  }`,
      `  services.deploymentService = new CloudflareDeploymentService(`,
      `    env,`,
      `    services.jwt,`,
      `    services.secrets,`,
      `    ${bindingsMap}`,
      `  )`,
      `  return services`,
      `}`,
    ]
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

  generateInfraManifest(manifest: DeploymentManifest): string | null {
    const infra = generateInfraManifest(manifest)
    return JSON.stringify(infra, null, 2)
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
