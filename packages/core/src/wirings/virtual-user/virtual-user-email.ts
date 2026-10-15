/**
 * A virtual user's email address is computed, never declared.
 *
 * A virtual user that cannot read its own email cannot complete sign-up, magic
 * links, invites or password resets — which are most of the flows worth
 * exercising. So addresses are real and deliverable against a domain the stage
 * actually receives mail on, rather than a synthetic `.local` dead end.
 */

const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Lower-cases and strips a virtual user id down to something an address can carry.
 *
 * Virtual users are declared as object keys, so they are already identifier-shaped;
 * this exists for the ones that are not (`'susan.buyer'`, `'Susan_2'`) rather
 * than to permit arbitrary input.
 */
export const virtualUserEmailLabel = (virtualUserId: string): string => {
  const label = virtualUserId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!LABEL.test(label)) {
    throw new Error(
      `VirtualUser '${virtualUserId}' has no usable email label. A virtual user id must contain at least one letter or digit.`
    )
  }
  return label
}

/**
 * The address a virtual user reads mail at during a run.
 *
 * The `runId` suffix is not decoration. Without it two concurrent runs share an
 * inbox *and* a user row, and run B reads run A's magic link. Sub-addressing
 * also buys isolation for free: a different address is a different account in
 * the app, so two runs cannot collide on sign-up either.
 *
 * Omitting `runId` gives the bare form, which is what a seeded fixture that has
 * to stay stable across runs wants.
 */
export const virtualUserEmail = (
  virtualUserId: string,
  domain: string,
  runId?: string
): string => {
  const label = virtualUserEmailLabel(virtualUserId)
  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '')
  if (!cleanDomain || cleanDomain.includes('@') || !cleanDomain.includes('.')) {
    throw new Error(
      `VirtualUser email domain '${domain}' is not a domain. Set it to a domain the stage actually receives mail on.`
    )
  }
  const suffix = runId ? `+${virtualUserEmailLabel(runId)}` : ''
  return `${label}${suffix}@${cleanDomain}`
}

/**
 * Every address in a run, keyed by virtual user.
 *
 * All of a virtual user's logins share one address. That is not a simplification:
 * better-auth keeps `email` on the `user` and defaults `allowDifferentEmails`
 * to false, so giving a linked account its own address would have the library
 * under test refuse to link the very thing the virtual user declared as linked.
 */
export const virtualUserEmails = (
  virtualUserIds: readonly string[],
  domain: string,
  runId?: string
): Record<string, string> => {
  const emails: Record<string, string> = {}
  const seen = new Map<string, string>()
  for (const id of virtualUserIds) {
    const address = virtualUserEmail(id, domain, runId)
    const collidesWith = seen.get(address)
    if (collidesWith !== undefined) {
      throw new Error(
        `VirtualUsers '${collidesWith}' and '${id}' both compute the address ${address}. ` +
          `They would share a user row and read each other's email.`
      )
    }
    seen.set(address, id)
    emails[id] = address
  }
  return emails
}
