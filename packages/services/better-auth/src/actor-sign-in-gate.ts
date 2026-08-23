export const DEV_ACTOR_SIGN_IN_ENV = 'PIKKU_DEV_ACTOR_SIGN_IN'

export const ACTOR_SIGN_IN_OPT_IN_ENV = 'PIKKU_ALLOW_ACTOR_SIGN_IN'
export const ACTOR_SIGN_IN_OPT_IN_VALUE = 'passwordless-actor-sign-in'

export const ACTOR_SIGN_IN_DISABLED_MESSAGE =
  'Actor sign-in is disabled outside `pikku dev`'

export type ActorSignInReason =
  | 'pikku-dev'
  | 'allow-outside-dev-option'
  | 'allow-outside-dev-env'
  | 'disabled'

export interface ActorSignInGate {
  enabled: boolean
  reason: ActorSignInReason
  nearMissOptIn: string | undefined
}

export const resolveActorSignIn = (
  allowOutsideDev?: boolean
): ActorSignInGate => {
  const env = typeof process === 'undefined' ? undefined : process.env
  const optIn = env?.[ACTOR_SIGN_IN_OPT_IN_ENV]
  const nearMissOptIn =
    optIn !== undefined && optIn !== ACTOR_SIGN_IN_OPT_IN_VALUE
      ? optIn
      : undefined

  if (allowOutsideDev === true) {
    return { enabled: true, reason: 'allow-outside-dev-option', nearMissOptIn }
  }
  if (optIn === ACTOR_SIGN_IN_OPT_IN_VALUE) {
    return { enabled: true, reason: 'allow-outside-dev-env', nearMissOptIn }
  }
  if (env?.[DEV_ACTOR_SIGN_IN_ENV] === 'true') {
    return { enabled: true, reason: 'pikku-dev', nearMissOptIn }
  }
  return { enabled: false, reason: 'disabled', nearMissOptIn }
}

export const actorSignInEnabledMessage = (
  reason: ActorSignInReason
): string => {
  switch (reason) {
    case 'pikku-dev':
      return `actor: sign-in enabled because ${DEV_ACTOR_SIGN_IN_ENV} is set — this process is \`pikku dev\``
    case 'allow-outside-dev-option':
      return 'actor: sign-in enabled outside `pikku dev` by the `allowOutsideDev` option — any declared persona can be signed in as without a password'
    default:
      return `actor: sign-in enabled outside \`pikku dev\` by ${ACTOR_SIGN_IN_OPT_IN_ENV} — any declared persona can be signed in as without a password`
  }
}

export const actorSignInRefusedMessage = (): string =>
  `actor: an actor secret is configured but sign-in stays disabled — ${DEV_ACTOR_SIGN_IN_ENV} is unset (so this is not \`pikku dev\`). ` +
  `Remove the secret from this environment, or, if this stage is meant to run scenarios, set ${ACTOR_SIGN_IN_OPT_IN_ENV}=${ACTOR_SIGN_IN_OPT_IN_VALUE}.`

export const actorSignInAttemptRefusedMessage = (): string =>
  `actor: refused a sign-in attempt — actor sign-in is disabled outside \`pikku dev\`. ` +
  `If this stage is meant to run scenarios, set ${ACTOR_SIGN_IN_OPT_IN_ENV}=${ACTOR_SIGN_IN_OPT_IN_VALUE}.`

export const actorSignInNearMissMessage = (value: string): string =>
  `actor: ${ACTOR_SIGN_IN_OPT_IN_ENV} is set to '${value}', which is ignored — the only value that enables actor sign-in outside \`pikku dev\` is '${ACTOR_SIGN_IN_OPT_IN_VALUE}'.`
