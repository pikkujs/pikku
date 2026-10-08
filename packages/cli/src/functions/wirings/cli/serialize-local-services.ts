import type { FlatScope } from '@pikku/core/scope'
import type { SystemRole } from '@pikku/core/role'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * The database drivers the project declares, which decide the openers the
 * generated file may import. A literal import of a package the project does
 * not have fails its type check, and fails a bundler outright.
 */
export interface LocalServicesDrivers {
  nodeSqlite: boolean
  bunSqlite: boolean
  pg: boolean
  /** `pg` ships no types, so its import needs them from `@types/pg` or a waiver. */
  pgTypes: boolean
  /** `mysql2` ships its own types. */
  mysql: boolean
}

/**
 * What a generated local CLI needs on top of what `pikku serve` hands the
 * file: it runs with no host, so it opens its own database and builds the
 * scheduler and meta services the dev server otherwise passes in.
 */
export interface LocalCLIServicesOptions {
  drivers: LocalServicesDrivers
  /** The generated coercion map, when the project has run a migration. */
  coercionFile?: string
  /**
   * The sqlite file a project with `db/sqlite` and no configured database runs
   * against — the same default `pikku serve` resolves.
   */
  conventionalSqliteDb?: string
}

export interface SerializeLocalServicesOptions {
  localServicesFile: string
  packageMappings: Record<string, string>
  /** The services the project's functions reach for, as the inspector found them. */
  requiredServices: Iterable<string>
  scopes: FlatScope[]
  systemRoles: SystemRole[]
  /**
   * Whether the project has a database, which is what brings in `@pikku/kysely`
   * and the services backed by it. Without one the file imports from
   * `@pikku/core` alone.
   */
  database: boolean
  /** Set when the project has a local CLI entrypoint, which imports this file. */
  localCLI?: LocalCLIServicesOptions
}

/**
 * The packages beyond `@pikku/core` a file serialized with these options
 * imports, which the project has to declare itself: the file is loaded from
 * the project, not from the pikku CLI's own dependencies.
 */
export const localServicesPackages = ({
  database,
  localCLI,
}: Pick<SerializeLocalServicesOptions, 'database' | 'localCLI'>): string[] => [
  ...(database ? ['@pikku/kysely'] : []),
  ...(localCLI ? ['@pikku/schedule'] : []),
]

/**
 * The services gated on `requiredServices`, and only those: a project that
 * never asks for one has no tables for it, so bringing it up would fail a boot
 * over a service nothing uses.
 */
const GATED_SERVICES = [
  'scopeService',
  'webhookService',
  'incomingWebhookService',
  'agentStorage',
  'agentRunState',
  'agentRunService',
] as const

const json = (value: unknown): string => JSON.stringify(value, null, 2)

const sqliteOpener = (
  drivers: LocalServicesDrivers,
  plugins: string
): string => {
  const missing = (pkg: string, runtime: string) =>
    `throw new Error(
      "This project's database is sqlite, and opening it under ${runtime} needs ${pkg}. Add it to the project's dependencies, or set DATABASE_URL to a database this process can open."
    )`
  const bun = drivers.bunSqlite
    ? `const { createBunSqliteKysely } = await import('@pikku/kysely-bun-sqlite')
    return createBunSqliteKysely<any>({ filename, plugins: ${plugins} })`
    : missing('@pikku/kysely-bun-sqlite', 'bun')
  const node = drivers.nodeSqlite
    ? `const { createNodeSqliteKysely } = await import('@pikku/kysely-node-sqlite')
  return createNodeSqliteKysely<any>({ filename, plugins: ${plugins} })`
    : missing('@pikku/kysely-node-sqlite', 'node')
  return `const openSqlite = async (filename: string): Promise<Kysely<any>> => {
  mkdirSync(dirname(filename), { recursive: true })
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    ${bun}
  }
  ${node}
}`
}

