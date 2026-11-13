import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Scopes, roles and the grants that bind them to users.
 *
 * `pikkuUserRole` and `pikkuUserScope` reference `user.id`, which Better Auth
 * owns. Auth is a prerequisite rather than an optional companion: a grant is
 * made to a user, so without the table the user lives in there is nothing to
 * grant to, and the cascade that revokes grants when a user is deleted has
 * nothing to hang off.
 *
 * `userId` takes its type from `user.id` rather than declaring one, because
 * that type is Better Auth's to decide: `text` by default, `uuid` under
 * `generateId: 'uuid'`, an identity `integer` under `'serial'`. The old
 * hand-written DDL said `text`, and postgres rejects a `text` column
 * referencing either of the others — so the whole statement failed and projects
 * wrote these tables by hand instead.
 */
export const scopeSchema: PikkuSchema = {
  name: 'scope',
  ownedBy: ['scopeService'],
  foreignOwner: 'Better Auth',
  tables: {
    pikkuScopes: {
      columns: {
        name: { type: 'key', primaryKey: true },
        description: { type: 'text' },
        declared: { type: 'boolean', required: true, default: true },
      },
    },
    pikkuRoles: {
      columns: {
        name: { type: 'key', primaryKey: true },
        description: { type: 'text' },
        // Declared in code with `defineSystemRole` rather than composed by an
        // admin. What it buys is the refusals: a system role cannot be renamed,
        // re-scoped or deleted from the console, and a console role cannot be
        // created with its name — two rows answering to one name would make
        // "does Susan hold `buyer`?" depend on which one the store returned.
        system: { type: 'boolean', required: true, default: false },
        // A system role whose declaration has gone: still held by whoever holds
        // it, no longer offered for new grants, awaiting `pikku roles prune`.
        // The same additive contract as `pikkuScopes.declared`, and for the same
        // reason — a mid-deploy revocation is not something a code edit should
        // be able to cause.
        declared: { type: 'boolean', required: true, default: true },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
    pikkuRoleScopes: {
      columns: {
        role: {
          type: 'key',
          required: true,
          references: 'pikkuRoles.name',
          onDelete: 'cascade',
        },
        scope: {
          type: 'key',
          required: true,
          references: 'pikkuScopes.name',
          onDelete: 'cascade',
        },
      },
      primaryKey: ['role', 'scope'],
      indexes: [{ name: 'pikku_role_scopes_scope_idx', columns: ['scope'] }],
    },
    pikkuUserRole: {
      columns: {
        userId: { required: true, references: 'user.id', onDelete: 'cascade' },
        role: {
          type: 'key',
          required: true,
          references: 'pikkuRoles.name',
          onDelete: 'cascade',
        },
        grantedBy: { type: 'text' },
        grantedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      primaryKey: ['userId', 'role'],
      indexes: [{ name: 'pikku_user_role_role_idx', columns: ['role'] }],
    },
    pikkuUserScope: {
      columns: {
        userId: { required: true, references: 'user.id', onDelete: 'cascade' },
        scope: {
          type: 'key',
          required: true,
          references: 'pikkuScopes.name',
          onDelete: 'cascade',
        },
        grantedBy: { type: 'text' },
        grantedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      primaryKey: ['userId', 'scope'],
    },
  },
}
