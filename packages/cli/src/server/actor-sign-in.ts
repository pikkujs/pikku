import { randomBytes } from 'node:crypto'

import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  DEV_ACTOR_SIGN_IN_ENV,
} from '@pikku/better-auth'
import {
  ACTOR_ROOT_SECRET_MIN_LENGTH,
  deriveActorSecret,
} from '@pikku/core/services'
import type { Logger } from '@pikku/core/services'

export const ACTOR_SECRET_ENV = 'SCENARIO_ACTOR_SECRET'

/**
 * Read as an alias for the root when a project set only this one, and then
 * cleared: the root derives every persona's credential, so a bundle holding it
 * holds all of them. What the browser switcher gets instead is
 * {@link DEV_ACTOR_SECRETS_ENV}.
 */
export const VITE_ACTOR_SECRET_ENV = 'VITE_SCENARIO_ACTOR_SECRET'

/**
 * The dev switcher's credentials, `{ email: secret }` as JSON — one capability
 * per declared persona, each refused for any other address.
 */
export const DEV_ACTOR_SECRETS_ENV = 'VITE_DEV_ACTOR_SECRETS'

/** Just enough of a persona to mint their credential. */
export interface DevActorIdentity {
  id: string
  email: string
}

const mintEphemeralSecret = (): string => randomBytes(32).toString('base64url')

/**
 * Turn on passwordless actor sign-in for this `pikku dev` run and hand the
 * frontend switcher one credential per declared persona.
 *
 * `personas` is a thunk because resolving them means reading inspector state,
 * which is not worth doing for a project that declares none.
 */
export const enableDevActorSignIn = async (
  logger: Logger,
  personas?: () => Promise<DevActorIdentity[]>
): Promise<void> => {
  process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'

  const configured = process.env[ACTOR_SECRET_ENV] || undefined
  const configuredForFrontend = process.env[VITE_ACTOR_SECRET_ENV] || undefined

  if (
    configured &&
    configuredForFrontend &&
    configured !== configuredForFrontend
  ) {
    logger.warn(
      `${ACTOR_SECRET_ENV} and ${VITE_ACTOR_SECRET_ENV} are set to different values — using ${ACTOR_SECRET_ENV}, since that is the one the server compares against`
    )
  }

  const secret = configured ?? configuredForFrontend ?? mintEphemeralSecret()
  process.env[ACTOR_SECRET_ENV] = secret
  delete process.env[VITE_ACTOR_SECRET_ENV]

  logger.info(
    (configured ?? configuredForFrontend)
      ? `Actor quick login enabled, using the ${configured ? ACTOR_SECRET_ENV : VITE_ACTOR_SECRET_ENV} already in this environment`
      : 'Actor quick login enabled with a secret minted for this run — nothing to configure, and it is gone when the server stops'
  )

  if (secret.length < ACTOR_ROOT_SECRET_MIN_LENGTH) {
    logger.warn(
      `${ACTOR_SECRET_ENV} is shorter than ${ACTOR_ROOT_SECRET_MIN_LENGTH} characters, so no persona credential can be derived from it and every actor sign-in will be refused. ` +
        `Generate one with \`openssl rand -base64 32\`, or unset it and let this run mint its own.`
    )
    return
  }
  if (!personas) {
    return
  }

  try {
    const declared = await personas()
    if (declared.length === 0) {
      return
    }
    const credentials: Record<string, string> = {}
    for (const persona of declared) {
      credentials[persona.email] = await deriveActorSecret(
        secret,
        persona.email
      )
    }
    process.env[DEV_ACTOR_SECRETS_ENV] = JSON.stringify(credentials)
    logger.info(
      `Minted ${declared.length} persona credential${declared.length === 1 ? '' : 's'} for the dev switcher — the root stays on the server`
    )
  } catch (cause) {
    logger.warn(
      `Could not mint persona credentials for the dev switcher: ${cause instanceof Error ? cause.message : String(cause)}. ` +
        `The switcher will render nothing; scenario runs are unaffected.`
    )
  }
}

export const disableDevActorSignIn = (logger: Logger): void => {
  if (process.env[DEV_ACTOR_SIGN_IN_ENV] !== undefined) {
    logger.warn(
      `${DEV_ACTOR_SIGN_IN_ENV} was set in this environment and has been cleared — \`pikku serve\` never enables actor sign-in. Set ${ACTOR_SIGN_IN_OPT_IN_ENV} if this stage is meant to run scenarios.`
    )
  }
  delete process.env[DEV_ACTOR_SIGN_IN_ENV]
}
