/**
 * Whether actor sign-in — the passwordless "sign in as <persona>" route the dev
 * switcher and `pikku scenario` both post to — is allowed to work at all.
 *
 * The gate used to be "is a secret set". That answer is wrong in both
 * directions. In development it charges every contributor a hand-managed secret
 * for a command that is never production, and when they skip it the frontend
 * simply renders nothing — indistinguishable from "no personas declared" or
 * "persona metadata unreadable", which is how a consumer app ended up baking a
 * diagnostic marker into its bundle just to tell those cases apart. In
 * production it does the opposite: a `SCENARIO_ACTOR_SECRET` that leaked into a
 * deployed environment silently turns passwordless sign-in on for every
 * declared persona, including the admin ones.
 *
 * So the question is which command is running, not what is lying around in the
 * environment.
 */

/**
 * The positive marker `pikku dev` sets on its own process before it loads the
 * app, and that `pikku serve` clears.
 *
 * A marker rather than `NODE_ENV` on purpose. `NODE_ENV` is written by
 * bundlers, test runners and process managers, and it is simply *absent* in
 * plenty of real deployments — so `NODE_ENV !== 'production'` fails **open** in
 * exactly the environments where being wrong costs something. A marker fails
 * closed: only `pikku dev` sets it, and everywhere else its absence is the
 * answer.
 */
export const DEV_ACTOR_SIGN_IN_ENV = 'PIKKU_DEV_ACTOR_SIGN_IN'

/**
 * The escape hatch. Scenario and e2e suites legitimately sign actors in against
 * a deployed, non-dev stage, so a hard "dev only" rule would delete the
 * scenarios feature rather than secure it.
 *
 * The accepted value is a sentence rather than `true`/`1` so the hatch cannot be
 * reached by habit: nobody enables passwordless sign-in by copying a boolean
 * from the variable above it, and an operator who tries gets a warning naming
 * the literal they would have to type on purpose.
 */
export const ACTOR_SIGN_IN_OPT_IN_ENV = 'PIKKU_ALLOW_ACTOR_SIGN_IN'
export const ACTOR_SIGN_IN_OPT_IN_VALUE = 'passwordless-actor-sign-in'

/**
 * Distinct from `Actor sign-in is not configured`, which the endpoint keeps for
 * a missing secret. Two refusals with two messages is the whole point: a caller
 * that gets a 401 can tell "this stage does not run scenarios" from "this stage
 * meant to and lost its secret" without instrumenting the frontend.
 */
export const ACTOR_SIGN_IN_DISABLED_MESSAGE =
  'Actor sign-in is disabled outside `pikku dev`'

/** Which branch decided, so a wrong answer is diagnosable from one log line. */
export type ActorSignInReason =
  | 'pikku-dev'
  | 'allow-outside-dev-option'
  | 'allow-outside-dev-env'
  | 'disabled'

export interface ActorSignInGate {
  enabled: boolean
  reason: ActorSignInReason
  /**
   * Set when the opt-in variable is present but is not the literal that opens
   * the hatch. A near miss is worth a warning of its own: somebody meant to
   * enable this and believes they did.
   */
  nearMissOptIn: string | undefined
}

export const resolveActorSignIn = (
  allowOutsideDev?: boolean
): ActorSignInGate => {
  // Guarded because better-auth also runs on workerd and friends, where the
  // absence of `process` must read as "not `pikku dev`" rather than throw.
  const env = typeof process === 'undefined' ? undefined : process.env
  const optIn = env?.[ACTOR_SIGN_IN_OPT_IN_ENV]
  const nearMissOptIn =
    optIn !== undefined && optIn !== ACTOR_SIGN_IN_OPT_IN_VALUE
      ? optIn
      : undefined

  // The deliberate opt-ins are checked first so that the reason reported names
  // the choice somebody made, even when `pikku dev` would have allowed it too.
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

/**
 * The loud half of the fix. A secret sitting in a production environment used to
 * quietly turn actor sign-in on; now it turns nothing on, and the thing that
 * would have been silent says why instead.
 */
export const actorSignInRefusedMessage = (): string =>
  `actor: an actor secret is configured but sign-in stays disabled — ${DEV_ACTOR_SIGN_IN_ENV} is unset (so this is not \`pikku dev\`). ` +
  `Remove the secret from this environment, or, if this stage is meant to run scenarios, set ${ACTOR_SIGN_IN_OPT_IN_ENV}=${ACTOR_SIGN_IN_OPT_IN_VALUE}.`

/**
 * The same news for a lazily-resolved secret, where wiring time could not tell
 * whether one exists — so this one claims nothing about the secret, only that a
 * caller reached the endpoint and was turned away.
 */
export const actorSignInAttemptRefusedMessage = (): string =>
  `actor: refused a sign-in attempt — actor sign-in is disabled outside \`pikku dev\`. ` +
  `If this stage is meant to run scenarios, set ${ACTOR_SIGN_IN_OPT_IN_ENV}=${ACTOR_SIGN_IN_OPT_IN_VALUE}.`

export const actorSignInNearMissMessage = (value: string): string =>
  `actor: ${ACTOR_SIGN_IN_OPT_IN_ENV} is set to '${value}', which is ignored — the only value that enables actor sign-in outside \`pikku dev\` is '${ACTOR_SIGN_IN_OPT_IN_VALUE}'.`