const postgresOpener = (
  drivers: LocalServicesDrivers,
  plugins: string
): string => {
  if (!drivers.pg) {
    return `const openPostgres = async (
  _connectionString: string
): Promise<Kysely<any>> => {
  throw new Error(
    "This project's database is postgres, and opening it needs the pg driver. Add pg to the project's dependencies."
  )
}`
  }
  return `const openPostgres = async (
  connectionString: string
): Promise<Kysely<any>> => {
  ${drivers.pgTypes ? '' : '// @ts-ignore -- pg ships no types of its own, and @types/pg is not declared\n  '}const { default: pg } = await import('pg')
  // allowExitOnIdle, because a CLI command returns rather than being stopped:
  // an idle pooled client would otherwise hold the process open after it has
  // printed its answer.
  const pool = new pg.Pool({ connectionString, max: 10, allowExitOnIdle: true })
  return new Kysely<any>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin(), ...${plugins}],
  })
}`
}

const mysqlOpener = (
  drivers: LocalServicesDrivers,
  plugins: string
): string => {
  if (!drivers.mysql) {
    return `const openMysql = async (_url: string): Promise<Kysely<any>> => {
  throw new Error(
    "This project's database is mysql, and opening it needs the mysql2 driver. Add mysql2 to the project's dependencies."
  )
}`
  }
  return `const openMysql = async (url: string): Promise<Kysely<any>> => {
  const { createPool } = await import('mysql2')
  const pool = createPool({ uri: url, connectionLimit: 10, decimalNumbers: true })
  return new Kysely<any>({
    dialect: new MysqlDialect({ pool }),
    plugins: [new CamelCasePlugin(), ...${plugins}],
  })
}`
}

const databaseOpener = (
  localCLI: LocalCLIServicesOptions,
  coerces: boolean
): string => {
  const plugins = coerces
    ? '[createCoercionPlugin({ map: coercionMap })]'
    : '[]'
  const conventional = localCLI.conventionalSqliteDb
    ? `'${localCLI.conventionalSqliteDb}'`
    : 'undefined'
  return `const conventionalSqliteDb: string | undefined = ${conventional}

/** DATABASE_URL read the way \`pikku serve\` reads it. A remote libsql URL is not opened here. */
const parseDatabaseUrl = (url: string): DatabaseTarget => {
  if (/^postgres(ql)?:\\/\\//.test(url)) return { postgresUrl: url }
  if (/^mysql:\\/\\//.test(url)) return { mysqlUrl: url }
  if (/^(libsql|https?):\\/\\//.test(url)) return {}
  return { sqliteDb: url }
}

${sqliteOpener(localCLI.drivers, plugins)}

${postgresOpener(localCLI.drivers, plugins)}

${mysqlOpener(localCLI.drivers, plugins)}

/**
 * Opens the database this app runs against locally, or returns undefined when
 * it has none. A relative sqlite path resolves against the working directory,
 * which is the project root the CLI is run from.
 *
 * An embedded (PGlite) postgres is not opened: that is a \`pikku dev\` facility,
 * and a CLI without DATABASE_URL runs on the in-memory services instead.
 */
export const openLocalDatabase = async (
  config: DatabaseTarget
): Promise<Kysely<any> | undefined> => {
  const databaseUrl = process.env.DATABASE_URL
  const target = databaseUrl ? parseDatabaseUrl(databaseUrl) : config
  const configured = (
    [
      ['postgresUrl', target.postgresUrl],
      ['sqliteDb', target.sqliteDb],
      ['mysqlUrl', target.mysqlUrl],
    ] as const
  ).filter(([, value]) => value)
  if (configured.length > 1) {
    throw new Error(
      \`\${configured.map(([key]) => key).join(', ')} are all set. Configure exactly one database dialect.\`
    )
  }
  if (target.postgresUrl) {
    return openPostgres(target.postgresUrl)
  }
  if (target.mysqlUrl) {
    return openMysql(target.mysqlUrl)
  }
  const sqliteDb = target.sqliteDb ?? conventionalSqliteDb
  if (sqliteDb) {
    return openSqlite(resolve(process.cwd(), sqliteDb))
  }
  return undefined
}
`
}

