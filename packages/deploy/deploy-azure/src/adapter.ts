/**
 * Azure Functions provider adapter for the Pikku deploy pipeline.
 *
 * Uses the Azure Functions v4 Node.js programming model where functions
 * are registered in code via app.http(), app.storageQueue(), app.timer()
 * rather than function.json files.
 */

import { generateInfraManifest } from './infra-manifest.js'
import { generateHostJson, generateLocalSettings } from './host-json.js'

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

function getHandlerTypes(unit: DeploymentUnit): string[] {
  const types = new Set<string>()
  for (const handler of unit.handlers) {
    types.add(handler.type)
  }
  return [...types]
}

export class AzureProviderAdapter {
  readonly name = 'azure'
  readonly deployDirName = 'azure'

  /**
   * Externals for esbuild. Azure Functions runs on Node.js.
   * Same as Lambda — node builtins + Azure SDK packages.
   */
  getExternals(): string[] {
    const builtins = [
      'buffer',
      'crypto',
      'events',
      'fs',
      'http',
      'https',
      'net',
      'os',
      'path',
      'querystring',
      'stream',
      'string_decoder',
      'tls',
      'url',
      'util',
      'zlib',
      'child_process',
      'worker_threads',
      'assert',
      'dns',
      'dgram',
      'readline',
      'tty',
      'v8',
      'vm',
    ]
    return ['node:*', ...builtins, '@azure/*']
  }

  generateEntrySource(ctx: EntryGenerationContext): string {
    const { unit } = ctx

    if (unit.role === 'channel') {
      return this.generateChannelEntry(ctx)
    }
    if (unit.role === 'mcp' || unit.role === 'agent') {
      return this.generateGatewayEntry(ctx)
    }
    if (unit.role === 'workflow') {
      return this.generateGatewayEntry(ctx, true)
    }

    return this.generateCombinedEntry(ctx)
  }

