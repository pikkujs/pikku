import type { CoreUserSession } from '@pikku/core/types'

/**
 * The session a `mapSession`-less registration produces.
 *
 * `orgId` comes from the organization plugin's `activeOrganizationId`, which
 * the plugin already keeps on the session row. It is a reserved field on
 * {@link CoreUserSession}, so without this every app running the plugin hand
 * -wrote a `mapSession` for the one hop — and paid for it by also having to
 * re-supply everything else the default gives.
 */
export const defaultSession = (result: {
  user: { id: string }
  session?: { activeOrganizationId?: string | null } | null
}): CoreUserSession => {
  const orgId = result.session?.activeOrganizationId
  return orgId ? { userId: result.user.id, orgId } : { userId: result.user.id }
}