/** The services a project without a database gets: all in memory. */
const inMemoryBody = (
  localCLI: boolean
): string => `export const createLocalServices = async (
  _config: DatabaseTarget,
  extras: LocalServicesExtras = {},
  options: LocalServicesOptions = {}
): Promise<Record<string, any>> => {
  const { kysely, ...hostServices } = extras
  if (kysely) {
    // Handed a database this file was generated without: the database-backed
    // services are only emitted for a project codegen saw a database in.
    const warnLogger = options.logger ?? stderr
    warnLogger.warn(
      'A database is configured, but pikku-local-services.gen.ts was generated for a project without one, so its services run in memory. Add db/sqlite or db/postgres, or declare @pikku/kysely, and regenerate.'
    )
  }
  const queueService = new InMemoryQueueService()
  const workflowService = new InMemoryWorkflowService()
  const triggerSourceStore = new InMemoryTriggerSourceStore()

  return {
    emailService: new LocalEmailService(),
${localCLI ? cliOnlyServices : ''}    queueService,
    webhookService: new QueueWebhookService(queueService),
    incomingWebhookService: new IncomingWebhookService(queueService),
    workflowService,
    workflowRunService: workflowService,
    triggerService: new InMemoryTriggerService(),
    triggerSourceStore,
    agentStorage: undefined,
    agentRunState: new InMemoryAgentRunStateService(),
    agentRunService: undefined,
    ...(kysely ? { kysely } : {}),
    ...hostServices,
  }
}
`

const cliOnlyServices = `    metaService: new LocalMetaService(dirname(fileURLToPath(import.meta.url))),
    schedulerService: new InMemorySchedulerService(),
`

