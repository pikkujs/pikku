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

/**
 * The runtime helpers the entry imports. The database ones are left out of a
 * build with no database, so the bundle carries no migrator it can never run.
 */
const runtimeImport = (ctx: EntryGenerationContext): string => {
  const names = ['watchParentProcess', 'parseStandaloneCommand']
  if (ctx.db) names.push('runStandaloneCommand', 'resolveMigrationsDir')
  return `import { ${names.join(', ')} } from '@pikku/deploy-standalone/runtime'`
}

/**
 * Environment variable naming the directory the SQLite file lives in.
 *
 * The database has to outlive a release. A deploy that swaps the artifact
 * directory would take the database with it if the file sat beside the bundle,
 * so the path comes from the environment and points somewhere the operator
 * keeps stable across releases, rather than being derived from the bundle's own
 * location the way the frontend directory is.
 */
const DATA_DIR_VAR = 'PIKKU_DATA_DIR'

/**
 * Full override for the database file, for when it must match a path something
 * else already decided — notably `pikku db migrate`, which has to open the same
 * file this opens or the app runs against an unmigrated database.
 */
const DATABASE_FILE_VAR = 'PIKKU_DATABASE_FILE'

const DEFAULT_DATABASE_FILENAME = 'pikku.db'

/**
 * The dialect factory each runtime opens SQLite with. bun cannot use the node
 * one — `bun:sqlite` is a different driver, and the node build reaches for
 * `node:sqlite`, which a compiled bun binary does not carry.
 */
const SQLITE_FACTORY = {
  node: {
    specifier: '@pikku/kysely-node-sqlite',
    fn: 'createNodeSqliteKysely',
  },
  bun: { specifier: '@pikku/kysely-bun-sqlite', fn: 'createBunSqliteKysely' },
} as const

/**
 * The environment variable a Postgres build reads its connection string from.
 *
 * The same name every other pikku host uses, so an artifact dropped onto a
 * machine that already runs a pikku app needs no new variable.
 */
const DATABASE_URL_VAR = 'DATABASE_URL'

/** Imports the coercion plugin, for an app that generated a map. */
const coercionImportLines = (coercionImportPath: string): string[] => [
  `import { createCoercionPlugin } from '@pikku/kysely'`,
  `import { coercionMap as __pikkuCoercionMap } from '${coercionImportPath}'`,
]

/** Imports a database-backed entry needs on top of the common set. */
const dbImportLines = (
  runtime: 'node' | 'bun',
  db: NonNullable<EntryGenerationContext['db']>
): string[] => [
  ...(db.engine === 'sqlite'
    ? [
        `import { ${SQLITE_FACTORY[runtime].fn} } from '${SQLITE_FACTORY[runtime].specifier}'`,
        `import { mkdirSync as __pikkuMkdirSync } from 'node:fs'`,
      ]
    : [`import { PikkuKysely } from '@pikku/kysely-postgres'`]),
  ...(db.coercionImportPath ? coercionImportLines(db.coercionImportPath) : []),
]

/**
 * Opens the database before services are built, so `createSingletonServices`
 * receives `kysely` exactly as a hosted runtime would hand it over.
 *
 * Creating the directory rather than requiring it is deliberate: the artifact
 * is expected to start on a machine where nothing has run yet, and a missing
 * parent directory is the difference between a first boot that works and one
 * that needs a documented mkdir nobody reads.
 */
const dbSetupLines = (
  runtime: 'node' | 'bun',
  db: NonNullable<EntryGenerationContext['db']>
): string[] => {
  const plugins = db.coercionImportPath
    ? `[createCoercionPlugin({ map: __pikkuCoercionMap })]`
    : `[]`

  if (db.engine === 'sqlite') {
    return [
      `  const __pikkuDbFile = process.env.${DATABASE_FILE_VAR}`,
      `    ? process.env.${DATABASE_FILE_VAR}`,
      `    : __pikkuJoin(__pikkuRequireDataDir(), '${DEFAULT_DATABASE_FILENAME}')`,
      `  __pikkuMkdirSync(__pikkuDirname(__pikkuDbFile), { recursive: true })`,
      `  const kysely = ${SQLITE_FACTORY[runtime].fn}({`,
      `    filename: __pikkuDbFile,`,
      `    plugins: ${plugins},`,
      `  })`,
    ]
  }

  return [
    `  const __pikkuDbUrl = process.env.${DATABASE_URL_VAR}`,
    `  if (!__pikkuDbUrl) {`,
    `    throw new Error(`,
    `      'This build connects to Postgres, so it needs ${DATABASE_URL_VAR} set to the database it should open.'`,
    `    )`,
    `  }`,
    `  const __pikkuPg = new PikkuKysely(logger, __pikkuDbUrl)`,
    `  await __pikkuPg.init()`,
    ...(db.coercionImportPath
      ? [
          `  const kysely = __pikkuPg.kysely.withPlugin(`,
          `    createCoercionPlugin({ map: __pikkuCoercionMap })`,
          `  )`,
        ]
      : [`  const kysely = __pikkuPg.kysely`]),
  ]
}

