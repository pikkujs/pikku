/**
 * Standalone provider adapter for the Pikku deploy pipeline.
 *
 * Produces a self-contained distributable directory:
 *
 *   {app-name}/
 *   ├── bundle.js            # esbuild bundle (all deps inlined)
 *   ├── config/              # user config (env, secrets, etc.)
 *
 * Two runtimes, selected via `--runtime`:
 *
 * - `node` (default): uses `@pikku/node-http-server` (pure JS, node:http) —
 *   the same server `pikku dev` and the container deploy entry use, so all
 *   three share one HTTP path. Ships `bundle.js`; run with `node bundle.js`.
 * - `bun`: uses `@pikku/bun-server` (Bun.serve, native WebSockets) and
 *   compiles the bundle into a single self-contained executable via
 *   `bun build --compile`. No runtime needed on the target host.
 */

export type StandaloneRuntime = 'node' | 'bun'

export interface StandaloneProviderAdapterOptions {
  runtime?: StandaloneRuntime
}

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

export class StandaloneProviderAdapter {
  readonly name = 'standalone'
  readonly deployDirName = 'standalone'
  readonly singleUnit = true
  readonly runtime: StandaloneRuntime

  constructor(options: StandaloneProviderAdapterOptions = {}) {
    this.runtime = options.runtime ?? 'node'
  }

  generateEntrySource(ctx: EntryGenerationContext): string {
    if (this.runtime === 'bun') {
      return this.generateBunEntrySource(ctx)
    }
    return this.generateNodeEntrySource(ctx)
  }

  private generateNodeEntrySource(ctx: EntryGenerationContext): string {
    return [
      `// Generated standalone entry — all functions in one process`,
      `import { LocalEventHubService } from '@pikku/core/channel/local'`,
      `import { ConsoleLogger, InMemoryQueueService, InMemoryTriggerService, InMemoryWorkflowService } from '@pikku/core/services'`,
      `import { pikkuState } from '@pikku/core/internal'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuNodeHTTPServer } from '@pikku/node-http-server'`,
      `import { pikkuWebsocketHandler } from '@pikku/ws'`,
      `import { WebSocketServer } from 'ws'`,
      ``,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      `const logger = new ConsoleLogger()`,
      `const port = parseInt(process.env.PORT || '3000', 10)`,
      `const hostname = process.env.HOST || '0.0.0.0'`,
      ``,
      `async function main() {`,
      `  const config = await ${ctx.configVar}()`,
      `  const schedulerService = new InMemorySchedulerService()`,
      `  const queueService = new InMemoryQueueService()`,
      `  const workflowService = new InMemoryWorkflowService()`,
      `  const triggerService = new InMemoryTriggerService()`,
      `  const eventHub = new LocalEventHubService()`,
      `  workflowService.rewireQueueWorkers()`,
      `  const singletonServices = await ${ctx.servicesVar}(config, {`,
      `    logger,`,
      `    schedulerService,`,
      `    queueService,`,
      `    workflowService,`,
      `    workflowRunService: workflowService,`,
      `    triggerService,`,
      `    eventHub,`,
      `  })`,
      `  pikkuState(null, 'package', 'singletonServices', singletonServices)`,
      ``,
      `  const wss = new WebSocketServer({ noServer: true })`,
      `  const server = new PikkuNodeHTTPServer(`,
      `    { ...config, port, hostname },`,
      `    logger,`,
      `    {`,
      `      configureServer: (httpServer) => {`,
      `        pikkuWebsocketHandler({ server: httpServer, wss, logger })`,
      `      },`,
      `    }`,
      `  )`,
      `  await server.init()`,
      `  await schedulerService.start()`,
      `  await triggerService.start()`,
      `  server.enableExitOnSignals()`,
      `  await server.start()`,
      `}`,
      ``,
      `main().catch((err) => {`,
      `  logger.error('Fatal: ' + err.message)`,
      `  process.exit(1)`,
      `})`,
      ``,
    ].join('\n')
  }

