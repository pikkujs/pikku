import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Apply pending migrations from `migrationsDir/*.sql` using the supplied
 * executor. Hashes raw file bytes on apply; subsequent runs re-hash and bail
 * with `MigrationDriftError` if any applied file has changed on disk.
 */
export async function migrate(
  executor: MigrationExecutor,
  migrationsDir: string
): Promise<MigrateResult> {
  await executor.ensureTrackingTable()
  const applied = await executor.getApplied()

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

  const appliedSet = new Set(applied.map((r) => r.name))
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const result: MigrateResult = { applied: [], skipped: [] }

  for (const name of files) {
    if (appliedSet.has(name)) {
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