/**
 * Where the migrations sit relative to the running artifact.
 *
 * A node bundle reads them from its own directory. A compiled bun binary has no
 * directory — `import.meta.url` points inside the embedded filesystem — so it
 * resolves them beside the executable, which is where an operator unpacking an
 * artifact puts them.
 */
const bundleDirExpression = (runtime: 'node' | 'bun'): string =>
  runtime === 'node'
    ? `__pikkuDirname(__pikkuFileURLToPath(import.meta.url))`
    : `__pikkuDirname(process.execPath)`

/**
 * The command line, parsed before anything is opened.
 *
 * `version` and `help` have to answer without a database, a config factory or a
 * port, because the machine asking may be one where none of the three work yet
 * — which is exactly when someone runs them.
 */
const commandParseLines = (ctx: EntryGenerationContext): string[] => [
  `const __pikkuCommand = parseStandaloneCommand(process.argv.slice(2), {`,
  `  version: '${(ctx.version ?? 'unknown').replace(/'/g, "\\'")}',`,
  `  hasDb: ${Boolean(ctx.db)},`,
  ...(ctx.db ? [`  engine: '${ctx.db.engine}',`] : []),
  `})`,
  `if (__pikkuCommand.kind === 'exit') process.exit(__pikkuCommand.code)`,
]

/**
 * Runs a non-serve command against the database the app itself just opened, and
 * stops before a port is bound.
 *
 * Reusing the app's own connection is the point: a command that resolved its
 * own would be free to migrate a different database than the next `serve`
 * reads, and the two would only disagree once in production.
 */
const commandDispatchLines = (
  runtime: 'node' | 'bun',
  ctx: EntryGenerationContext
): string[] => {
  if (!ctx.db) {
    return [`  if (__pikkuCommand.kind !== 'serve') process.exit(0)`, ``]
  }

  const dir = `__pikkuJoin(${bundleDirExpression(runtime)}, 'db', '${ctx.db.engine}')`
  const handle =
    ctx.db.engine === 'sqlite'
      ? `databaseFile: __pikkuDbFile,`
      : `sql: __pikkuPg.sql,`

  return [
    `  const __pikkuDbCommandTarget = {`,
    `    engine: '${ctx.db.engine}',`,
    `    migrationsDir: resolveMigrationsDir(${dir}),`,
    `    ${handle}`,
    `  }`,
    `  if ((await runStandaloneCommand(__pikkuCommand, __pikkuDbCommandTarget)) === 'done') {`,
    ...(ctx.db.engine === 'postgres' ? [`    await __pikkuPg.close()`] : []),
    `    return`,
    `  }`,
    ``,
  ]
}

/** Imports the app's own lifecycle module, when it declares one. */
const lifecycleImportLines = (
  lifecycle: NonNullable<EntryGenerationContext['lifecycle']>
): string[] => [
  `import { ${lifecycle.variable} as __pikkuLifecycle } from '${lifecycle.importPath}'`,
]

/**
 * Runs the app's start hooks around the port opening, the same order and the
 * same services `pikku dev` gives them.
 *
 * `beforeStart` runs after `init` so a hook can rely on everything the server
 * resolved, and before `start` so work that must finish before the first
 * request — a seeded admin account, a schema probe — is finished when one
 * arrives.
 */
const lifecycleStartLines = (): string[] => [
  `  await __pikkuLifecycle?.beforeStart?.(singletonServices)`,
]

const lifecycleAfterStartLines = (): string[] => [
  `  await __pikkuLifecycle?.afterStart?.(singletonServices)`,
]

/**
 * Hands the stop hooks to the signal handler that owns the shutdown.
 *
 * The connection pool is closed in `afterStop`, once the app's own hook and the
 * server have both finished with it — a pool closed any earlier takes the
 * queries they are still allowed to make down with it. SQLite needs no
 * counterpart: the process exiting releases the file.
 */
