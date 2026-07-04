import type { CoreUserSession } from '@pikku/core'

/**
 * Propagate the better-auth `actor` user column (see the actor plugin) into
 * the pikku core session, so synthetic scenario traffic is addressable in
 * audits/analytics even when a custom mapSession doesn't copy it.
 */
export const stampActorFlag = <S extends CoreUserSession>(
  session: S,
  user: { actor?: boolean | null } | undefined
): S =>
  user?.actor === true && session.actor === undefined
    ? { ...session, actor: true }
    : session
