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
  tables: {
    pikkuFeatureFlags: {
      columns: {
        name: { type: 'key', primaryKey: true },
        description: { type: 'text' },
        // The declared `anyOf` scope list, as JSON. Read by the console to say
        // who would see the feature; never read on the request path, where the
        // capability half comes from the session's own scopes.
        anyOf: { type: 'text' },
        // Off until somebody turns it on. A flag exists so a feature can ship
        // dark, so the row a deploy creates has to start closed — the opposite
        // default would make merging the declaration the moment of launch.
        enabled: { type: 'boolean', required: true, default: false },
        // 0-100, or null for no rollout constraint. Null and 100 are not the
        // same statement: null says the percentage is not part of this flag's
        // story, 100 says a rollout reached everyone and could be wound back.
        rolloutPercent: { type: 'integer' },
        // False once the declaration has gone from code: still switchable, no
        // longer offered, awaiting `admin:flagPrune`. The same additive
        // contract as `pikkuScopes.declared`.
        declared: { type: 'boolean', required: true, default: true },
        updatedBy: { type: 'text' },
        // Why it was flipped. A kill switch is pulled during an incident, and
        // the one question afterwards is always who turned it off and why.
        note: { type: 'text' },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
    },
    pikkuFeatureFlagOverrides: {
      columns: {
        flag: {
          type: 'key',
          required: true,
          references: 'pikkuFeatureFlags.name',
          onDelete: 'cascade',
        },
        subjectId: { type: 'key', required: true },
        // Which id this is, for the console to render. Resolution keys on the
        // id alone, because that is all the resolver has: it prefers the
        // organization and falls back to the user, and by then the two are one
        // string.
        subjectKind: { type: 'text', required: true },
        enabled: { type: 'boolean', required: true },
        grantedBy: { type: 'text' },
        grantedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      primaryKey: ['flag', 'subjectId'],
    },
  },
}
