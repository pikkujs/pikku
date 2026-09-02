import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { assertSnakeCaseIdentifiers } from './migration-identifiers.js'

/**
 * The migrator's own bookkeeping table, which belongs to no dialect and to no
 * project's schema.
 *
 * Every introspector hides it for that reason. Leaving it visible on one
 * dialect and not the other is not cosmetic: a schema source exported from a
 * database that has been migrated would publish `sql_migrations` as one of its
 * own tables, and the consumer — which also has it — would then read the source
 * as partially covered and emit column deltas instead of the source's own SQL,
 * silently dropping its primary keys, indexes and constraints.
 */
export const MIGRATION_TRACKING_TABLE = 'sql_migrations'

export class MigrationDriftError extends Error {
  constructor(
    public readonly file: string,
    public readonly recordedHash: string,
    public readonly currentHash: string | null,
    public readonly appliedAt: string,
    migrationsDir: string
  ) {
    const onDisk =
      currentHash === null
        ? 'file missing on disk'
        : `sha256:${currentHash.slice(0, 8)}…`
    super(
      `[PKU-DB-DRIFT] ${migrationsDir}/${file}\n\n` +
        `Migration content has changed since it was applied.\n` +
        `  recorded:  sha256:${recordedHash.slice(0, 8)}…  applied ${appliedAt}\n` +
        `  on disk:   ${onDisk}\n\n` +
        `If this edit was intentional, write a new forward migration to revert the change.\n` +
        `Production migrations are immutable.`
    )
    this.name = 'MigrationDriftError'
  }
}

export interface MigrateResult {
  applied: string[]
  skipped: string[]
}

export interface AppliedMigration {
  name: string
  hash: string
  applied_at: string
}

/**
 * Provider-agnostic migration executor. Implement this for each DB dialect.
 * Each method maps to a single DB operation; all file I/O and hashing lives
 * in the shared `migrate()` function above.
 */
export interface MigrationExecutor {
  ensureTrackingTable(): Promise<void>
  getApplied(): Promise<AppliedMigration[]>
  runMigration(sql: string, name: string, hash: string): Promise<void>
  /**
   * Record a migration as applied without running its SQL.
   *
   * For a database that already contains what the migration describes, because
   * something created those tables before anyone wrote them down. Only ever
   * called once the caller has confirmed that is actually true — recording a
   * migration whose tables are absent leaves a database permanently behind with
   * no pending migration to reveal it.
   */
  recordMigration(name: string, hash: string): Promise<void>
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Apply pending migrations from `migrationsDir/*.sql` using the supplied
 * executor. Hashes raw file bytes on apply; subsequent runs re-hash and bail
 * with `MigrationDriftError` if any applied file has changed on disk.
 */
/**
 * The migrations on disk, or none.
 *
 * A project that has never generated a migration has no directory to read, and
 * that is the ordinary first-run state rather than a failure — it is precisely
 * the project `db generate` exists to serve.
 */
const migrationFiles = (migrationsDir: string): string[] =>
  existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : []

/**
 * Re-hash every applied migration and bail if one has changed on disk.
 *
 * Applies to baselining as much as to migrating: recording a file as applied
 * only means anything if the file is still the one that was applied.
 */
function assertNoDrift(
  applied: AppliedMigration[],
  migrationsDir: string
): void {
  for (const row of applied) {
    let currentHash: string | null = null
    try {
      currentHash = sha256(readFileSync(join(migrationsDir, row.name)))
    } catch {
      currentHash = null
    }
    if (currentHash !== row.hash) {
      throw new MigrationDriftError(
        row.name,
        row.hash,
        currentHash,
        row.applied_at,
        migrationsDir
      )
    }
  }
}

/**
 * Every migration on disk, read once.
 *
 * The identifier check reads all of them and not just the pending ones, so that
 * whether a migration is rejected depends on the files alone. A camelCase
 * column that had already been applied somewhere would otherwise pass on that
 * machine and fail on a fresh checkout, which is the opposite of deterministic.
 */
const readMigrations = (
  migrationsDir: string
): Array<{ name: string; sql: string }> =>
  migrationFiles(migrationsDir).map((name) => ({
    name,
    sql: readFileSync(join(migrationsDir, name), 'utf8'),
  }))

export async function migrate(
  executor: MigrationExecutor,
  migrationsDir: string
): Promise<MigrateResult> {
  assertSnakeCaseIdentifiers(readMigrations(migrationsDir))
  await executor.ensureTrackingTable()
  const applied = await executor.getApplied()
  assertNoDrift(applied, migrationsDir)
  const appliedNames = new Set(applied.map((r) => r.name))

  const result: MigrateResult = { applied: [], skipped: [] }

  for (const name of migrationFiles(migrationsDir)) {
    if (appliedNames.has(name)) {
      result.skipped.push(name)
      continue
    }
    const raw = readFileSync(join(migrationsDir, name))
    const hash = sha256(raw)
    await executor.runMigration(raw.toString('utf8'), name, hash)
    result.applied.push(name)
  }

  return result
}

/**
 * Record every pending migration as applied, without running any of it.
 *
 * The escape hatch for a database that already has the tables a migration
 * creates — the shape you get when a runtime bootstrapped its own schema at
 * boot and the migration writing it down was authored afterwards. Running that
 * migration would fail on every existing deployment; skipping it forever would
 * leave the history lying. Recording it says what is true.
 *
 * Deliberately unconditional here. Whether the database really does match is a
 * question about schemas, not migration files, so the caller answers it first
 * and this only runs once it has.
 */
export async function baselineMigrations(
  executor: MigrationExecutor,
  migrationsDir: string
): Promise<string[]> {
  await executor.ensureTrackingTable()
  const applied = await executor.getApplied()
  assertNoDrift(applied, migrationsDir)

  const appliedNames = new Set(applied.map((r) => r.name))
  const recorded: string[] = []
  for (const name of migrationFiles(migrationsDir)) {
    if (appliedNames.has(name)) continue
    await executor.recordMigration(
      name,
      sha256(readFileSync(join(migrationsDir, name)))
    )
    recorded.push(name)
  }
  return recorded
}