const shutdownHooksArg = (ctx: EntryGenerationContext): string => {
  const before: string[] = []
  const after: string[] = []

  if (ctx.lifecycle) {
    before.push(`await __pikkuLifecycle?.beforeStop?.(singletonServices)`)
    after.push(`await __pikkuLifecycle?.afterStop?.(singletonServices)`)
  }
  if (ctx.db?.engine === 'postgres') {
    after.push(`await __pikkuPg.close()`)
  }

  if (before.length === 0 && after.length === 0) return ''

  const hooks: string[] = []
  if (before.length > 0) {
    hooks.push(`beforeStop: async () => { ${before.join('; ')} }`)
  }
  if (after.length > 0) {
    hooks.push(`afterStop: async () => { ${after.join('; ')} }`)
  }
  return `{ ${hooks.join(', ')} }`
}

/**
 * Fails with the variable's name rather than whatever SQLite says about a path
 * of `undefined/pikku.db`, which is the error an operator would otherwise have
 * to work backwards from.
 */
const dataDirHelperLines = (): string[] => [
  `function __pikkuRequireDataDir() {`,
  `  const dir = process.env.${DATA_DIR_VAR}`,
  `  if (!dir) {`,
  `    throw new Error(`,
  `      'This build bundles a SQLite database, so it needs somewhere to keep it. Set ${DATA_DIR_VAR} to a writable directory that survives a release swap, or set ${DATABASE_FILE_VAR} to the database file itself.'`,
  `    )`,
  `  }`,
  `  return dir`,
  `}`,
]

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
   * Generate a desktop shell (Tauri) around the compiled binary. Requires the
   * `bun` runtime — the shell ships the binary as a sidecar, and only that
   * runtime produces one. A shell pointed at {@link desktopUrl} ships no binary
   * and so has no such requirement.
   */
  desktop?: boolean
  /** Project root. The shell crate is written to `<projectDir>/src-tauri`. */
  projectDir?: string
  /** Bundle identifier for the shell. Derived from the app name when absent. */
  desktopIdentifier?: string
  /**
   * An already-deployed server for the shell to open, instead of bundling one.
   * The window is a webview onto that origin and nothing else is shipped.
   */
  desktopUrl?: string
}

export class StandaloneProviderAdapter implements ProviderAdapter {
  readonly name = 'standalone'
  readonly deployDirName = 'standalone'
  readonly singleUnit = true
  readonly runtime: StandaloneRuntime
  readonly desktop: boolean
  readonly projectDir?: string
  readonly desktopIdentifier?: string
  readonly desktopUrl?: string

