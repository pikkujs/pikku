import { sql } from 'kysely'
import {
  ENVELOPE_CIPHERTEXT,
  rawStatement,
  type PikkuSchema,
} from './pikku-schema.types.js'

/**
 * Encrypted per-user credentials and their audit trail.
 *
 * The uniqueness rule is an expression index — `user_id` is nullable and two
 * rows with a null user must still collide on name — which the schema builder
 * cannot express, so it stays raw. Raw SQL is not rewritten by `withSchema`,
 * which is why the table goes through `ctx.table` rather than being left to the
 * search path. The index's own name stays unqualified: an index belongs to the
 * schema of the table it is on, and postgres rejects one that says otherwise.
 */
export const credentialSchema: PikkuSchema = {
  name: 'credential',
  ownedBy: ['credentialService'],
  tables: {
    credentials: {
      columns: {
        name: { type: 'string(255)', required: true },
        userId: { type: 'string(255)' },
        ciphertext: {
          type: 'text',
          required: true,
          ...ENVELOPE_CIPHERTEXT,
        },
        wrappedDek: {
          type: 'text',
          required: true,
          ...ENVELOPE_CIPHERTEXT,
        },
        keyVersion: { type: 'integer', required: true },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
    credentialKekSalts: {
      columns: {
        keyVersion: { type: 'integer', primaryKey: true },
        salt: { type: 'string(64)', required: true },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
    credentialsAudit: {
      columns: {
        id: { type: 'string(36)', primaryKey: true },
        credentialName: { type: 'string(255)', required: true },
        userId: { type: 'string(255)' },
        action: { type: 'string(20)', required: true },
        performedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
  },
  extraStatements: [
    rawStatement(
      ({ table, mysql }) =>
        sql`CREATE UNIQUE INDEX credentials_name_user_id_unique ON ${table('credentials')} (name, ${mysql ? sql`(COALESCE(user_id, ''))` : sql`COALESCE(user_id, '')`})`
    ),
  ],
}
