import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Scopes, roles and the grants that bind them to users.
 *
 * `pikkuUserRole` and `pikkuUserScope` reference `user.id`, which Better Auth
 * owns — so this schema only applies after the auth one, and the composed order
 * in `pikkuSchemas` is load-bearing rather than alphabetical.
 */
export const scopeSchema: PikkuSchema = {
  name: 'scope',
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

    (db) =>
      db.schema
        .createTable('pikkuUserRole')
        .addColumn('userId', 'text', (col) =>
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

    (db) =>
      db.schema
        .createTable('pikkuUserScope')
        .addColumn('userId', 'text', (col) =>
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
