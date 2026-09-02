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
  MigrationDriftError,
  MIGRATION_TRACKING_TABLE,
  type MigrationExecutor,
  type MigrateResult,
  type AppliedMigration,
} from './db-migrator.js'

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
} from './schema-sql.js'
