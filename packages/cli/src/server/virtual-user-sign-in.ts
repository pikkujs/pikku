import { randomBytes } from 'node:crypto'

import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
} from '@pikku/better-auth'
import { VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH } from '@pikku/core/services'
import type { Logger } from '@pikku/core/services'

export const VIRTUAL_USER_SECRET_ENV = 'SCENARIO_VIRTUAL_USER_SECRET'

/**
 * Read as an alias for the root when a project set only this one, and then
 * cleared: the root derives every virtual user's credential, so a bundle holding it
 * holds all of them. The browser switcher needs no credential at all: it signs
 * in by virtual user id through `/auth/sign-in/virtual-user`.
 */
export const VITE_VIRTUAL_USER_SECRET_ENV = 'VITE_SCENARIO_VIRTUAL_USER_SECRET'

const mintEphemeralSecret = (): string => randomBytes(32).toString('base64url')

/**
 * Turn on passwordless virtual user sign-in for this `pikku dev` run, with a root
 * secret that stays on the server.
 */
export const enableDevVirtualUserSignIn = (logger: Logger): void => {
  process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'

  const configured = process.env[VIRTUAL_USER_SECRET_ENV] || undefined
  const configuredForFrontend =
    process.env[VITE_VIRTUAL_USER_SECRET_ENV] || undefined

  if (
    configured &&
    configuredForFrontend &&
    configured !== configuredForFrontend
  ) {
    logger.warn(
      `${VIRTUAL_USER_SECRET_ENV} and ${VITE_VIRTUAL_USER_SECRET_ENV} are set to different values — using ${VIRTUAL_USER_SECRET_ENV}, since that is the one the server compares against`
    )
  }

  const secret = configured ?? configuredForFrontend ?? mintEphemeralSecret()
  process.env[VIRTUAL_USER_SECRET_ENV] = secret
  delete process.env[VITE_VIRTUAL_USER_SECRET_ENV]

  logger.info(
    (configured ?? configuredForFrontend)
      ? `VirtualUser quick login enabled, using the ${configured ? VIRTUAL_USER_SECRET_ENV : VITE_VIRTUAL_USER_SECRET_ENV} already in this environment`
      : 'Virtual user quick login enabled with a secret minted for this run — nothing to configure, and it is gone when the server stops'
  )

  if (secret.length < VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH) {
    logger.warn(
      `${VIRTUAL_USER_SECRET_ENV} is shorter than ${VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH} characters, so no virtual user credential can be derived from it and every virtual user sign-in will be refused. ` +
        `Generate one with \`openssl rand -base64 32\`, or unset it and let this run mint its own.`
    )
  }
}

export const disableDevVirtualUserSignIn = (logger: Logger): void => {
  if (process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] !== undefined) {
    logger.warn(
      `${DEV_VIRTUAL_USER_SIGN_IN_ENV} was set in this environment and has been cleared — \`pikku serve\` never enables virtual user sign-in. Set ${VIRTUAL_USER_SIGN_IN_OPT_IN_ENV} if this stage is meant to run scenarios.`
    )
  }
  delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
}
