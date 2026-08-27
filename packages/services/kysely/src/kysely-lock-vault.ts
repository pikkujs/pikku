import type { Kysely } from 'kysely'
import type { LockRecord, LockVault } from '@pikku/core/classification'
import { unsafeAsWrapped } from '@pikku/core/classification'
import type { KyselyPikkuDB } from './kysely-tables.js'

/**
 * Lock records kept in the application's own database.
 *
 * This is what makes a sealed column survive a restart. `createMemoryLockVault`
 * is fine for a test, but its salts die with the process and a sealed row whose
 * salt is gone is not recoverable by anyone — so a real deployment stores them
 * next to the rows they protect, in the same backup and the same restore.
 *
 * The table holds no plaintext key material, only salts and verifiers, which is
 * why it is readable while the store is locked.
 */
export class KyselyLockVault implements LockVault {
  constructor(private readonly db: Kysely<KyselyPikkuDB>) {}

  async read(): Promise<LockRecord[]> {
    try {
      const rows = await this.db
        .selectFrom('dataLocks')
        .select(['keyId', 'keyVersion', 'salt', 'verifier'])
        .execute()

      return rows.map((row) => ({
        keyId: row.keyId,
        // SQLite hands back whatever it stored and postgres can widen an
        // integer to a string over the wire, while `keyVersion` is compared
        // and stamped as a number.
        keyVersion: Number(row.keyVersion),
        salt: row.salt,
        verifier: unsafeAsWrapped(row.verifier),
      }))
    } catch (cause) {
      if (await this.tableExists()) {
        throw cause
      }
      // No table yet is a legitimate first run — the migration has not been
      // applied, nobody has chosen a passphrase, and the server should come up
      // and offer to initialize rather than refuse to start.
      return []
    }
  }

  /**
   * Replace the whole record set.
   *
   * Whole-set rather than per-row because the callers that write are
   * initialization and rotation, and both produce a complete keyring: applying
   * one as a partial update would leave records from the previous key behind,
   * and a stale salt is indistinguishable from a current one.
   */
  async write(records: LockRecord[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('dataLocks').execute()
      if (records.length) {
        await trx
          .insertInto('dataLocks')
          .values(
            records.map((record) => ({
              keyId: record.keyId,
              keyVersion: record.keyVersion,
              salt: record.salt,
              verifier: record.verifier as string,
            }))
          )
          .execute()
      }
    })
  }

  /**
   * Asked through introspection rather than by matching the driver's error
   * text, so the answer does not depend on which engine phrased the failure or
   * on the language it phrased it in.
   */
  private async tableExists(): Promise<boolean> {
    const tables = await this.db.introspection.getTables()
    return tables.some((table) => table.name === 'data_locks')
  }
}