  /**
   * Generates entry source for function/workflow-step units.
   * Uses Azure Functions v4 app.http(), app.storageQueue(), app.timer().
   */
  private generateCombinedEntry(ctx: EntryGenerationContext): string {
    const handlerTypes = getHandlerTypes(ctx.unit)

    const lines: string[] = [
      `// Generated Azure Functions entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { app } from '@azure/functions'`,
      `import { createAzureHandler } from '@pikku/azure-functions'`,
      `import { AzureQueueService } from '@pikku/azure-functions'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx),
      ``,
      `const handlers = createAzureHandler(`,
      `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices },`,
      `  ${JSON.stringify(handlerTypes)}`,
      `)`,
      ``,
    ]

    // Register Azure Functions v4 triggers
    for (const handler of ctx.unit.handlers) {
      if (handler.type === 'fetch') {
        for (const route of handler.routes) {
          const method = route.method.toLowerCase()
          const azureRoute = route.route.replace(/:(\w+)/g, '{$1}')
          lines.push(
            `app.http('${ctx.unit.name}-${method}-${safeName(route.route)}', {`,
            `  methods: ['${route.method}'],`,
            `  route: '${azureRoute}',`,
            `  authLevel: 'anonymous',`,
            `  handler: handlers.http,`,
            `})`,
            ``
          )
        }
      }
      if (handler.type === 'queue') {
        lines.push(
          `app.storageQueue('${ctx.unit.name}-queue-${safeName(handler.queueName)}', {`,
          `  queueName: '${handler.queueName}',`,
          `  connection: 'AzureWebJobsStorage',`,
          `  handler: handlers.queue,`,
          `})`,
          ``
        )
      }
      if (handler.type === 'scheduled') {
        lines.push(
          `app.timer('${ctx.unit.name}-timer-${safeName(handler.taskName)}', {`,
          `  schedule: '${toAzureCron(handler.schedule)}',`,
          `  handler: handlers.timer,`,
          `})`,
          ``
        )
      }
    }

    // If no explicit routes but has fetch handler (RPC access)
    if (
      handlerTypes.includes('fetch') &&
      !ctx.unit.handlers.some((h) => h.type === 'fetch' && h.routes.length > 0)
    ) {
      lines.push(
        `app.http('${ctx.unit.name}-rpc', {`,
        `  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],`,
        `  route: '__pikku/${ctx.unit.name}/{*restOfPath}',`,
        `  authLevel: 'anonymous',`,
        `  handler: handlers.http,`,
        `})`,
        ``
      )
    }

    return lines.join('\n')
  }

  /**
   * Generates entry source for channel units (WebSocket via Web PubSub).
   */
  private generateChannelEntry(ctx: EntryGenerationContext): string {
    const lines: string[] = [
      `// Generated Azure Functions WebSocket entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { app } from '@azure/functions'`,
      `import { createAzureWebSocketHandler } from '@pikku/azure-functions'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx),
      ``,
      `const handlers = createAzureWebSocketHandler(`,
      `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices }`,
      `)`,
      ``,
      `app.http('${ctx.unit.name}-connect', {`,
      `  methods: ['GET'],`,
      `  route: 'ws/${ctx.unit.name}',`,
      `  authLevel: 'anonymous',`,
      `  handler: handlers.negotiate,`,
      `})`,
      ``,
    ]
    return lines.join('\n')
  }

  /**
   * Generates entry source for mcp, agent, and workflow units.
   */
  private generateGatewayEntry(
    ctx: EntryGenerationContext,
    includeQueueHandler = false
  ): string {
    const bindingEntries = ctx.unit.dependsOn.map((dep) => {
      return `    '${fromKebab(dep)}': process.env.AZURE_FUNC_URL_${toScreamingSnake(dep)} || ''`
    })
    const bindingsMap = `{\n${bindingEntries.join(',\n')}\n  }`

    const handlerTypes = includeQueueHandler
      ? `["fetch", "queue"]`
      : `["fetch"]`

    const lines: string[] = [
      `// Generated Azure Functions gateway entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { app } from '@azure/functions'`,
      `import { createAzureHandler } from '@pikku/azure-functions'`,
      `import { AzureQueueService, AzureDeploymentService } from '@pikku/azure-functions'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generateGatewayPlatformServicesBlock(ctx, bindingsMap),
      ``,
      `const handlers = createAzureHandler(`,
      `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices },`,
      `  ${handlerTypes}`,
      `)`,
      ``,
    ]

    // Register HTTP routes for the gateway
    for (const handler of ctx.unit.handlers) {
      if (handler.type === 'fetch') {
        for (const route of handler.routes) {
          const method = route.method.toLowerCase()
          const azureRoute = route.route.replace(/:(\w+)/g, '{$1}')
          lines.push(
            `app.http('${ctx.unit.name}-${method}-${safeName(route.route)}', {`,
            `  methods: ['${route.method}'],`,
            `  route: '${azureRoute}',`,
            `  authLevel: 'anonymous',`,
            `  handler: handlers.http,`,
            `})`,
            ``
          )
        }
      }
      if (handler.type === 'queue') {
        lines.push(
          `app.storageQueue('${ctx.unit.name}-queue', {`,
          `  queueName: '${handler.queueName}',`,
          `  connection: 'AzureWebJobsStorage',`,
          `  handler: handlers.queue,`,
          `})`,
          ``
        )
      }
    }

    // Catch-all for RPC if no explicit routes
    if (
      !ctx.unit.handlers.some((h) => h.type === 'fetch' && h.routes.length > 0)
    ) {
      lines.push(
        `app.http('${ctx.unit.name}-rpc', {`,
        `  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],`,
        `  route: '__pikku/${ctx.unit.name}/{*restOfPath}',`,
        `  authLevel: 'anonymous',`,
        `  handler: handlers.http,`,
        `})`,
        ``
      )
    }

    return lines.join('\n')
  }

  private generatePlatformServicesBlock(ctx: EntryGenerationContext): string[] {
    return [
      `const createPlatformServices = async (): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  if (requiredSingletonServices.queueService) {`,
      `    services.queueService = new AzureQueueService()`,
      `  }`,
      `  return services`,
      `}`,
    ]
  }

  private generateGatewayPlatformServicesBlock(
    ctx: EntryGenerationContext,
    bindingsMap: string
  ): string[] {
    return [
      `const createPlatformServices = async (existingServices?: Record<string, unknown>): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  if (requiredSingletonServices.queueService) {`,
      `    services.queueService = new AzureQueueService()`,
      `  }`,
      `  services.deploymentService = new AzureDeploymentService(`,
      `    existingServices?.jwt as any,`,
      `    existingServices?.secrets as any,`,
      `    ${bindingsMap}`,
      `  )`,
      `  return services`,
      `}`,
    ]
  }

  /**
   * No per-unit config files — Azure Functions v4 uses code-based registration.
   */
  generateUnitConfigs(
    _unit: DeploymentUnit,
    _manifest: DeploymentManifest,
    _projectId: string
  ): Map<string, string> {
    return new Map()
  }

  generateInfraManifest(manifest: DeploymentManifest): string | null {
    const infraManifest = generateInfraManifest(manifest)
    return JSON.stringify(infraManifest, null, 2)
  }

  /**
   * Generates host.json and local.settings.json for the Function App.
   */
  generateProviderConfigs(manifest: DeploymentManifest): Map<string, string> {
    const configs = new Map<string, string>()
    configs.set('host.json', generateHostJson())
    configs.set(
      'local.settings.json',
      generateLocalSettings(manifest.secrets, manifest.variables)
    )
    return configs
  }
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}

function fromKebab(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function safeName(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')
}

/**
 * Converts 5-field UNIX cron to 6-field Azure cron (NCrontab).
 * Azure uses: {second} {minute} {hour} {day} {month} {day-of-week}
 */
function toAzureCron(schedule: string): string {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length >= 6) return schedule
  if (parts.length === 5) {
    return `0 ${schedule}`
  }
  return schedule
}