  constructor(options: StandaloneProviderAdapterOptions = {}) {
    this.runtime = options.runtime ?? 'node'
    this.desktop = options.desktop ?? Boolean(options.desktopUrl)
    this.projectDir = options.projectDir
    this.desktopIdentifier = options.desktopIdentifier
    this.desktopUrl = options.desktopUrl
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
      runtimeImport(ctx),
      ...(ctx.frontend || ctx.db
        ? [
            `import { dirname as __pikkuDirname, join as __pikkuJoin } from 'node:path'`,
            `import { fileURLToPath as __pikkuFileURLToPath } from 'node:url'`,
          ]
        : []),
      ...(ctx.db ? dbImportLines('node', ctx.db) : []),
      ...(ctx.lifecycle ? lifecycleImportLines(ctx.lifecycle) : []),
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
      ...commandParseLines(ctx),
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
      ...(ctx.db ? dbSetupLines('node', ctx.db) : []),
      ...commandDispatchLines('node', ctx),
      `  const singletonServices = await ${ctx.servicesVar}(config, {`,
      `    logger,`,
      ...(ctx.db ? [`    kysely,`] : []),
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
      ...(ctx.lifecycle ? lifecycleStartLines() : []),
      `  server.enableExitOnSignals(${shutdownHooksArg(ctx)})`,
      `  await server.start()`,
      ...(ctx.lifecycle ? lifecycleAfterStartLines() : []),
      ...sidecarHandshakeLines(),
      `}`,
      ``,
      `main().catch((err) => {`,
      `  logger.error('Fatal: ' + err.message)`,
      `  process.exit(1)`,
      `})`,
      ``,
      ...(ctx.db?.engine === 'sqlite' ? [...dataDirHelperLines(), ``] : []),
    ].join('\n')
  }

  private generateBunEntrySource(ctx: EntryGenerationContext): string {
    return [
      `// Generated standalone entry (bun runtime) — all functions in one process`,
      `import { ConsoleLogger, InMemoryQueueService, InMemoryTriggerService, InMemoryWorkflowService } from '@pikku/core/services'`,
      runtimeImport(ctx),
      `import { pikkuState } from '@pikku/core/state'`,
      `import { wireAgentScorerQueueWorkers } from '@pikku/core/agent-scorer'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`,
      `import { PikkuBunServer, BunEventHubService } from '@pikku/bun-server'`,
      ...(ctx.frontend
        ? [`import { frontendAssets } from '${STANDALONE_FRONTEND_MANIFEST}'`]
        : []),
      ...(ctx.db
        ? [
            `import { dirname as __pikkuDirname, join as __pikkuJoin } from 'node:path'`,
          ]
        : []),
      ...(ctx.db ? dbImportLines('bun', ctx.db) : []),
      ...(ctx.lifecycle ? lifecycleImportLines(ctx.lifecycle) : []),
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
      ...commandParseLines(ctx),
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
      ...(ctx.db ? dbSetupLines('bun', ctx.db) : []),
      ...commandDispatchLines('bun', ctx),
      `  const singletonServices = await ${ctx.servicesVar}(config, {`,
      `    logger,`,
      ...(ctx.db ? [`    kysely,`] : []),
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
      ...(ctx.lifecycle ? lifecycleStartLines() : []),
      `  server.enableExitOnSignals(${shutdownHooksArg(ctx)})`,
      `  await server.start()`,
      ...(ctx.lifecycle ? lifecycleAfterStartLines() : []),
      ...sidecarHandshakeLines(),
      `}`,
      ``,
      `main().catch((err) => {`,
      `  logger.error('Fatal: ' + err.message)`,
      `  process.exit(1)`,
      `})`,
      ``,
      ...(ctx.db?.engine === 'sqlite' ? [...dataDirHelperLines(), ``] : []),
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

  /**
   * The SQLite driver this runtime cannot load.
   *
   * `loadSqliteRuntime` picks its driver by looking for `globalThis.Bun`, so a
   * node process never runs the bun branch — but esbuild still follows the
   * import, and `bun:sqlite` sits at the top of that module as a static import
   * it cannot resolve. Left in, the bundle fails to build; marked external, it
   * becomes a top-level import node fails to load. Stubbing removes the branch
   * that was already dead.
   */
  getStubModules(): string[] {
    if (this.runtime === 'bun') return []
    return ['sqlite-runtime-bun']
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

    // Checked before anything expensive runs: a `--desktop` deploy that cannot
    // produce a shell should say so now, not after a bun compile.
    if (this.desktop) {
      if (!this.desktopUrl && this.runtime !== 'bun') {
        return {
          success: false,
          errors: [
            {
              step: 'desktop',
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
              step: 'desktop',
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

    // --- 2c. desktop: wrap the server in a shell, or point one at a remote ---
    let targetTriple: string | undefined
    if (this.desktop && this.projectDir) {
      const { generateTauriShell, tauriBundleIdentifier } =
        await import('./tauri/generate.js')
      const { hostTargetTriple } = await import('./tauri/target-triple.js')
      const { renderTauriNextSteps } = await import('./tauri/next-steps.js')
      try {
        const rustcVersionVerbose = await rustcHostOutput()
        targetTriple = hostTargetTriple({ rustcVersionVerbose })
        const shell = await generateTauriShell({
          projectDir: this.projectDir,
          appName,
          identifier: this.desktopIdentifier ?? tauriBundleIdentifier(appName),
          targetTriple,
          ...(this.desktopUrl
            ? { remoteUrl: this.desktopUrl }
            : { binaryPath: join(outDir, appName) }),
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
        if (shell.sidecar) {
          logger.info(`  sidecar: binaries/${shell.sidecar.fileName}`)
        } else {
          logger.info(`  window opens: ${this.desktopUrl}`)
        }
        for (const line of renderTauriNextSteps({
          shellDir: shell.dir,
          hasRust: rustcVersionVerbose !== undefined,
        })) {
          logger.info(line)
        }
      } catch (e: unknown) {
        return {
          success: false,
          errors: [
            {
              step: 'desktop',
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
