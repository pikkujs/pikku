/**
 * The platform's own principal, created by `credentialOAuth()` to own
 * singleton credentials. It is never signed into and it is not a person.
 */
export const PLATFORM_USER_ID = 'pikku-platform'

/**
 * The column a synthetic principal is stamped with on the way in: `actor` by
 * the scenario actor plugin. A host that does not wire it has no such column,
 * which is why it is looked up in the schema before it is queried rather than
 * assumed.
 */
export const SYNTHETIC_MARKERS = ['actor'] as const

/**
 * Service accounts created by a host's own sign-in route use an address on the
 * reserved `.internal` top level, which no person can receive mail on.
 */
export const SYNTHETIC_EMAIL_SUFFIX = '.internal'

/**
 * Synthetic principals — the platform credential owner, operator service users
 * and agent actors — are not people, so they never belong in a directory a
 * human picks from.
 */
export const isPerson = (row: any) =>
  row.actor !== true &&
  row.id !== PLATFORM_USER_ID &&
  !String(row.email ?? '').endsWith(SYNTHETIC_EMAIL_SUFFIX)
