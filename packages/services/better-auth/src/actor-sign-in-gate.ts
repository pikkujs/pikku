export const DEV_ACTOR_SIGN_IN_ENV = 'PIKKU_DEV_ACTOR_SIGN_IN'

export const ACTOR_SIGN_IN_OPT_IN_ENV = 'PIKKU_ALLOW_ACTOR_SIGN_IN'
export const ACTOR_SIGN_IN_OPT_IN_VALUE = 'passwordless-actor-sign-in'

export const ACTOR_SIGN_IN_DISABLED_MESSAGE =
  'Actor sign-in is disabled outside `pikku dev`'

export const ACTOR_NOT_PROVISIONED_MESSAGE =
  'No actor account exists for that address — the deployment provisions its personas at boot, so check `provisionPersonas` runs in this environment'

export type ActorSignInReason = 'pikku-dev' | 'allow-outside-dev-env' | 'disabled'

export interface ActorSignInGate {
  enabled: boolean
  reason: ActorSignInReason
  /**
   * Whether an unknown address may be turned into an actor row. `pikku dev`
   * alone: a stage that runs scenarios signs in as the personas the deployment
   * provisioned when it started, and never mints new identities.
   */
  mayProvision: boolean
  nearMissOptIn: string | undefined
}

export const resolveActorSignIn = (): ActorSignInGate => {
  const env = typeof process === 'undefined' ? undefined : process.env
  const optIn = env?.[ACTOR_SIGN_IN_OPT_IN_ENV]
  const nearMissOptIn =
    optIn !== undefined && optIn !== ACTOR_SIGN_IN_OPT_IN_VALUE
      ? optIn
      : undefined
  const isDev = env?.[DEV_ACTOR_SIGN_IN_ENV] === 'true'

  if (optIn === ACTOR_SIGN_IN_OPT_IN_VALUE) {
    return {
      enabled: true,
      reason: 'allow-outside-dev-env',
      mayProvision: isDev,
      nearMissOptIn,
    }
  }
  if (isDev) {
    return {
      enabled: true,
      reason: 'pikku-dev',
      mayProvision: true,
      nearMissOptIn,
    }
  }
  return {
    enabled: false,
    reason: 'disabled',
    mayProvision: false,
    nearMissOptIn,
  }
}

export const actorSignInEnabledMessage = (reason: ActorSignInReason): string =>
  reason === 'pikku-dev'
    ? `actor: sign-in enabled because ${DEV_ACTOR_SIGN_IN_ENV} is set — this process is \`pikku dev\``
    : `actor: sign-in enabled outside \`pikku dev\` by ${ACTOR_SIGN_IN_OPT_IN_ENV} — any provisioned persona can be signed in as without a password`

export const actorSignInRefusedMessage = (): string =>
  `actor: an actor secret is configured but sign-in stays disabled — ${DEV_ACTOR_SIGN_IN_ENV} is unset (so this is not \`pikku dev\`). ` +
  `Remove the secret from this environment, or, if this stage is meant to run scenarios, set ${ACTOR_SIGN_IN_OPT_IN_ENV}=${ACTOR_SIGN_IN_OPT_IN_VALUE}.`

export const actorSignInAttemptRefusedMessage = (): string =>
  `actor: refused a sign-in attempt — actor sign-in is disabled outside \`pikku dev\`. ` +
  `If this stage is meant to run scenarios, set ${ACTOR_SIGN_IN_OPT_IN_ENV}=${ACTOR_SIGN_IN_OPT_IN_VALUE}.`

export const actorSignInNearMissMessage = (value: string): string =>
  `actor: ${ACTOR_SIGN_IN_OPT_IN_ENV} is set to '${value}', which is ignored — the only value that enables actor sign-in outside \`pikku dev\` is '${ACTOR_SIGN_IN_OPT_IN_VALUE}'.`
