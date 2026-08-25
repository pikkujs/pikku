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
import type { EntryGenerationContext, ProviderAdapter } from '@pikku/deploy'
import { nodeBuiltinExternals, SERVER_READY_MARKER } from '@pikku/deploy'

export type StandaloneRuntime = 'node' | 'bun'

/**
 * Directory the built frontend is copied to, both inside the unit and beside
 * the shipped bundle. The node entry resolves it relative to itself at runtime,
 * so the two have to agree.
 */
export const STANDALONE_FRONTEND_DIR = 'frontend'

/**
 * Module the bun entry imports its embedded assets from. It stays out of the
 * esbuild bundle — esbuild rejects the `with { type: 'file' }` attribute the
 * manifest is built on — and is resolved by `bun build --compile` instead.
 */
export const STANDALONE_FRONTEND_MANIFEST = './frontend-assets.gen.js'

/**
 * Lines every standalone entry ends with, whatever the runtime.
 *
 * The ready line is the handshake a parent process — `pikku dev --spawn`, or
 * the desktop shell that runs this binary as a sidecar — blocks on. It carries
 * `server.port` rather than the requested port because a shell passes `PORT=0`:
 * picking a free port in the parent and handing it down races anything else
 * that binds it in between, so the server binds first and reports back.
 */
const sidecarHandshakeLines = (): string[] => [
  `  watchParentProcess()`,
  `  console.log(\`${SERVER_READY_MARKER} on http://\${hostname}:\${server.port}\`)`,
]

const SIDECAR_RUNTIME_IMPORT = `import { watchParentProcess } from '@pikku/deploy-standalone/runtime'`

/**
 * `rustc -vV`, or nothing when no toolchain is installed. The triple then falls
 * back to the Node platform pair, which is right for every ordinary host — the
 * cases rustc knows better about (musl, Rosetta) are the ones where a Rust
 * toolchain is present anyway.
 */
