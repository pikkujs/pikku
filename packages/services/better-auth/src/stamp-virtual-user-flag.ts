import type { CoreUserSession } from '@pikku/core/types'

/** Propagate the better-auth `virtualUser` user column into the pikku session */
export const stampVirtualUserFlag = <S extends CoreUserSession>(
  session: S,
  user: { virtualUser?: boolean | null } | undefined
): S =>
  user?.virtualUser === true && session.virtualUser === undefined
    ? { ...session, virtualUser: true }
    : session
