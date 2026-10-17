import type { FeatureFlagSource } from '@pikku/core/services'

import { resolveVirtualUserSignIn } from './virtual-user-sign-in-gate.js'

/** The feature flag that shows the "Sign in as …" switcher on a deployed stage. */
export const DEV_SWITCHER_FLAG = 'devSwitcher'

/**
 * Whether the "Sign in as …" switcher may list and sign in virtual users.
 *
 * Always on under `pikku dev`. A deployed stage needs virtual user sign-in opted in
 * AND its {@link DEV_SWITCHER_FLAG} flag on; production never has the opt-in.
 * Pass the same `optIn` to `pikkuVirtualUser({ allowSignIn })` and use this as
 * `virtualUserSignIn.allowed`.
 */
export const devSwitcherOn = async (
  featureFlags: FeatureFlagSource | undefined,
  optIn?: string
): Promise<boolean> => {
  const gate = resolveVirtualUserSignIn(optIn)
  if (!gate.enabled) return false
  if (gate.mayProvision) return true
  return (await featureFlags?.snapshot())?.[DEV_SWITCHER_FLAG]?.enabled === true
}

/** One row of the switcher: what it draws, and the id `POST /sign-in/switch-virtual-user` takes. */
export type DevVirtualUser = {
  id: string
  name: string
  jobTitle: string | null
}

/** A virtual user as the dev switcher is given it, before it is filtered to the signable ones. */
export type DevSignInVirtualUser = {
  id: string
  name?: string
  jobTitle?: string
  email?: string
  app?: string
  runnable?: boolean
}

/** Whether `/sign-in/switch-virtual-user` accepts this virtual user. */
export const isSignInable = (
  virtualUser: DevSignInVirtualUser
): virtualUser is DevSignInVirtualUser & { email: string } =>
  virtualUser.runnable !== false && !!virtualUser.email

/**
 * The virtual users the switcher offers: those `/sign-in/switch-virtual-user` accepts, narrowed
 * to `app` when any are declared for it. Hands back no credential — sign-in
 * names a virtual user by id and the server resolves the rest.
 */
export const listDevVirtualUsers = (
  virtualUsers: ReadonlyArray<DevSignInVirtualUser>,
  app?: string
): DevVirtualUser[] => {
  const signInable = virtualUsers.filter(isSignInable)
  const own = app
    ? signInable.filter((virtualUser) => virtualUser.app === app)
    : []
  return (own.length > 0 ? own : signInable).map((virtualUser) => ({
    id: virtualUser.id,
    name: virtualUser.name ?? virtualUser.id,
    jobTitle: virtualUser.jobTitle ?? null,
  }))
}
