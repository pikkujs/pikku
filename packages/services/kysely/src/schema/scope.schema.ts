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
    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuScopes')
        .addColumn('name', ctx.key, (col) => col.primaryKey())
        .addColumn('description', ctx.text)
        .addColumn('declared', 'boolean', (col) =>
          col.defaultTo(true).notNull()
        ),

    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuRoles')
        .addColumn('name', ctx.key, (col) => col.primaryKey())
        .addColumn('description', ctx.text)
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

    (db, _types, ctx) =>
      db.schema
        .createTable('pikkuRoleScopes')
        .addColumn('role', ctx.key, (col) =>
          ctx.references(col.notNull(), 'pikkuRoles.name')
        )
        .addColumn('scope', ctx.key, (col) =>
          ctx.references(col.notNull(), 'pikkuScopes.name')
        )
        .addPrimaryKeyConstraint('pikku_role_scopes_pk', ['role', 'scope'])
        .$call(
          ctx.foreignKeys('pikkuRoleScopes', {
            role: 'pikkuRoles.name',
            scope: 'pikkuScopes.name',
          })
        ),

    (db, types, ctx) =>
      db.schema
        .createTable('pikkuUserRole')
        .addColumn('userId', requiredType(types, 'user', 'id'), (col) =>
          ctx.references(col.notNull(), 'user.id')
        )
        .addColumn('role', ctx.key, (col) =>
          ctx.references(col.notNull(), 'pikkuRoles.name')
        )
        .addColumn('grantedBy', ctx.text)
        .addColumn('grantedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('pikku_user_role_pk', ['userId', 'role'])
        .$call(
          ctx.foreignKeys('pikkuUserRole', {
            userId: 'user.id',
            role: 'pikkuRoles.name',
          })
        ),

    (db, types, ctx) =>
      db.schema
        .createTable('pikkuUserScope')
        .addColumn('userId', requiredType(types, 'user', 'id'), (col) =>
          ctx.references(col.notNull(), 'user.id')
        )
        .addColumn('scope', ctx.key, (col) =>
          ctx.references(col.notNull(), 'pikkuScopes.name')
        )
        .addColumn('grantedBy', ctx.text)
        .addColumn('grantedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('pikku_user_scope_pk', ['userId', 'scope'])
        .$call(
          ctx.foreignKeys('pikkuUserScope', {
            userId: 'user.id',
            scope: 'pikkuScopes.name',
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('pikku_role_scopes_scope_idx')
        .on('pikkuRoleScopes')
        .column('scope'),

    (db, _types, ctx) =>
      db.schema
        .createIndex('pikku_user_role_role_idx')
        .on('pikkuUserRole')
        .column('role'),
  ],
}
