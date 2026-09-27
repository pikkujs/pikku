/**
 * The platform's own principal, created by `credentialOAuth()` to own
 * singleton credentials. It is never signed into and it is not a person.
 */
export const PLATFORM_USER_ID = 'pikku-platform'

/**
 * Columns a synthetic principal is stamped with on the way in: `actor` by the
 * scenario actor plugin, `fabric` by the Fabric operator plugin. A host that
 * wires neither has neither column, which is why they are looked up in the
 * schema before they are queried rather than assumed.
 *
 * The two are disjoint by construction — each plugin stamps only its own row
 * at creation — which is what lets a count subtract them without double
 * counting, and what lets them be gathered one marker at a time.
 */
export const SYNTHETIC_MARKERS = ['actor', 'fabric'] as const

/**
 * Synthetic principals — the platform credential owner, fabric service users
 * and agent actors — are not people, so they never belong in a directory a
 * human picks from.
 */
export const isPerson = (row: any) =>
  row.fabric !== true && row.actor !== true && row.id !== PLATFORM_USER_ID
