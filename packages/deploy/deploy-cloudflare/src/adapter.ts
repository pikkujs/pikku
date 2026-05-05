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
import {
  generateServerProxyBundle,
  serverProxyConstants,
} from './server-proxy-entry.js'

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

export type PlatformImports = {
  cfImports: string[]
  needsD1: boolean
  needsQueue: boolean
  needsWorkflow: boolean
  needsAI: boolean
}

/**
 * Hook for callers (custom deployers, orchestrators) to inject extra services
 * into the generated `createPlatformServices` block. Each contributor is
 * called once per entry; lines are emitted before `return services`. Imports
 * are spliced into the entry's import header.
 *
 * Contributors should gate their service wiring on env bindings being present
 * (`if (env.MY_BINDING) { ... }`) so the same generated entry runs both for
 * users who declare the bindings and for those who don't.
 */
export interface PlatformServiceContributor {
  /** Identifier — used for diagnostics and dedup if a contributor is passed twice. */
  name: string
  /** Module-level import lines this contributor's emitted code depends on. */
  imports?: string[]
  /**
   * Lines emitted inside `createPlatformServices`, before `return services`.
   * `services` is in scope (typed as `ctx.servicesType`); so is `env` and
   * `logger`. Return `[]` to opt out for the given context.
   */
  emit(args: {
    ctx: EntryGenerationContext
    platform: PlatformImports
    isGateway: boolean
  }): string[]
}

export interface CloudflareProviderAdapterOptions {
  contributors?: PlatformServiceContributor[]
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
   * CF's workflow runtime is `PikkuWorkflowDoClient` + `PikkuWorkflowDO`,
   * a Durable-Object-backed orchestrator that advances steps via direct
   * per-rpc service-binding stubs — no queue hop required. Opt out of
   * synthesized step queues so the deploy manifest stays minimal and we
   * don't provision idle CF queues just to satisfy the legacy
   * queue-dispatch model.
   */
  readonly workflowQueues = false

  private readonly contributors: PlatformServiceContributor[]

  constructor(options: CloudflareProviderAdapterOptions = {}) {
    // De-dupe contributors by name (last wins).
    const byName = new Map<string, PlatformServiceContributor>()
    for (const c of options.contributors ?? []) {
      byName.set(c.name, c)
    }
    this.contributors = [...byName.values()]
  }

