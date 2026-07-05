import type { CoreUserSession } from '@pikku/core'

/** Propagate the better-auth `actor` user column into the pikku session */
export const stampActorFlag = <S extends CoreUserSession>(
  session: S,
  user: { actor?: boolean | null } | undefined
): S =>
  user?.actor === true && session.actor === undefined
    ? { ...session, actor: true }
    : session
