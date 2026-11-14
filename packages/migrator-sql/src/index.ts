/**
 * The SQL migration applier, and nothing that knows where it is running.
 *
 * Two programs apply the same migrations to the same database: `pikku db
 * migrate` from a checkout, and a shipped standalone bundle from a machine that
 * has no checkout. They have to agree on the bookkeeping table, the hash, and
 * the file order, because the second runs against a database the first has
 * already written to — a second implementation that differs in any of the three
 * reports every migration the other applied as drifted.
 */
export {
  migrate,
  baselineMigrations,
  pendingMigrations,
  MigrationDriftError,
  MigrationFailedError,
  MigrationDestructiveError,
  DESTRUCTIVE_MIGRATION_MARKER,
  destructiveReasons,
  pendingDestructive,
  type DestructiveMigration,
  type MigrateOptions,
  MIGRATION_TRACKING_TABLE,
  type MigrationExecutor,
  type MigrateResult,
  type AppliedMigration,
} from './sql-migrator.js'

export {
  assertSnakeCaseIdentifiers,
  findCamelCaseIdentifiers,
  stripSqlComments,
  CamelCaseIdentifierError,
  type CamelCaseIdentifier,
} from './migration-identifiers.js'

export {
  splitStatements,
  bareTableName,
  tableCreationSql,
  tablesInSourceOrder,
  statementShape,
  tableDefinitions,
  splitTopLevel,
  createTableBody,
  type StatementShape,
  type TableDefinitions,
} from './schema-sql.js'

export {
  CHECK_PROBE_TIMEOUT_MS,
  CHECK_PROBE_MAX_ROWS,
  CHECK_PROBE_MARKER,
  CheckProbeError,
  checkProbeHook,
  checkProbeLine,
  mysqlProbeExecutor,
  postgresProbeExecutor,
  probesIn,
  runCheckProbe,
  rowEstimateSql,
  boundedCountSql,
  type CheckProbe,
  type CheckProbeDialect,
  type CheckProbeOptions,
  type CheckProbeResult,
  type ProbeExecutor,
} from './check-probe.js'
