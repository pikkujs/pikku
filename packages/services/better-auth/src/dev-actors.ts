import type { FeatureFlagSource } from '@pikku/core/services'

import { resolveActorSignIn } from './actor-sign-in-gate.js'

/** The feature flag that shows the "Sign in as …" switcher on a deployed stage. */
export const DEV_SWITCHER_FLAG = 'devSwitcher'

/**
 * Whether the "Sign in as …" switcher may list and sign in personas.
 *
 * Always on under `pikku dev`. A deployed stage needs actor sign-in opted in
 * AND its {@link DEV_SWITCHER_FLAG} flag on; production never has the opt-in.
 * Pass the same `optIn` to `pikkuActor({ allowSignIn })` and use this as
 * `personaSignIn.allowed`.
 */
export const devSwitcherOn = async (
  featureFlags: FeatureFlagSource | undefined,
  optIn?: string
): Promise<boolean> => {
  const gate = resolveActorSignIn(optIn)
  if (!gate.enabled) return false
  if (gate.mayProvision) return true
  return (await featureFlags?.snapshot())?.[DEV_SWITCHER_FLAG]?.enabled === true
}

/** One row of the switcher: what it draws, and the id `POST /sign-in/persona` takes. */
export type DevActor = { id: string; name: string; jobTitle: string | null }

export type DevActorPersona = {
  id: string
  name?: string
  jobTitle?: string
  email?: string
  app?: string
  runnable?: boolean
}

/** Whether `/sign-in/persona` accepts this persona. */
export const isSignInable = (
  persona: DevActorPersona
): persona is DevActorPersona & { email: string } =>
  persona.runnable !== false && !!persona.email

/**
 * The personas the switcher offers: those `/sign-in/persona` accepts, narrowed
 * to `app` when any are declared for it. Hands back no credential — sign-in
 * names a persona by id and the server resolves the rest.
 */
export const listDevActors = (
  personas: ReadonlyArray<DevActorPersona>,
  app?: string
): DevActor[] => {
  const signInable = personas.filter(isSignInable)
  const own = app ? signInable.filter((persona) => persona.app === app) : []
  return (own.length > 0 ? own : signInable).map((persona) => ({
    id: persona.id,
    name: persona.name ?? persona.id,
    jobTitle: persona.jobTitle ?? null,
  }))
}
