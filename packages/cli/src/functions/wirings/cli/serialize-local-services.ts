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
}

export interface SerializeLocalServicesOptions {
  localServicesFile: string
  packageMappings: Record<string, string>
  /** The generated coercion map, when the project has run a migration. */
  coercionFile?: string
  /** The services the project's functions reach for, as the inspector found them. */
  requiredServices: Iterable<string>
  scopes: FlatScope[]
  systemRoles: SystemRole[]
  /**
   * The sqlite file a project with `db/sqlite` and no configured database runs
   * against — the same default `pikku serve` resolves.
   */
  conventionalSqliteDb?: string
  drivers: LocalServicesDrivers
}

/**
 * The services gated on `requiredServices`, and only those: the set is baked
 * in because nothing inspects the project when a generated CLI runs.
 */
const GATED_SERVICES = [
  'scopeService',
  'webhookService',
  'incomingWebhookService',
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

/**
 * Serializes `pikku-local-services.gen.ts`: the services a locally run
 * process of this app boots on top of its own `createSingletonServices`,
 * assembled the way `pikku serve` assembles them.
 *
 * `pikku serve` reads what gates them — `requiredServices`, the scope and
 * system-role declarations — off the inspector as it starts. A generated CLI
 * runs with no inspector, so those answers are baked in here at codegen time,
 * and the database it would otherwise be handed is opened here too.
 */
export const serializeLocalServices = ({
  localServicesFile,
  packageMappings,
  coercionFile,
  requiredServices,
  scopes,
  systemRoles,
  conventionalSqliteDb,
  drivers,
}: SerializeLocalServicesOptions): string => {
  const required = new Set(requiredServices)
  const gated = Object.fromEntries(
    GATED_SERVICES.map((name) => [name, required.has(name)])
  )
  // Only a driver the project declares opens anything, and an import nothing
  // uses fails a project that type-checks with noUnusedLocals.
  const coerces =
    !!coercionFile && (drivers.nodeSqlite || drivers.bunSqlite || drivers.pg)
  const coercionImport =
    coerces && coercionFile
      ? `import { coercionMap } from '${getFileImportRelativePath(localServicesFile, coercionFile, packageMappings)}'`
      : ''
  const coercionPlugins = coerces
    ? '[createCoercionPlugin({ map: coercionMap })]'
    : '[]'
  const kyselyImport = drivers.pg
    ? `import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely'`
    : `import type { Kysely } from 'kysely'`

  return `/**
 * The services a locally run process of this app boots on top of its own
 * createSingletonServices — the same set \`pikku serve\` injects, so a command
 * run from the generated CLI sees the database, scopes, webhooks and in-memory
 * queue, scheduler and workflow services a request to the dev server sees.
 *
 * What gates them is baked in from the last codegen, since nothing inspects the
 * project when this runs. Regenerate rather than edit.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
${kyselyImport}
import {
  IncomingWebhookService,
  InMemoryAgentRunStateService,
  InMemoryQueueService,
  InMemoryTriggerService,
  InMemoryWorkflowService,
  LocalEmailService,
  QueueWebhookService,
} from '@pikku/core/services'
import { LocalMetaService } from '@pikku/core/services/local-meta'
import type { FlatScope } from '@pikku/core/scope'
import type { SystemRole } from '@pikku/core/role'
import { InMemorySchedulerService } from '@pikku/schedule'
import {
  ${coerces ? 'createCoercionPlugin,\n  ' : ''}KyselyAgentRunService,
  KyselyAgentRunStateService,
  KyselyAgentStorageService,
  KyselyAnalyticsService,
  KyselyFeatureFlagStore,
  KyselyIncomingWebhookService,
  KyselyScopeService,
  KyselyWebhookService,
} from '@pikku/kysely'
${coercionImport}

const requiredServices = ${json(gated)}

const declaredScopes: FlatScope[] = ${json(scopes)}

const declaredSystemRoles: SystemRole[] = ${json(systemRoles)}

const conventionalSqliteDb: string | undefined = ${conventionalSqliteDb ? `'${conventionalSqliteDb}'` : 'undefined'}

export interface LocalServicesExtras {
  /**
   * A database the host has already opened, or \`null\` for none. Left out, one
   * is opened from DATABASE_URL or the config's \`sqliteDb\` / \`postgresUrl\`.
   */
  kysely?: Kysely<any> | null
  /** Where a service dropped for a missing table is reported. Stderr otherwise. */
  logger?: { warn(message: string): void }
  /** Anything else the host provides, which wins over what is assembled here. */
  [service: string]: unknown
}

type DatabaseTarget = { sqliteDb?: string; postgresUrl?: string }

/** DATABASE_URL read the way \`pikku serve\` reads it. A remote libsql URL is not opened here. */
const parseDatabaseUrl = (url: string): DatabaseTarget => {
  if (/^postgres(ql)?:\\/\\//.test(url)) return { postgresUrl: url }
  if (/^(libsql|https?):\\/\\//.test(url)) return {}
  return { sqliteDb: url }
}

${sqliteOpener(drivers, coercionPlugins)}

${postgresOpener(drivers, coercionPlugins)}

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
  if (target.postgresUrl && target.sqliteDb) {
    throw new Error(
      'Both postgresUrl and sqliteDb are set. Configure exactly one database dialect.'
    )
  }
  if (target.postgresUrl) {
    return openPostgres(target.postgresUrl)
  }
  const sqliteDb = target.sqliteDb ?? conventionalSqliteDb
  if (sqliteDb) {
    return openSqlite(resolve(process.cwd(), sqliteDb))
  }
  return undefined
}

/**
 * Brings a database-backed service up, or drops it with the reason: its table
 * comes from a declaration the project may have added since it last migrated,
 * and running without it degrades to what the project had before.
 */
const initOrWarn = async <T extends { init(): Promise<void> }>(
  service: T,
  name: string,
  logger: { warn(message: string): void }
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
  config: DatabaseTarget,
  extras: LocalServicesExtras = {}
): Promise<Record<string, any>> => {
  const { kysely: hostKysely, logger, ...hostServices } = extras
  const warnLogger = logger ?? { warn: (message: string) => console.error(message) }
  const kysely =
    hostKysely === undefined
      ? await openLocalDatabase(config)
      : (hostKysely ?? undefined)

  const agentStorage = kysely ? new KyselyAgentStorageService(kysely) : undefined
  const agentRunState = kysely
    ? new KyselyAgentRunStateService(kysely)
    : new InMemoryAgentRunStateService()
  const agentRunService = kysely ? new KyselyAgentRunService(kysely) : undefined
  if (agentStorage) await agentStorage.init()
  if ('init' in agentRunState && typeof agentRunState.init === 'function') {
    await agentRunState.init()
  }

  const featureFlags = kysely
    ? await initOrWarn(new KyselyFeatureFlagStore(kysely), 'featureFlags', warnLogger)
    : undefined
  const analyticsService = kysely
    ? await initOrWarn(new KyselyAnalyticsService(kysely), 'analyticsService', warnLogger)
    : undefined

  const scopeService =
    kysely && requiredServices.scopeService
      ? new KyselyScopeService(kysely)
      : undefined
  if (scopeService) {
    await scopeService.init()
    await scopeService.syncScopes(declaredScopes)
    await scopeService.syncSystemRoles(declaredSystemRoles)
  }

  const queueService = new InMemoryQueueService()
  const webhookService =
    kysely && requiredServices.webhookService
      ? new KyselyWebhookService(queueService, kysely)
      : new QueueWebhookService(queueService)
  if (webhookService instanceof KyselyWebhookService) {
    await webhookService.init()
  }
  const incomingWebhookService =
    kysely && requiredServices.incomingWebhookService
      ? new KyselyIncomingWebhookService(queueService, kysely)
      : new IncomingWebhookService(queueService)
  if (incomingWebhookService instanceof KyselyIncomingWebhookService) {
    await incomingWebhookService.init()
  }

  const workflowService = new InMemoryWorkflowService()

  return {
    emailService: new LocalEmailService(),
    metaService: new LocalMetaService(dirname(fileURLToPath(import.meta.url))),
    schedulerService: new InMemorySchedulerService(),
    queueService,
    webhookService,
    incomingWebhookService,
    ...(scopeService ? { scopeService } : {}),
    workflowService,
    workflowRunService: workflowService,
    triggerService: new InMemoryTriggerService(),
    agentStorage,
    agentRunState,
    agentRunService,
    ...(featureFlags ? { featureFlags } : {}),
    ...(analyticsService ? { analyticsService } : {}),
    ...(kysely ? { kysely } : {}),
    ...(logger ? { logger } : {}),
    ...hostServices,
  }
}
`
}
