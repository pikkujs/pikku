/**
 * Standalone provider adapter for the Pikku deploy pipeline.
 *
 * Produces a self-contained distributable directory:
 *
 *   {app-name}/
 *   ├── bundle.js            # esbuild bundle (all deps inlined)
 *   ├── config/              # user config (env, secrets, etc.)
 *
 * Uses Express + ws (pure JS) to avoid native addon issues with bundling.
 * Run with `node bundle.js`.
 */

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

  generateEntrySource(ctx: EntryGenerationContext): string {
    return [
      `// Generated standalone entry — all functions in one process`,
      `import { ConsoleLogger } from '@pikku/core/services'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuExpressServer } from '@pikku/express'`,
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
      `  const singletonServices = await ${ctx.servicesVar}(config, {`,
      `    logger,`,
      `    schedulerService,`,
      `  })`,
      ``,
      `  const server = new PikkuExpressServer(`,
      `    { ...config, port, hostname },`,
      `    logger,`,
      `  )`,
      `  await server.init({ respondWith404: true })`,
      `  await schedulerService.start()`,
      `  await server.start()`,
      ``,
      `  // Attach WebSocket server to the same HTTP server`,
      `  const wss = new WebSocketServer({ server: server.getHttpServer() })`,
      `  pikkuWebsocketHandler({ server: server.getHttpServer(), wss, logger })`,
      ``,
      `  await server.enableExitOnSigInt()`,
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
    return [
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
    const { readdir, writeFile, copyFile, mkdir } = await import(
      'node:fs/promises'
    )
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