/** The services a project with a database gets, backed by it when one is open. */
const databaseBody = (localCLI: boolean): string => `/**
 * Brings a database-backed service up, or drops it with the reason.
 *
 * \`init()\` on these services is a check, not a create: a project whose
 * migrations predate the declaration that needs the table gets a throw, and the
 * project never asked for the service. So it is dropped and the reason printed,
 * which is only done where running without it degrades to what the project had
 * before rather than doing something wrong.
 */
const initOrWarn = async <T extends { init(): Promise<void> }>(
  service: T,
  name: string,
  logger: WarnLogger
): Promise<T | undefined> => {
  try {
    await service.init()
    return service
  } catch (error) {
    logger.warn(
      \`Running without '\${name}': \${error instanceof Error ? error.message : String(error)}\`
    )
    return undefined
  }
}

export const createLocalServices = async (
  ${localCLI ? 'config' : '_config'}: DatabaseTarget,
  extras: LocalServicesExtras = {},
  options: LocalServicesOptions = {}
): Promise<Record<string, any>> => {
  const { kysely: hostKysely, ...hostServices } = extras
  const warnLogger = options.logger ?? stderr
  const isRequired = (name: GatedService): boolean =>
    options.requiredServices
      ? options.requiredServices.has(name)
      : requiredServices[name]
  const kysely =
    hostKysely === undefined
      ? ${localCLI ? 'await openLocalDatabase(config)' : 'undefined'}
      : (hostKysely ?? undefined)

  const agentStorage =
    kysely && isRequired('agentStorage')
      ? new KyselyAgentStorageService(kysely)
      : undefined
  const agentRunState =
    kysely && isRequired('agentRunState')
      ? new KyselyAgentRunStateService(kysely)
      : new InMemoryAgentRunStateService()
  const agentRunService =
    kysely && isRequired('agentRunService')
      ? new KyselyAgentRunService(kysely)
      : undefined
  if (agentStorage) await agentStorage.init()
  if ('init' in agentRunState && typeof agentRunState.init === 'function') {
    await agentRunState.init()
  }

  // Dropped with a warning rather than thrown on, unlike the agent services
  // above: both tables come from a declaration the project may have added since
  // it last migrated, and neither absence is worse than having no service — an
  // unregistered flag source resolves every gate open, and analytics without a
  // service falls back to the logger.
  const featureFlags = kysely
    ? await initOrWarn(new KyselyFeatureFlagStore(kysely), 'featureFlags', warnLogger)
    : undefined
  const analyticsService = kysely
    ? await initOrWarn(new KyselyAnalyticsService(kysely), 'analyticsService', warnLogger)
    : undefined

  const scopeService =
    kysely && isRequired('scopeService') ? new KyselyScopeService(kysely) : undefined
  if (scopeService) {
    await scopeService.init()
    await scopeService.syncScopes(options.scopes ?? declaredScopes)
    await scopeService.syncSystemRoles(options.systemRoles ?? declaredSystemRoles)
  }

  // The queue-only webhook service delivers but keeps no history, so the
  // console's webhooks page is empty on a project that has the tables for it.
  const queueService = new InMemoryQueueService()
  const webhookService =
    kysely && isRequired('webhookService')
      ? new KyselyWebhookService(queueService, kysely)
      : new QueueWebhookService(queueService)
  if (webhookService instanceof KyselyWebhookService) {
    await webhookService.init()
  }
  const incomingWebhookService =
    kysely && isRequired('incomingWebhookService')
      ? new KyselyIncomingWebhookService(queueService, kysely)
      : new IncomingWebhookService(queueService)
  if (incomingWebhookService instanceof KyselyIncomingWebhookService) {
    await incomingWebhookService.init()
  }

  // Falls back to the in-memory store when the table is not migrated yet, so
  // the admin addon's trigger-source functions work rather than throwing.
  const triggerSourceStore =
    (kysely
      ? await initOrWarn(new KyselyTriggerSourceStore(kysely), 'triggerSourceStore', warnLogger)
      : undefined) ?? new InMemoryTriggerSourceStore()

  // One instance under both names: InMemoryWorkflowService implements the
  // workflowRunService surface too, which the console reads runs through.
  const workflowService = new InMemoryWorkflowService()

  return {
    emailService: new LocalEmailService(),
${localCLI ? cliOnlyServices : ''}    queueService,
    webhookService,
    incomingWebhookService,
    ...(scopeService ? { scopeService } : {}),
    workflowService,
    workflowRunService: workflowService,
    triggerService: new InMemoryTriggerService(),
    triggerSourceStore,
    agentStorage,
    agentRunState,
    agentRunService,
    ...(featureFlags ? { featureFlags } : {}),
    ...(analyticsService ? { analyticsService } : {}),
    ...(kysely ? { kysely } : {}),
    ...hostServices,
  }
}
`

/**
 * Serializes `pikku-local-services.gen.ts`: the services a locally run process
 * of this app boots on top of its own `createSingletonServices`. `pikku serve`,
 * `pikku dev` and a generated local CLI all assemble them here.
 *
 * The dev server passes what only it has — the database it opened, its event
 * hub, content store, scheduler — and the gates it read off a live inspector.
 * A generated CLI runs with neither, so the gates are baked in at codegen, and
 * when the project has a local CLI entrypoint the file also opens the database
 * and builds the scheduler itself.
 *
 * What the file imports is decided here too, from what the project has, since
 * every one of those packages has to be declared by the project: a project with
 * no database imports nothing past `@pikku/core`.
 */
