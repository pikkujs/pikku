/**
 * Cloudflare provider adapter for the Pikku deploy pipeline.
 *
 * Handles all Cloudflare-specific concerns:
 * - Entry file generation (handler factories, platform services)
 * - wrangler.toml generation
 * - infra.json generation
 */

import { generateWranglerToml } from './wrangler-toml.js'
import { generateInfraManifest } from './infra-manifest.js'

interface DeploymentUnit {
  name: string
  role: string
  functionIds: string[]
  services: Array<{ capability: string; sourceServiceName: string }>
  httpRoutes: Array<{ method: string; route: string }>
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

function getHandlerName(role: string): string {
  switch (role) {
    case 'http':
    case 'agent':
    case 'rpc':
    case 'workflow-orchestrator':
      return 'createCloudflareWorkerHandler'
    case 'mcp':
      return 'createCloudflareMCPHandler'
    case 'queue-consumer':
    case 'workflow-step':
      return 'createCloudflareQueueHandler'
    case 'scheduled':
      return 'createCloudflareCronHandler'
    case 'channel':
      return 'createCloudflareWebSocketHandler'
    default:
      return 'createCloudflareWorkerHandler'
  }
}

export class CloudflareProviderAdapter {
  readonly name = 'cloudflare'
  readonly deployDirName = 'cloudflare'

  generateEntrySource(ctx: EntryGenerationContext): string {
    const handlerName = getHandlerName(ctx.unit.role)

    return [
      `// Generated entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { ${handlerName} } from '@pikku/cloudflare'`,
      `import type { CloudflareEnv } from '@pikku/cloudflare'`,
      `import { CloudflareQueueService, CloudflareWorkflowService, CloudflareAIStorageService, CloudflareAgentRunService, CloudflareAIRunStateService } from '@pikku/cloudflare'`,
      `import type { D1Database } from '@cloudflare/workers-types'`,
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { ConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      `const createPlatformServices = async (env: CloudflareEnv): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new ConsoleLogger()`,
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
      ``,
      ...(ctx.unit.role === 'channel'
        ? [
            `export { PikkuWebSocketHibernationServer as WebSocketHibernationServer } from '@pikku/cloudflare'`,
            `export default ${handlerName}({ createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices })`,
          ]
        : [
            `export default ${handlerName}({ createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices })`,
          ]),
      ``,
    ].join('\n')
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
