/**
 * Set to `true` by `pikku dev`. Opens virtual user sign-in, statement-free
 * switching and provisioning — but never under `NODE_ENV=production`.
 */
export const DEV_VIRTUAL_USER_SIGN_IN_ENV = 'PIKKU_DEV_VIRTUAL_USER_SIGN_IN'

/** The variable a deployed stage sets to open virtual user sign-in. */
export const VIRTUAL_USER_SIGN_IN_OPT_IN_ENV =
  'PIKKU_ALLOW_VIRTUAL_USER_SIGN_IN'
/** The one value of {@link VIRTUAL_USER_SIGN_IN_OPT_IN_ENV} that opens it. */
export const VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE =
  'passwordless-virtual-user-sign-in'

/** Returned by the sign-in endpoints while the gate is shut. */
export const VIRTUAL_USER_SIGN_IN_DISABLED_MESSAGE =
  'Virtual user sign-in is disabled outside `pikku dev`'

/** Returned outside `pikku dev` for an address with no provisioned row. */
export const VIRTUAL_USER_NOT_PROVISIONED_MESSAGE =
  'No virtual user account exists for that address — the deployment provisions its virtual users at startup, so check they were declared in this environment'

/** Why {@link resolveVirtualUserSignIn} opened or shut the gate. */
export type VirtualUserSignInReason =
  'pikku-dev' | 'allow-outside-dev-env' | 'disabled'

/** The resolved virtual user sign-in gate. */
export interface VirtualUserSignInGate {
  enabled: boolean
  reason: VirtualUserSignInReason
  /**
   * Whether an unknown address may be turned into a virtual user row. `pikku dev`
   * alone: a stage that runs scenarios signs in as the virtual users the deployment
   * provisioned when it started, and never mints new identities.
   */
  mayProvision: boolean
  /**
   * Whether the opt-in variable is set to something other than the value that
   * works. The value is deliberately not carried: it reaches a log line, and an
   * operator may have pasted a secret into it.
   */
  nearMissOptIn: boolean
}

/**
 * Resolves the gate, optionally from a value the caller already has.
 *
 * `optIn` exists because `process.env` is not where every runtime keeps its
 * configuration. A Cloudflare Worker receives the opt-in as a binding, which
 * reaches user code through the variables service and never appears on
 * `process.env` unless the deployment opts into `nodejs_compat_populate_process_env`
 * — so a gate that reads only the environment is shut on precisely the stages
 * that deploy there. Passing the resolved value in keeps the decision in one
 * place while letting the caller say where it read it from.
 */
export const resolveVirtualUserSignIn = (
  optIn?: string
): VirtualUserSignInGate => {
  const env = typeof process === 'undefined' ? undefined : process.env
  const resolvedOptIn = optIn ?? env?.[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV]
  const nearMissOptIn =
    resolvedOptIn !== undefined &&
    resolvedOptIn !== VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE
  // `pikku dev` sets the flag; a production deploy that inherited it is not
  // `pikku dev`, and must not get statement-free switching or new rows from it.
  const isDev =
    env?.[DEV_VIRTUAL_USER_SIGN_IN_ENV] === 'true' &&
    env?.NODE_ENV !== 'production'

  if (resolvedOptIn === VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE) {
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

export const virtualUserSignInEnabledMessage = (
  reason: VirtualUserSignInReason
): string =>
  reason === 'pikku-dev'
    ? `virtualUser: sign-in enabled because ${DEV_VIRTUAL_USER_SIGN_IN_ENV} is set — this process is \`pikku dev\``
    : `virtualUser: sign-in enabled outside \`pikku dev\` by ${VIRTUAL_USER_SIGN_IN_OPT_IN_ENV} — a provisioned virtual user can be signed in as by the app's own runs and by whoever holds this stage's signing key`

/**
 * The value itself is never reproduced: an operator who pasted a secret into
 * the variable by mistake would otherwise have it retained by every log sink
 * that saw this warning.
 */
export const virtualUserSignInNearMissMessage = (): string =>
  `virtualUser: ${VIRTUAL_USER_SIGN_IN_OPT_IN_ENV} is set to an unsupported value, which is ignored — the only value that enables virtual user sign-in outside \`pikku dev\` is '${VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE}'.`

export const VIRTUAL_USER_NO_VERIFY_KEY_MESSAGE =
  'Virtual user sign-in is on but this app has no VIRTUAL_USER_VERIFY_KEY, so the CLI, scenarios and the dev switcher cannot sign in from outside. ' +
  "Set the variable to this stage's virtual user public key (pikku dev sets it for you); runs inside the app are not affected."