export const serializeLocalServices = ({
  localServicesFile,
  packageMappings,
  requiredServices,
  scopes,
  systemRoles,
  database,
  localCLI,
}: SerializeLocalServicesOptions): string => {
  const required = new Set(requiredServices)
  const gated = Object.fromEntries(
    GATED_SERVICES.map((name) => [name, required.has(name)])
  )
  const opens = database && !!localCLI
  const drivers = localCLI?.drivers
  // Only a driver the project declares opens anything, and an import nothing
  // uses fails a project that type-checks with noUnusedLocals.
  const coerces =
    opens &&
    !!localCLI?.coercionFile &&
    !!drivers &&
    (drivers.nodeSqlite || drivers.bunSqlite || drivers.pg || drivers.mysql)

  const imports: string[] = []
  if (localCLI) {
    imports.push(
      opens
        ? `import { mkdirSync } from 'node:fs'\nimport { dirname, resolve } from 'node:path'`
        : `import { dirname } from 'node:path'`,
      `import { fileURLToPath } from 'node:url'`
    )
  }
  if (database) {
    imports.push(
      opens && (drivers?.pg || drivers?.mysql)
        ? `import { CamelCasePlugin, Kysely${drivers?.mysql ? ', MysqlDialect' : ''}${drivers?.pg ? ', PostgresDialect' : ''} } from '@pikku/kysely'`
        : `import type { Kysely } from '@pikku/kysely'`
    )
  }
  imports.push(`import {
  IncomingWebhookService,
  InMemoryAgentRunStateService,
  InMemoryQueueService,
  InMemoryTriggerService,
  InMemoryTriggerSourceStore,
  InMemoryWorkflowService,
  LocalEmailService,
  QueueWebhookService,
} from '@pikku/core/services'`)
  if (localCLI) {
    imports.push(
      `import { LocalMetaService } from '@pikku/core/services/local-meta'`,
      `import { InMemorySchedulerService } from '@pikku/schedule'`
    )
  }
  imports.push(
    `import type { FlatScope } from '@pikku/core/scope'`,
    `import type { SystemRole } from '@pikku/core/role'`
  )
  if (database) {
    imports.push(`import {
  ${coerces ? 'createCoercionPlugin,\n  ' : ''}KyselyAgentRunService,
  KyselyAgentRunStateService,
  KyselyAgentStorageService,
  KyselyAnalyticsService,
  KyselyFeatureFlagStore,
  KyselyIncomingWebhookService,
  KyselyScopeService,
  KyselyTriggerSourceStore,
  KyselyWebhookService,
} from '@pikku/kysely'`)
  }
  if (coerces && localCLI?.coercionFile) {
    imports.push(
      `import { coercionMap } from '${getFileImportRelativePath(localServicesFile, localCLI.coercionFile, packageMappings)}'`
    )
  }

  const baked = database
    ? `type GatedService = ${GATED_SERVICES.map((name) => `'${name}'`).join(' | ')}

/** Which gated services the project required at the last codegen. */
const requiredServices: Record<GatedService, boolean> = ${json(gated)}

const declaredScopes: FlatScope[] = ${json(scopes)}

const declaredSystemRoles: SystemRole[] = ${json(systemRoles)}
`
    : ''

  return `/**
 * The services a locally run process of this app boots on top of its own
 * createSingletonServices. \`pikku serve\`, \`pikku dev\` and a generated local
 * CLI all take them from here, so a command run from the CLI sees what a
 * request to the dev server sees.
 *
 * What gates them is baked in from the last codegen, for a caller that has no
 * inspector to ask. Regenerate rather than edit.
 */
${imports.join('\n')}

${baked}
type WarnLogger = { warn(message: string): void }

const stderr: WarnLogger = { warn: (message) => console.error(message) }

export interface LocalServicesExtras {
  /**
   * A database the host has already opened, or \`null\` for none.${
     opens
       ? " Left out, one\n   * is opened from DATABASE_URL or the config's `sqliteDb` / `postgresUrl` / `mysqlUrl`."
       : ''
   }
   */
  kysely?: ${database ? 'Kysely<any>' : 'unknown'} | null
  /** Anything else the host provides, which wins over what is assembled here. */
  [service: string]: unknown
}

/** What a host that inspects the project live passes instead of the baked answers. */
export interface LocalServicesOptions {
  /** Where a service dropped for a missing table is reported. Stderr otherwise. */
  logger?: WarnLogger
  requiredServices?: ReadonlySet<string>
  scopes?: FlatScope[]
  systemRoles?: SystemRole[]
}

type DatabaseTarget = { sqliteDb?: string; postgresUrl?: string; mysqlUrl?: string }

${opens && localCLI ? databaseOpener(localCLI, coerces) : ''}
${database ? databaseBody(!!localCLI) : inMemoryBody(!!localCLI)}`
}
