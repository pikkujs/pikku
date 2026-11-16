import { ENVELOPE_CIPHERTEXT, type PikkuSchema } from './pikku-schema.types.js'

/**
 * Encrypted secrets and their audit trail.
 *
 * The audit table is declared unconditionally, where `init()` created it only
 * when the service was constructed with auditing on. A migration cannot depend
 * on runtime configuration, and the asymmetry favours declaring it: an unused
 * table costs nothing, while turning auditing on against a database that never
 * got the table fails on the first write.
 */
export const secretSchema: PikkuSchema = {
  name: 'secret',
  tables: {
    secrets: {
      columns: {
        key: { type: 'string(255)', primaryKey: true },
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
    secretKekSalts: {
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
    secretsAudit: {
      columns: {
        id: { type: 'string(36)', primaryKey: true },
        secretKey: { type: 'string(255)', required: true },
        action: { type: 'string(20)', required: true },
        performedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
  },
}