const rustcHostOutput = async (): Promise<string | undefined> => {
  try {
    const { execFileSync } = await import('node:child_process')
    return execFileSync('rustc', ['-vV'], { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    return undefined
  }
}

export interface StandaloneProviderAdapterOptions {
  runtime?: StandaloneRuntime
  /**
   * Generate a Tauri desktop shell around the compiled binary. Requires the
   * `bun` runtime — the shell ships the binary as a sidecar, and only that
   * runtime produces one.
   */
  tauri?: boolean
  /** Project root. The shell crate is written to `<projectDir>/src-tauri`. */
  projectDir?: string
  /** Bundle identifier for the shell. Derived from the app name when absent. */
  tauriIdentifier?: string
}

export class StandaloneProviderAdapter implements ProviderAdapter {
  readonly name = 'standalone'
  readonly deployDirName = 'standalone'
  readonly singleUnit = true
  readonly runtime: StandaloneRuntime
  readonly tauri: boolean
  readonly projectDir?: string
  readonly tauriIdentifier?: string

  constructor(options: StandaloneProviderAdapterOptions = {}) {
    this.runtime = options.runtime ?? 'node'
    this.tauri = options.tauri ?? false
    this.projectDir = options.projectDir
    this.tauriIdentifier = options.tauriIdentifier
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
      `import { pikkuState } from '@pikku/core/state'`,
      `import { wireAgentScorerQueueWorkers } from '@pikku/core/agent-scorer'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuNodeHTTPServer } from '@pikku/node-http-server'`,
      `import { DEFAULT_WS_MAX_PAYLOAD, pikkuWebsocketHandler } from '@pikku/ws'`,
      `import { WebSocketServer } from 'ws'`,
      SIDECAR_RUNTIME_IMPORT,
      ...(ctx.frontend
        ? [
            `import { dirname as __pikkuDirname, join as __pikkuJoin } from 'node:path'`,
            `import { fileURLToPath as __pikkuFileURLToPath } from 'node:url'`,
          ]
        : []),
      ``,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      ctx.mcpImport,
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
      `  workflowService.wireQueueWorkers()`,
      `  wireAgentScorerQueueWorkers()`,
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
      ...(ctx.frontend
        ? [
            // Resolved from the running bundle rather than baked in at build
            // time, so the distributable stays movable.
            `  const staticMounts = [{`,
            `    urlPrefix: '${ctx.frontend.urlPrefix}',`,
            `    directory: __pikkuJoin(__pikkuDirname(__pikkuFileURLToPath(import.meta.url)), '${STANDALONE_FRONTEND_DIR}'),`,
            `    spaFallback: ${ctx.frontend.spaFallback},`,
            `  }]`,
            ``,
          ]
        : []),
      `  const wss = new WebSocketServer({ noServer: true, maxPayload: DEFAULT_WS_MAX_PAYLOAD })`,
      `  const server = new PikkuNodeHTTPServer(`,
      `    { ...config, port, hostname${ctx.frontend ? ', staticMounts' : ''} },`,
      `    logger,`,
      `    {`,
      `      ${ctx.mcpServerOption}configureServer: (httpServer) => {`,
      `        pikkuWebsocketHandler({ server: httpServer, wss, logger })`,
      `      },`,
      `    }`,
      `  )`,
      `  await server.init()`,
      `  await schedulerService.start()`,
      `  await triggerService.start()`,
      `  server.enableExitOnSignals()`,
      `  await server.start()`,
      ...sidecarHandshakeLines(),
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
      SIDECAR_RUNTIME_IMPORT,
      `import { pikkuState } from '@pikku/core/state'`,
      `import { wireAgentScorerQueueWorkers } from '@pikku/core/agent-scorer'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuBunServer, BunEventHubService } from '@pikku/bun-server'`,
      ...(ctx.frontend
        ? [`import { frontendAssets } from '${STANDALONE_FRONTEND_MANIFEST}'`]
        : []),
      ``,
      ctx.configImport,
      ctx.servicesImport,
      ctx.singletonServicesImport,
      ctx.mcpImport,
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
      `  workflowService.wireQueueWorkers()`,
      `  wireAgentScorerQueueWorkers()`,
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
      ...(ctx.frontend
        ? [
            // A compiled binary has no directory to read: every file was
            // embedded, and the map is the only way back to it.
            `  const staticMounts = [{`,
            `    urlPrefix: '${ctx.frontend.urlPrefix}',`,
            `    directory: '',`,
            `    spaFallback: ${ctx.frontend.spaFallback},`,
            `    assets: frontendAssets,`,
            `  }]`,
            ``,
          ]
        : []),
      `  const server = new PikkuBunServer({ ...config, port, hostname${ctx.frontend ? ', staticMounts' : ''} }, logger, { ${ctx.mcpServerOption}eventHub })`,
      `  await server.init()`,
      `  await schedulerService.start()`,
      `  await triggerService.start()`,
      `  server.enableExitOnSignals()`,
      `  await server.start()`,
      ...sidecarHandshakeLines(),
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
    const externals = nodeBuiltinExternals()
    if (this.runtime === 'bun') {
      // Bun-native builtins are provided by the runtime and resolved by
      // `bun build --compile` — leave them as imports rather than inlining.
      externals.push('bun', 'bun:*', 'bun:sqlite', 'bun:ffi')
      externals.push(STANDALONE_FRONTEND_MANIFEST)
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

    // Checked before anything expensive runs: a `--tauri` deploy that cannot
    // produce a shell should say so now, not after a bun compile.
    if (this.tauri) {
      if (this.runtime !== 'bun') {
        return {
          success: false,
          errors: [
            {
              step: 'tauri',
              error: `A desktop shell ships the server as a sidecar binary, which only the bun runtime produces. Re-run with --runtime bun (got '${this.runtime}').`,
            },
          ],
        }
      }
      if (!this.projectDir) {
        return {
          success: false,
          errors: [
            {
              step: 'tauri',
              error:
                'No project directory was supplied, so there is nowhere to write src-tauri/.',
            },
          ],
        }
      }
    }

    const { join, dirname } = await import('node:path')
    const { cp, readdir, writeFile, copyFile, mkdir } =
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

    // --- 2a. Frontend, when the build produced one ---
    // Both runtimes need it here rather than only in the build directory: node
    // resolves the mount relative to the shipped bundle, and `bun build
    // --compile` follows the manifest import out of the copy it is given.
    const frontendDir = join(unitDir, STANDALONE_FRONTEND_DIR)
    if (existsSync(frontendDir)) {
      await cp(frontendDir, join(outDir, STANDALONE_FRONTEND_DIR), {
        recursive: true,
      })
      const manifestName = STANDALONE_FRONTEND_MANIFEST.replace('./', '')
      if (existsSync(join(unitDir, manifestName))) {
        await copyFile(join(unitDir, manifestName), join(outDir, manifestName))
      }
      logger.info(`Frontend: ${join(outDir, STANDALONE_FRONTEND_DIR)}`)
    }

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

    // --- 2c. tauri: wrap the compiled binary in a desktop shell ---
    let targetTriple: string | undefined
    if (this.tauri && this.projectDir) {
      const { generateTauriShell, tauriBundleIdentifier } =
        await import('./tauri/generate.js')
      const { hostTargetTriple } = await import('./tauri/target-triple.js')
      try {
        targetTriple = hostTargetTriple({
          rustcVersionVerbose: await rustcHostOutput(),
        })
        const shell = await generateTauriShell({
          projectDir: this.projectDir,
          appName,
          identifier: this.tauriIdentifier ?? tauriBundleIdentifier(appName),
          targetTriple,
          binaryPath: join(outDir, appName),
        })
        logger.info(`Desktop shell: ${shell.dir} (${shell.targetTriple})`)
        if (shell.written.length) {
          logger.info(`  wrote ${shell.written.join(', ')}`)
        }
        if (shell.preserved.length) {
          logger.info(
            `  kept your edits, not regenerated: ${shell.preserved.join(', ')}`
          )
        }
        logger.info(`  sidecar: binaries/${shell.sidecar?.fileName}`)
      } catch (e: unknown) {
        return {
          success: false,
          errors: [
            {
              step: 'tauri',
              error: e instanceof Error ? e.message : String(e),
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
      workersDeployed: [appName],
      resourcesCreated: [],
      errors: [],
      targetTriple,
    }
  }
}
