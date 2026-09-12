import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Feature flags and their per-subject overrides.
 *
 * Two tables and not one because the two halves have different cardinality: a
 * flag is one row an operator flips, an override is an unbounded set keyed by
 * organization or user. Folding the overrides into a JSON column on the flag
 * would make granting one tenant early access a read-modify-write of a blob two
 * consoles can race on.
 *
 * Nothing here references `user` or any organization table. A subject id is
 * stored as opaque text on purpose: pikku does not own the organization
 * concept, and a foreign key would make flags require a table shape that only
 * some projects have.
 */
export const flagSchema: PikkuSchema = {
  name: 'flag',
  ownedBy: ['featureFlags'],
  statements: [
    (db) =>
      db.schema
        .createTable('pikkuFeatureFlags')
        .addColumn('name', 'text', (col) => col.primaryKey())
        .addColumn('description', 'text')
        // The declared `anyOf` scope list, as JSON. Read by the console to say
        // who would see the feature; never read on the request path, where the
        // capability half comes from the session's own scopes.
        .addColumn('anyOf', 'text')
        // Off until somebody turns it on. A flag exists so a feature can ship
        // dark, so the row a deploy creates has to start closed — the opposite
        // default would make merging the declaration the moment of launch.
        .addColumn('enabled', 'boolean', (col) =>
          col.defaultTo(false).notNull()
        )
        // 0-100, or null for no rollout constraint. Null and 100 are not the
        // same statement: null says the percentage is not part of this flag's
        // story, 100 says a rollout reached everyone and could be wound back.
        .addColumn('rolloutPercent', 'integer')
        // False once the declaration has gone from code: still switchable, no
        // longer offered, awaiting `pikku flags prune`. The same additive
        // contract as `pikkuScopes.declared`.
        .addColumn('declared', 'boolean', (col) =>
          col.defaultTo(true).notNull()
        )
        .addColumn('updatedBy', 'text')
        // Why it was flipped. A kill switch is pulled during an incident, and
        // the one question afterwards is always who turned it off and why.
        .addColumn('note', 'text')
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createTable('pikkuFeatureFlagOverrides')
        .addColumn('flag', 'text', (col) =>
          col.notNull().references('pikkuFeatureFlags.name').onDelete('cascade')
        )
        .addColumn('subjectId', 'text', (col) => col.notNull())
        // Which id this is, for the console to render. Resolution keys on the
        // id alone, because that is all the resolver has: it prefers the
        // organization and falls back to the user, and by then the two are one
        // string.
        .addColumn('subjectKind', 'text', (col) => col.notNull())
        .addColumn('enabled', 'boolean', (col) => col.notNull())
        .addColumn('grantedBy', 'text')
        .addColumn('grantedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('pikku_feature_flag_overrides_pk', [
          'flag',
          'subjectId',
        ]),
  ],
}
