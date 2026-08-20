import { sql } from 'kysely'
import { requiredType, type PikkuSchema } from './pikku-schema.types.js'

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
  requires: [{ table: 'user', column: 'id', owner: 'Better Auth' }],
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuScopes')
        .addColumn('name', 'text', (col) => col.primaryKey())
        .addColumn('description', 'text')
        .addColumn('declared', 'boolean', (col) =>
          col.defaultTo(true).notNull()
        ),

    (db) =>
      db.schema
        .createTable('pikkuRoles')
        .addColumn('name', 'text', (col) => col.primaryKey())
        .addColumn('description', 'text')
        // Declared in code with `defineSystemRole` rather than composed by an
        // admin. What it buys is the refusals: a system role cannot be renamed,
        // re-scoped or deleted from the console, and a console role cannot be
        // created with its name — two rows answering to one name would make
        // "does Susan hold `buyer`?" depend on which one the store returned.
        .addColumn('system', 'boolean', (col) => col.defaultTo(false).notNull())
        // A system role whose declaration has gone: still held by whoever holds
        // it, no longer offered for new grants, awaiting `pikku roles prune`.
        // The same additive contract as `pikkuScopes.declared`, and for the same
        // reason — a mid-deploy revocation is not something a code edit should
        // be able to cause.
        .addColumn('declared', 'boolean', (col) =>
          col.defaultTo(true).notNull()
        )
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('pikkuRoleScopes')
        .addColumn('role', 'text', (col) =>
          col.notNull().references('pikkuRoles.name').onDelete('cascade')
        )
        .addColumn('scope', 'text', (col) =>
          col.notNull().references('pikkuScopes.name').onDelete('cascade')
        )
        .addPrimaryKeyConstraint('pikku_role_scopes_pk', ['role', 'scope']),

    (db, types) =>
      db.schema
        .createTable('pikkuUserRole')
        .addColumn('userId', requiredType(types, 'user', 'id'), (col) =>
          col.notNull().references('user.id').onDelete('cascade')
        )
        .addColumn('role', 'text', (col) =>
          col.notNull().references('pikkuRoles.name').onDelete('cascade')
        )
        .addColumn('grantedBy', 'text')
        .addColumn('grantedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('pikku_user_role_pk', ['userId', 'role']),

    (db, types) =>
      db.schema
        .createTable('pikkuUserScope')
        .addColumn('userId', requiredType(types, 'user', 'id'), (col) =>
          col.notNull().references('user.id').onDelete('cascade')
        )
        .addColumn('scope', 'text', (col) =>
          col.notNull().references('pikkuScopes.name').onDelete('cascade')
        )
        .addColumn('grantedBy', 'text')
        .addColumn('grantedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('pikku_user_scope_pk', ['userId', 'scope']),

    (db) =>
      db.schema
        .createIndex('pikku_role_scopes_scope_idx')
        .on('pikkuRoleScopes')
        .column('scope'),

    (db) =>
      db.schema
        .createIndex('pikku_user_role_role_idx')
        .on('pikkuUserRole')
        .column('role'),
  ],
}