  private generateBunEntrySource(ctx: EntryGenerationContext): string {
    return [
      `// Generated standalone entry (bun runtime) — all functions in one process`,
      `import { ConsoleLogger, InMemoryQueueService, InMemoryTriggerService, InMemoryWorkflowService } from '@pikku/core/services'`,
      `import { pikkuState } from '@pikku/core/internal'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuBunServer, BunEventHubService } from '@pikku/bun-server'`,
      ``,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      `import '${ctx.bootstrapPath}'`,
      ``,
      `const logger = new ConsoleLogger()`,
      `const port = parseInt(process.env.PORT || '3000', 10)`,
      `const hostname = process.env.HOST || '0.0.0.0'`,
      ``,
      `async function main() {`,
      `  const config = await ${ctx.configVar}()`,
      `  const schedulerService = new InMemorySchedulerService()`,
      `  const queueService = new InMemoryQueueService()`,
      `  const workflowService = new InMemoryWorkflowService()`,
      `  const triggerService = new InMemoryTriggerService()`,
      `  const eventHub = new BunEventHubService()`,
      `  workflowService.rewireQueueWorkers()`,
      `  const singletonServices = await ${ctx.servicesVar}(config, {`,
      `    logger,`,
      `    schedulerService,`,
      `    queueService,`,
      `    workflowService,`,
      `    workflowRunService: workflowService,`,
      `    triggerService,`,
      `    eventHub,`,
      `  })`,
      `  pikkuState(null, 'package', 'singletonServices', singletonServices)`,
      ``,
      `  const server = new PikkuBunServer({ ...config, port, hostname }, logger, { eventHub })`,
      `  await server.init()`,
      `  await schedulerService.start()`,
      `  await triggerService.start()`,
      `  server.enableExitOnSignals()`,
      `  await server.start()`,
      `}`,
      ``,
      `main().catch((err) => {`,
      `  logger.error('Fatal: ' + err.message)`,
      `  process.exit(1)`,
      `})`,
      ``,
    ].join('\n')
  }

  generateUnitConfigs(): Map<string, string> {
    return new Map()
  }

  generateInfraManifest(): string | null {
    return null
  }

  generateProviderConfigs(): Map<string, string> {
    return new Map()
  }

  getExternals(): string[] {
    const externals = [
      'node:*',
      'child_process',
      'crypto',
      'fs',
      'http',
      'https',
      'net',
      'os',
      'path',
      'stream',
      'url',
      'util',
      'zlib',
      'events',
      'buffer',
      'querystring',
      'tls',
      'dns',
      'dgram',
      'cluster',
      'worker_threads',
    ]
    if (this.runtime === 'bun') {
      // Bun-native builtins are provided by the runtime and resolved by
      // `bun build --compile` — leave them as imports rather than inlining.
      externals.push('bun', 'bun:*', 'bun:sqlite', 'bun:ffi')
    }
    return externals
  }

  getPlatform(): 'node' {
    return 'node'
  }

  async deploy(options: {
    buildDir: string
    logger: { info(msg: string): void; error(msg: string): void }
    onProgress?: (step: string, detail: string) => void
  }) {
    const { buildDir, logger } = options
    const { join, dirname } = await import('node:path')
    const { readdir, writeFile, copyFile, mkdir } =
      await import('node:fs/promises')
    const { existsSync } = await import('node:fs')

    // Find the unit dir with the bundle
    const entries = await readdir(buildDir)
    const unitDirName = entries.find(
      (e) => !e.startsWith('.') && existsSync(join(buildDir, e, 'bundle.js'))
    )
    if (!unitDirName) {
      return {
        success: false,
        errors: [{ step: 'build', error: 'No bundle found' }],
      }
    }

    const unitDir = join(buildDir, unitDirName)
    const appName = unitDirName

    // --- 1. Output directory ---
    const outDir = join(buildDir, appName + '-dist')
    await mkdir(outDir, { recursive: true })

    // --- 2. Copy bundle ---
    await copyFile(join(unitDir, 'bundle.js'), join(outDir, 'bundle.js'))
    if (existsSync(join(unitDir, 'bundle.js.map'))) {
      await copyFile(
        join(unitDir, 'bundle.js.map'),
        join(outDir, 'bundle.js.map')
      )
    }
    logger.info(`Bundle: ${join(outDir, 'bundle.js')}`)

    // --- 2b. bun runtime: compile the bundle into a self-contained binary ---
    if (this.runtime === 'bun') {
      const { execFileSync } = await import('node:child_process')
      const binaryPath = join(outDir, appName)
      try {
        execFileSync(
          'bun',
          [
            'build',
            '--compile',
            '--minify',
            `--outfile=${binaryPath}`,
            join(outDir, 'bundle.js'),
          ],
          { stdio: 'pipe' }
        )
        logger.info(`Binary: ${binaryPath}`)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return {
          success: false,
          errors: [
            {
              step: 'compile',
              error: `bun build --compile failed (is bun installed?): ${message}`,
            },
          ],
        }
      }
    }

    // --- 3. config/ — empty template with .env example ---
    const configDir = join(outDir, 'config')
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, '.env.example'),
      ['PORT=3000', 'HOST=0.0.0.0', 'NODE_ENV=production', ''].join('\n'),
      'utf-8'
    )

    // --- 4. Zip ---
    try {
      const zipPath = outDir + '.zip'
      const { execSync } = await import('node:child_process')
      execSync(
        `cd "${dirname(outDir)}" && zip -r "${zipPath}" "${appName}-dist/"`,
        {
          stdio: 'pipe',
        }
      )
      logger.info(`Zip: ${zipPath}`)
    } catch {
      logger.info('zip not available — directory ready as-is')
    }

    logger.info(`Output: ${outDir}`)

    return {
      success: true,
      workersDeployed: [{ name: appName }],
      resourcesCreated: [],
      errors: [],
    }
  }
}