  /** Collect all contributor imports as a flat, de-duplicated array. */
  private contributorImports(): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of this.contributors) {
      for (const line of c.imports ?? []) {
        if (!seen.has(line)) {
          seen.add(line)
          out.push(line)
        }
      }
    }
    return out
  }

  /** Run every contributor's emit() and concatenate the resulting lines. */
  private contributorLines(
    ctx: EntryGenerationContext,
    platform: PlatformImports,
    isGateway: boolean
  ): string[] {
    const out: string[] = []
    for (const c of this.contributors) {
      const lines = c.emit({ ctx, platform, isGateway })
      if (lines.length > 0) out.push(...lines)
    }
    return out
  }

  /**
   * Determine which @pikku/cloudflare imports the unit needs based on its
   * service capabilities. Prevents pulling in kysely/workflow/AI code for
   * units that don't use those services.
   */
  private resolvePlatformImports(
    unit: DeploymentUnit,
    extraImports: string[] = []
  ): PlatformImports {
    const needsQueue = unit.services.some((s) => s.capability === 'queue')
    const needsWorkflow = unit.services.some(
      (s) => s.capability === 'workflow-state'
    )
    const needsAI = unit.services.some(
      (s) => s.capability === 'ai-storage' || s.capability === 'ai-model'
    )

    const cfImports = [...extraImports]
    if (needsQueue) cfImports.push('CloudflareQueueService')
    if (needsAI)
      cfImports.push(
        'CloudflareAIStorageService',
        'CloudflareAgentRunService',
        'CloudflareAIRunStateService'
      )

    return {
      cfImports,
      needsD1: needsAI,
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
    // Workflow orchestrators expose fetch (HTTP routes) and a queue handler for
    // any user-declared queues bound to this unit. Workflow step dispatch goes
    // through the per-run Durable Object (WORKFLOW_DO), NOT through this queue.
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
      ...(platform.needsWorkflow
        ? [
            `import { PikkuWorkflowDoClient } from '@pikku/cloudflare/workflow-do'`,
            `import type { DurableObjectNamespace } from '@cloudflare/workers-types'`,
          ]
        : []),
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ...this.contributorImports(),
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
      ...(platform.needsWorkflow
        ? [
            `import { PikkuWorkflowDoClient } from '@pikku/cloudflare/workflow-do'`,
            `import type { DurableObjectNamespace } from '@cloudflare/workers-types'`,
          ]
        : []),
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ...this.contributorImports(),
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generatePlatformServicesBlock(ctx, platform),
      ``,
      `export { PikkuWebSocketHibernationServer as WebSocketHibernationServer } from '@pikku/cloudflare/handler'`,
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
    const isWorkflowRole = ctx.unit.role === 'workflow'

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
      ? `import { createCloudflareHandler${isWorkflowRole ? ', setupServices' : ''} } from '@pikku/cloudflare/handler'`
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
      ...(platform.needsWorkflow
        ? [
            `import { PikkuWorkflowDoClient${isWorkflowRole ? ', PikkuWorkflowDO, PikkuWorkflowDoService' : ''} } from '@pikku/cloudflare/workflow-do'`,
            `import type { DurableObjectNamespace${isWorkflowRole ? ', DurableObjectStorage' : ''} } from '@cloudflare/workers-types'`,
            ...(isWorkflowRole
              ? [`import type { WorkflowRunWire } from '@pikku/core/workflow'`]
              : []),
          ]
        : []),
      `import { CFWorkerSchemaService } from '@pikku/schema-cfworker'`,
      `import { JsonConsoleLogger } from '@pikku/core/services'`,
      ...this.contributorImports(),
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      ...this.generateGatewayPlatformServicesBlock(ctx, platform, bindingsMap),
      ``,
      ...(isWorkflowRole ? this.generateWorkflowDoClass(ctx) : []),
      exportLine,
      ``,
    ]

    return lines.join('\n')
  }

  /**
   * Emit a `WorkflowOrchestratorDO` class for workflow-role gateway entries.
   *
   * The DO is one-per-run and does the actual workflow orchestration —
   * storing run/step state in `ctx.storage`, dispatching steps to per-rpc
   * service bindings, and waking on `alarm()` for retries/sleeps.
   *
   * Singleton services are initialized on first invocation via the shared
   * `setupServices` helper and pinned on `globalThis.__PIKKU_SINGLETON_SERVICES__`
   * so the orchestrator's RPC service is available inside `alarm()`,
   * which fires without a parent fetch.
   */
  private generateWorkflowDoClass(ctx: EntryGenerationContext): string[] {
    return [
      `const __pikkuFactories = {`,
      `  createConfig: ${ctx.configVar},`,
      `  createSingletonServices: ${ctx.servicesVar},`,
      `  createPlatformServices,`,
      `}`,
      ``,
      `export class WorkflowOrchestratorDO extends PikkuWorkflowDO<CloudflareEnv> {`,
      `  protected createService(): PikkuWorkflowDoService<CloudflareEnv> {`,
      `    return new PikkuWorkflowDoService<CloudflareEnv>(`,
      `      this.ctx.storage as DurableObjectStorage,`,
      `      this.env,`,
      `      this.ctx.id.toString()`,
      `    )`,
      `  }`,
      ``,
      `  private async ensureSingletons(): Promise<void> {`,
      `    const slot = globalThis as { __PIKKU_SINGLETON_SERVICES__?: unknown }`,
      `    if (slot.__PIKKU_SINGLETON_SERVICES__) return`,
      `    slot.__PIKKU_SINGLETON_SERVICES__ = await setupServices(this.env, __pikkuFactories)`,
      `  }`,
      ``,
      `  // Pin singletons before delegating so the orchestrator's RPC service`,
      `  // is available across both the fetch path (start) and the alarm path`,
      `  // (retries/sleeps fire without a parent fetch).`,
      `  async start(input: {`,
      `    workflow: string`,
      `    input: unknown`,
      `    wire?: WorkflowRunWire`,
      `    graphHash?: string`,
      `    inline?: boolean`,
      `  }): Promise<{ runId: string }> {`,
      `    await this.ensureSingletons()`,
      `    return super.start(input)`,
      `  }`,
      ``,
      `  async alarm(): Promise<void> {`,
      `    await this.ensureSingletons()`,
      `    return super.alarm()`,
      `  }`,
      `}`,
      ``,
    ]
  }

  /**
   * Generates the createPlatformServices function block shared by all entry types.
   */
  private generatePlatformServicesBlock(
    ctx: EntryGenerationContext,
    platform: PlatformImports
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
        `  if (env.WORKFLOW_DO) {`,
        `    services.workflowService = new PikkuWorkflowDoClient(env.WORKFLOW_DO as DurableObjectNamespace)`,
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
    lines.push(...this.contributorLines(ctx, platform, false))
    lines.push(`  return services`, `}`)
    return lines
  }

  /**
   * Platform services for gateway units — includes CloudflareDeploymentService
   * for dispatching RPC calls to function workers via service bindings.
   */
  private generateGatewayPlatformServicesBlock(
    ctx: EntryGenerationContext,
    platform: PlatformImports,
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
        `  if (env.WORKFLOW_DO) {`,
        `    services.workflowService = new PikkuWorkflowDoClient(env.WORKFLOW_DO as DurableObjectNamespace)`,
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
      `  )`
    )
    lines.push(...this.contributorLines(ctx, platform, true))
    lines.push(`  return services`, `}`)
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
    // Map every node builtin to its `node:`-prefixed form. CF's
    // nodejs_compat_v2 only resolves prefixed imports.
    const builtins = [
      'assert',
      'async_hooks',
      'buffer',
      'child_process',
      'cluster',
      'console',
      'constants',
      'crypto',
      'dgram',
      'dns',
      'domain',
      'events',
      'fs',
      'http',
      'http2',
      'https',
      'inspector',
      'module',
      'net',
      'os',
      'path',
      'perf_hooks',
      'process',
      'punycode',
      'querystring',
      'readline',
      'repl',
      'stream',
      'string_decoder',
      'sys',
      'timers',
      'tls',
      'trace_events',
      'tty',
      'url',
      'util',
      'v8',
      'vm',
      'wasi',
      'worker_threads',
      'zlib',
    ]
    const aliases: Record<string, string> = {}
    for (const b of builtins) aliases[b] = `node:${b}`
    return aliases
  }

  getNoRequireShim(): boolean {
    // CF Workers don't define `import.meta.url`, so the createRequire shim
    // crashes at boot. Skip it; nodejs_compat_v2 handles builtins natively.
    return true
  }

  getDefine(): Record<string, string> {
    return {
      'process.versions.electron': 'undefined',
      'process.versions.node': '"22.0.0"',
    }
  }

  /**
   * Emit the synthesized `pikku-server-proxy` Worker when the project has
   * any `target: 'server'` units. The proxy fronts the CF Container app
   * via a Durable Object and forwards every inbound request to it.
   *
   * Output: `units/pikku-server-proxy/bundle.js`. Plain ESM JS — CF handles
   * `cloudflare:workers` natively, so no esbuild step is needed.
   */
  async emitSideArtifacts(options: {
    buildDir: string
    manifest: DeploymentManifest
    logger: { info(msg: string): void; error(msg: string): void }
  }): Promise<void> {
    const { buildDir, manifest, logger } = options
    const hasServerUnits = manifest.units.some((u) => u.target === 'server')
    if (!hasServerUnits) return

    const { mkdir, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')

    const proxyDir = join(buildDir, 'units', serverProxyConstants.unitName)
    await mkdir(proxyDir, { recursive: true })
    await writeFile(
      join(proxyDir, 'bundle.js'),
      generateServerProxyBundle(),
      'utf-8'
    )
    // Empty package.json so any orchestrator that walks `units/*/package.json`
    // sees the proxy unit. No deps — `cloudflare:workers` is platform-provided.
    await writeFile(
      join(proxyDir, 'package.json'),
      JSON.stringify(
        { name: serverProxyConstants.unitName, type: 'module' },
        null,
        2
      ),
      'utf-8'
    )
    logger.info(
      `Emitted ${serverProxyConstants.unitName} proxy worker → ${proxyDir}`
    )
  }

  async deploy(options: {
    buildDir: string
    logger: { info(msg: string): void; error(msg: string): void }
    onProgress?: (step: string, detail: string) => void
  }) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = process.env.CLOUDFLARE_API_TOKEN

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

    // Server-target units are emitted as a Node container bundle in
    // .deploy/cloudflare/container/ (Dockerfile + bundle.js + package.json).
    // The CF adapter doesn't ship them — that's an orchestrator concern
    // (fly.io, ECS, custom orchestrator, ...). Skip them here; they're already on disk.
    const serverUnitNames = Object.entries(infraJson.units || {})
      .filter(([_, u]) => (u as Record<string, unknown>).target === 'server')
      .map(([name]) => name)
    if (serverUnitNames.length > 0) {
      options.logger.info(
        `Skipping ${serverUnitNames.length} server-target unit(s) — container artifacts emitted in .deploy/cloudflare/container/ for an orchestrator to pick up: ${serverUnitNames.join(', ')}`
      )
    }

    return deploy({
      accountId,
      apiToken,
      buildDir: options.buildDir,
      manifest: infraJson,
      onProgress: options.onProgress,
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
