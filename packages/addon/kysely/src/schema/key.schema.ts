import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * The ledger `KyselyKeyStore` keeps for `defineKeyPair` names: one row per key
 * version, public half and custody only.
 *
 * Gated on `keyService`, the one name the key service is registered under and
 * the one a function destructures. `keyStore` is internal to the key service,
 * so no function ever names it and it could never match.
 *
 * Two invariants are stored once, in a form every dialect has, instead of as
 * partial unique indexes (MySQL has none): `activeSlot` and `pendingSlot` are 1
 * while the row is `active` / `pending` and null otherwise, and a plain unique
 * index over `(name, scopeKey, <slot>)` allows one of each per name and scope
 * (NULLs are distinct on SQLite, Postgres and MySQL). There are no CHECK
 * constraints: the table DSL has none. The tie between `status`, the slots and
 * `retiredAt` is kept by the store, whose single `setStatus` path writes all
 * three together.
 *
 * `purpose`, `algorithm` and `custody` are free text, so a host may store
 * `wrapping` / `hkdf-sha256` / `derived` rows. `rev` is the compare-and-set
 * token for `updateCustody`; comparing `metadata` itself would fail spuriously
 * because `json` is `jsonb` on Postgres and text elsewhere. Timestamps are ISO
 * 8601 text, as the store's contract spells them.
 */
export const keySchema: PikkuSchema = {
  name: 'key',
  ownedBy: ['keyService'],
  tables: {
    pikkuKey: {
      columns: {
        kid: { type: 'key', primaryKey: true },
        name: { type: 'key', required: true },
        scopeKey: { type: 'key', required: true },
        version: { type: 'integer', required: true },
        algorithm: { type: 'text', required: true },
        purpose: { type: 'text', required: true },
        publicKey: { type: 'text' },
        status: { type: 'text', required: true },
        createdAt: { type: 'text', required: true },
        activatedAt: { type: 'text' },
        publishedAt: { type: 'text' },
        verifyUntil: { type: 'text' },
        retiredAt: { type: 'text' },
        custody: { type: 'text', required: true },
        privateRef: { type: 'text' },
        privateWrapped: {
          type: 'text',
          security: 'secret',
          form: 'plain',
          description:
            "Ciphertext a host's PrivateKeyWrapper produced (custody `wrapped`). The column plugin must not wrap it again; never written with a plain private half.",
        },
        metadata: { type: 'json' },
        rev: { type: 'integer', required: true, default: 0 },
        activeSlot: { type: 'integer' },
        pendingSlot: { type: 'integer' },
      },
      unique: [
        ['name', 'scopeKey', 'version'],
        {
          name: 'pikku_key_active_slot_key',
          columns: ['name', 'scopeKey', 'activeSlot'],
        },
        {
          name: 'pikku_key_pending_slot_key',
          columns: ['name', 'scopeKey', 'pendingSlot'],
        },
      ],
    },
  },
}
