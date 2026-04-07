/**
 * Standalone provider adapter for the Pikku deploy pipeline.
 *
 * Bundles the entire project into a self-contained directory:
 * - bundle.js — single esbuild output with all functions
 * - package.json — only external/native dependencies
 * - lockfile — copied from project
 *
 * Run with: cd .deploy/standalone/package && npm install && node bundle.js
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

export class StandaloneProviderAdapter {
  readonly name = 'standalone'
  readonly deployDirName = 'standalone'
  readonly singleUnit = true

  generateEntrySource(ctx: EntryGenerationContext): string {
    const lines: string[] = [
      `// Generated standalone entry — all functions in one process`,
      `import { stopSingletonServices } from '@pikku/core'`,
      `import { ConsoleLogger } from '@pikku/core/services'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuUWSServer } from '@pikku/uws-server'`,
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
      ``,
      `  const schedulerService = new InMemorySchedulerService()`,
      ``,
      `  const singletonServices = await ${ctx.servicesVar}(config, {`,
      `    logger,`,
      `    schedulerService,`,
      `  } as ${ctx.servicesType})`,
      ``,
      `  const server = new PikkuUWSServer(`,
      `    { ...config, port, hostname },`,
      `    logger,`,
      `  )`,
      `  await server.init({ respondWith404: true })`,
      ``,
      `  // Start cron scheduler`,
      `  await schedulerService.start()`,
      ``,
      `  await server.start()`,
      `  await server.enableExitOnSigInt()`,
      `}`,
      ``,
      `main().catch((err) => {`,
      `  logger.error(\`Fatal: \${err.message}\`)`,
      `  process.exit(1)`,
      `})`,
      ``,
    ]

    return lines.join('\n')
  }

  generateUnitConfigs(
    _unit: DeploymentUnit,
    _manifest: DeploymentManifest,
    _projectId: string
  ): Map<string, string> {
    return new Map()
  }

  generateInfraManifest(_manifest: DeploymentManifest): string | null {
    return null
  }

  generateProviderConfigs(_manifest: DeploymentManifest): Map<string, string> {
    return new Map()
  }

  getExternals(): string[] {
    // uWebSockets.js has native .node addons — keep as external dep
    return ['node:*', 'uWebSockets.js']
  }

  getPlatform(): 'node' {
    return 'node'
  }

  getFormat(): 'cjs' {
    return 'cjs'
  }

  /**
   * Copy native/external packages from the project's node_modules
   * into the package directory, so no npm install is needed for them.
   */
  private async copyNativeExternals(
    projectDir: string,
    packageDir: string,
    logger: { info(msg: string): void; error(msg: string): void }
  ): Promise<void> {
    const { join } = await import('node:path')
    const { existsSync } = await import('node:fs')
    const { mkdir, readdir, copyFile, stat } = await import('node:fs/promises')

    const nativePackages = ['uWebSockets.js']

    for (const pkg of nativePackages) {
      // Walk up to find the package in node_modules
      let sourceDir: string | null = null
      let dir = projectDir
      for (let i = 0; i < 10; i++) {
        const candidate = join(dir, 'node_modules', pkg)
        if (existsSync(candidate)) {
          sourceDir = candidate
          break
        }
        const parent = join(dir, '..')
        if (parent === dir) break
        dir = parent
      }

      if (!sourceDir) continue

      // Copy the package directory (flat copy — no nested node_modules)
      const destDir = join(packageDir, 'node_modules', pkg)
      await mkdir(destDir, { recursive: true })

      const files = await readdir(sourceDir)
      for (const file of files) {
        const src = join(sourceDir, file)
        const s = await stat(src)
        if (s.isFile()) {
          await copyFile(src, join(destDir, file))
        }
      }
      logger.info(`Copied ${pkg} to package/node_modules/`)
    }
  }

  async deploy(options: {
    buildDir: string
    logger: { info(msg: string): void; error(msg: string): void }
    onProgress?: (step: string, detail: string) => void
  }) {
    const { buildDir, logger } = options
    const { join } = await import('node:path')
    const { readdir, readFile, writeFile, copyFile, mkdir } = await import('node:fs/promises')
    const { existsSync } = await import('node:fs')

    // Find the unit directory containing the bundle
    const entries = await readdir(buildDir)
    const unitDirName = entries.find(
      (e) =>
        !e.startsWith('.') &&
        existsSync(join(buildDir, e, 'bundle.js'))
    )

    if (!unitDirName) {
      return {
        success: false,
        errors: [{ step: 'package', error: 'No bundle found in build directory' }],
      }
    }

    const unitDir = join(buildDir, unitDirName)
    const packageDir = join(buildDir, 'package')
    await mkdir(packageDir, { recursive: true })

    // Copy bundle + sourcemap
    await copyFile(join(unitDir, 'bundle.js'), join(packageDir, 'bundle.js'))
    if (existsSync(join(unitDir, 'bundle.js.map'))) {
      await copyFile(join(unitDir, 'bundle.js.map'), join(packageDir, 'bundle.js.map'))
    }

    // Copy package.json, removing "type": "module" since bundle is CJS
    if (existsSync(join(unitDir, 'package.json'))) {
      const pkg = JSON.parse(await readFile(join(unitDir, 'package.json'), 'utf-8'))
      delete pkg.type
      await writeFile(join(packageDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
    }

    // Copy lockfile if it was placed in the unit dir
    for (const lockfile of ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml']) {
      if (existsSync(join(unitDir, lockfile))) {
        await copyFile(join(unitDir, lockfile), join(packageDir, lockfile))
      }
    }

    // Copy native external packages (e.g. uWebSockets.js) directly
    // from the project's node_modules — avoids npm registry issues
    // for packages installed from GitHub
    const projectDir = join(buildDir, '..', '..')
    await this.copyNativeExternals(projectDir, packageDir, logger)

    logger.info(`Package directory: ${packageDir}`)
    logger.info(`Run: cd ${packageDir} && node bundle.js`)

    return {
      success: true,
      workersDeployed: [{ name: 'standalone' }],
      resourcesCreated: [],
      errors: [],
    }
  }
}
