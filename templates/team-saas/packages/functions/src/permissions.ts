import { pikkuPermission } from '#pikku/auth'

/**
 * Tenancy.
 *
 * Every one of these answers the same question in a different shape: *does the
 * caller belong to the organisation that owns this row?* None of them can be a
 * scope, because a scope is a property of the caller and tenancy is a property
 * of the pair.
 *
 * They are written once, here, rather than inline in each function. A tenancy
 * check that is copied is a tenancy check that will eventually be copied
 * wrong — and the failure mode is one customer reading another's data, which is
 * not a bug report, it is a disclosure.
 */

/** The org-level roles, most privileged first. */
const ORG_ROLE_RANK = ['owner', 'admin', 'member', 'viewer'] as const
type OrgRole = (typeof ORG_ROLE_RANK)[number]

const atLeast = (held: string, required: OrgRole) => {
  // `held` is whatever the membership row holds, which is not necessarily a role
  // this code knows about — a row written by an older version, or by hand. An
  // unrecognised role ranks nowhere and is refused, rather than being treated as
  // rank 0 and quietly outranking everybody.
  const heldRank = ORG_ROLE_RANK.indexOf(held as OrgRole)
  return heldRank >= 0 && heldRank <= ORG_ROLE_RANK.indexOf(required)
}

// @snippet start permissionFunction
/**
 * Belongs to the organisation named in the input.
 *
 * Fails closed: an anonymous caller has no session, an unknown org has no
 * membership row, and both return false rather than throwing. A permission that
 * throws on a missing row leaks the difference between "not yours" and "does
 * not exist", which is how an id-enumeration probe finds real organisations.
 */
export const isOrgMember = pikkuPermission(
  async ({ kysely }, { orgId }: { orgId: string }, { session }) => {
    if (!session) return false
    const membership = await kysely
      .selectFrom('membership')
      .select('membershipId')
      .where('orgId', '=', orgId)
      .where('userId', '=', session.userId)
      .executeTakeFirst()
    return !!membership
  }
)

/** Belongs, *and* is at least an admin of that organisation. */
export const isOrgAdmin = pikkuPermission(
  async ({ kysely }, { orgId }: { orgId: string }, { session }) => {
    if (!session) return false
    const membership = await kysely
      .selectFrom('membership')
      .select('orgRole')
      .where('orgId', '=', orgId)
      .where('userId', '=', session.userId)
      .executeTakeFirst()
    return !!membership && atLeast(membership.orgRole, 'admin')
  }
)
// @snippet end permissionFunction

/**
 * Belongs to the organisation that owns this *issue*, which the caller named by
 * issue id rather than by org.
 *
 * Resolving the org from the row rather than trusting an `orgId` in the input
 * is the whole point: a caller who passes their own orgId alongside somebody
 * else's issueId would otherwise pass a naive membership check.
 */
export const canWriteIssue = pikkuPermission(
  async ({ kysely }, { issueId }: { issueId: string }, { session }) => {
    if (!session) return false
    const row = await kysely
      .selectFrom('issue')
      .innerJoin('membership', 'membership.orgId', 'issue.orgId')
      .select('membership.orgRole')
      .where('issue.issueId', '=', issueId)
      .where('membership.userId', '=', session.userId)
      .executeTakeFirst()
    return !!row && atLeast(row.orgRole, 'member')
  }
)
