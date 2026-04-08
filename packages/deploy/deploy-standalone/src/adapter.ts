
/**
 * Standalone provider adapter for the Pikku deploy pipeline.
 *
 * Produces a self-contained distributable directory:
 *
 *   {app-name}/
 *   ├── {app-name}           # pkg binary
 *   ├── config/              # user config (env, secrets, etc.)
 *   └── modules/             # native .node addons
 *       └── uWebSockets.js/
 *
 * The binary loads native modules from ./modules/ relative to its own path.
 * Zip the directory and ship it anywhere Node.js is not required.
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

/**
 * Map node major version to the ABI modules version used by uws filenames.
 */
const NODE_ABI_MAP: Record<string, string> = {
  '20': '115',
  '22': '127',
  '24': '137',
  '25': '141',
}

/**
 * Resolve the pkg target string for the current platform.
 */
function resolvePkgTarget(): string {
  const major = process.versions.node.split('.')[0]
  return `node${major}-${process.platform}-${process.arch}`
}

/**
 * Derive the uws .node filename for a pkg target.
 */
function uwsFilenameForTarget(pkgTarget: string): string | null {
  const match = pkgTarget.match(/^node(\d+)-(\w+)-(\w+)$/)
  if (!match) return null
  const [, nodeMajor, os, arch] = match
  const modules = NODE_ABI_MAP[nodeMajor]
  if (!modules) return null
  const platform: Record<string, string> = {
    linux: 'linux',
    macos: 'darwin',
    win: 'win32',
  }
  return `uws_${platform[os] ?? os}_${arch}_${modules}.node`
}

export class StandaloneProviderAdapter {
  readonly name = 'standalone'
  readonly deployDirName = 'standalone'
  readonly singleUnit = true

  generateEntrySource(ctx: EntryGenerationContext): string {
    return [
      `// Generated standalone entry — all functions in one process`,
      `import { stopSingletonServices } from '@pikku/core'`,
      `import { ConsoleLogger } from '@pikku/core/services'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuUWSServer } from '@pikku/uws'`,
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
      `  const server = new PikkuUWSServer(`,
      `    { ...config, port, hostname },`,
      `    logger,`,
      `  )`,
      `  await server.init({ respondWith404: true })`,
      `  await schedulerService.start()`,
      `  await server.start()`,
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

  /**
   * uWebSockets.js is external — it goes in modules/ alongside the binary.
   * The esbuild alias (getAliases) redirects require('uWebSockets.js') to
   * a shim that loads from ./modules/ relative to the executable.
   */
  getExternals(): string[] {
    // Node builtins (both node: prefix and bare) + native modules.
    // Bare builtins needed because CJS deps like `cron` use require('child_process').
    return [
      'node:*',
      'child_process', 'crypto', 'fs', 'http', 'https', 'net', 'os',
      'path', 'stream', 'url', 'util', 'zlib', 'events', 'buffer',
      'querystring', 'tls', 'dns', 'dgram', 'cluster', 'worker_threads',
      'uWebSockets.js',
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
    const projectDir = join(buildDir, '..', '..')
    const pkgTarget = resolvePkgTarget()
    const appName = unitDirName

    // --- 1. Output directory ---
    const outDir = join(buildDir, appName + '-dist')
    await mkdir(outDir, { recursive: true })

    // --- 2. modules/uWebSockets.js — only the target .node file ---
    const uwsFilename = uwsFilenameForTarget(pkgTarget)
    const uwsModDir = join(outDir, 'modules', 'uWebSockets.js')
    await mkdir(uwsModDir, { recursive: true })

    // Find uws source in node_modules
    let uwsSrcDir: string | null = null
    let dir = projectDir
    for (let i = 0; i < 10; i++) {
      const candidate = join(dir, 'node_modules', 'uWebSockets.js')
      if (existsSync(join(candidate, 'uws.js'))) {
        uwsSrcDir = candidate
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }

    if (uwsSrcDir) {
      await copyFile(join(uwsSrcDir, 'uws.js'), join(uwsModDir, 'uws.js'))
      await writeFile(
        join(uwsModDir, 'package.json'),
        JSON.stringify({ name: 'uWebSockets.js', main: 'uws.js' }),
        'utf-8'
      )
      if (uwsFilename && existsSync(join(uwsSrcDir, uwsFilename))) {
        await copyFile(
          join(uwsSrcDir, uwsFilename),
          join(uwsModDir, uwsFilename)
        )
        logger.info(`modules/uWebSockets.js/${uwsFilename}`)
      } else {
        logger.error(`uws native file not found: ${uwsFilename}`)
      }
    } else {
      logger.error('uWebSockets.js not found in node_modules')
    }

    // --- 3. config/ — empty template with .env example ---
    const configDir = join(outDir, 'config')
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, '.env.example'),
      ['PORT=3000', 'HOST=0.0.0.0', 'NODE_ENV=production', ''].join('\n'),
      'utf-8'
    )

    // --- 4. Compile binary with pkg ---
    // Write a temp package.json for pkg (no assets needed — uws is external)
    await writeFile(
      join(unitDir, 'pkg.json'),
      JSON.stringify({
        name: appName,
        bin: 'bundle.js',
        pkg: { targets: [pkgTarget] },
      }),
      'utf-8'
    )

    const binaryName = process.platform === 'win32' ? `${appName}.exe` : appName
    const binaryPath = join(outDir, binaryName)

    try {
      logger.info(`Compiling binary (${pkgTarget})...`)
      const { exec: pkgExec } = (await import(
        '@yao-pkg/pkg'
      )) as { exec(args: string[]): Promise<void> }
      await pkgExec([
        join(unitDir, 'bundle.js'),
        '--config',
        join(unitDir, 'pkg.json'),
        '--output',
        binaryPath,
      ])
      logger.info(`Binary: ${binaryPath}`)
    } catch (e: unknown) {
      return {
        success: false,
        errors: [{ step: 'pkg', error: (e as Error).message }],
      }
    }

    // --- 5. Zip ---
    try {
      const zipPath = outDir + '.zip'
      const { execSync } = await import('node:child_process')
      execSync(`cd "${dirname(outDir)}" && zip -r "${zipPath}" "${appName}-dist/"`, {
        stdio: 'pipe',
      })
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
