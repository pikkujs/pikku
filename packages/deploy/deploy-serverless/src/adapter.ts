/**
 * Serverless Framework provider adapter for the Pikku deploy pipeline.
 *
 * Handles all AWS/Serverless-specific concerns:
 * - Entry file generation (Lambda handlers based on unit role/handlers)
 * - serverless.yml generation (single file for whole project)
 * - infra.json generation (AWS resource manifest)
 */

import { generateServerlessYml } from './serverless-yml.js'
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

export class ServerlessProviderAdapter {
  readonly name = 'serverless'
  readonly deployDirName = 'serverless'

  /**
   * Externals for esbuild — Lambda runs on Node.js, so only
   * node builtins need to be external. No cloudflare:* needed.
   */
  /**
   * Externals for esbuild. Lambda runs on Node.js so all builtins are available.
   * We need both node:* (ESM imports) and bare names (CJS requires from
   * dependencies like @smithy/* that use require('buffer')).
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
    return ['node:*', ...builtins, '@aws-sdk/*', '@smithy/*']
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

    return this.generateCombinedHandlerEntry(ctx)
  }

  /**
   * Generates entry source for function/workflow-step units.
   * Uses createLambdaHandler with the appropriate handler types.
   */
  private generateCombinedHandlerEntry(ctx: EntryGenerationContext): string {
    const handlerTypes = getHandlerTypes(ctx.unit)

    const lines: string[] = [
      `// Generated Lambda entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createLambdaHandler } from '@pikku/lambda'`,
      `import { SQSQueueService } from '@pikku/lambda'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx),
      ``,
      `const handlers = createLambdaHandler(`,
      `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices },`,
      `  ${JSON.stringify(handlerTypes)}`,
      `)`,
      ``,
      // Export each handler individually for serverless.yml to reference
      `export const handler = handlers.handler`,
      handlerTypes.includes('queue')
        ? `export const queue = handlers.queue`
        : '',
      handlerTypes.includes('scheduled')
        ? `export const scheduled = handlers.scheduled`
        : '',
      ``,
    ]

    return lines.filter((l) => l !== '').join('\n') + '\n'
  }

  /**
   * Generates entry source for channel units (WebSocket).
   * Exports separate connect/disconnect/default handlers.
   */
  private generateChannelEntry(ctx: EntryGenerationContext): string {
    const lines: string[] = [
      `// Generated Lambda WebSocket entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      `import { createLambdaWebSocketHandler } from '@pikku/lambda'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx),
      ``,
      `const handlers = createLambdaWebSocketHandler(`,
      `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices }`,
      `)`,
      ``,
      `export const connect = handlers.connect`,
      `export const disconnect = handlers.disconnect`,
      // 'default' is a reserved word, use bracket notation
      `const defaultHandler = handlers.default`,
      `export { defaultHandler as default }`,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Generates entry source for mcp, agent, and workflow units.
   * Includes LambdaDeploymentService for remote RPC to function units.
   */
  private generateGatewayEntry(
    ctx: EntryGenerationContext,
    includeQueueHandler = false
  ): string {
    // Build the function binding map from dependsOn
    const bindingEntries = ctx.unit.dependsOn.map((dep) => {
      const envKey = `LAMBDA_FUNC_${toScreamingSnake(dep)}`
      return `    ${JSON.stringify(fromKebab(dep))}: process.env.${envKey} || ''`
    })
    const bindingsMap = `{\n${bindingEntries.join(',\n')}\n  }`

    const handlerImport = includeQueueHandler
      ? `import { createLambdaHandler } from '@pikku/lambda'`
      : `import { createLambdaWorkerHandler } from '@pikku/lambda'`

    const handlerTypes = includeQueueHandler ? `["fetch", "queue"]` : ''

    const handlerCreation = includeQueueHandler
      ? [
          `const handlers = createLambdaHandler(`,
          `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices },`,
          `  ${handlerTypes}`,
          `)`,
          ``,
          `export const handler = handlers.handler`,
          `export const queue = handlers.queue`,
        ]
      : [
          `const handlers = createLambdaWorkerHandler(`,
          `  { createConfig: ${ctx.configVar}, createSingletonServices: ${ctx.servicesVar}, createPlatformServices }`,
          `)`,
          ``,
          `export const handler = handlers.handler`,
        ]

    const lines: string[] = [
      `// Generated Lambda gateway entry for "${ctx.unit.name}" (${ctx.unit.role})`,
      handlerImport,
      `import { SQSQueueService, LambdaDeploymentService } from '@pikku/lambda'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import { requiredSingletonServices } from './.pikku/pikku-services.gen.js'`,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generateGatewayPlatformServicesBlock(ctx, bindingsMap),
      ``,
      ...handlerCreation,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Platform services for function/workflow-step units.
   */
  private generatePlatformServicesBlock(ctx: EntryGenerationContext): string[] {
    return [
      `const createPlatformServices = async (): Promise<${ctx.servicesType}> => {`,
      `  const services: ${ctx.servicesType} = {}`,
      `  const logger = new JsonConsoleLogger()`,
      `  services.logger = logger`,
      `  if (requiredSingletonServices.queueService) {`,
      `    services.queueService = new SQSQueueService()`,
      `  }`,
      `  return services`,
      `}`,
    ]
  }

  /**
   * Platform services for gateway units — includes LambdaDeploymentService
   * for dispatching RPC calls to function Lambdas.
   */
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
      `    services.queueService = new SQSQueueService()`,
      `  }`,
      `  services.deploymentService = new LambdaDeploymentService(`,
      `    existingServices?.jwt as any,`,
      `    existingServices?.secrets as any,`,
      `    ${bindingsMap}`,
      `  )`,
      `  return services`,
      `}`,
    ]
  }

  /**
   * No per-unit config files needed — everything goes in the single serverless.yml.
   */
  generateUnitConfigs(
    _unit: DeploymentUnit,
    _manifest: DeploymentManifest,
    _projectId: string
  ): Map<string, string> {
    return new Map()
  }

  /**
   * Generates both the infra.json and serverless.yml as the infrastructure manifest.
   * Returns the serverless.yml content since that's what the user actually needs.
   */
  generateInfraManifest(manifest: DeploymentManifest): string | null {
    const infraManifest = generateInfraManifest(manifest)
    return JSON.stringify(infraManifest, null, 2)
  }

  /**
   * Generates provider-level config files — specifically serverless.yml.
   */
  generateProviderConfigs(manifest: DeploymentManifest): Map<string, string> {
    const infraManifest = generateInfraManifest(manifest)
    const yml = generateServerlessYml(infraManifest)
    return new Map([['serverless.yml', yml]])
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

export const createAdapter = () => new ServerlessProviderAdapter()
