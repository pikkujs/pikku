import { randomBytes } from 'node:crypto'

import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  DEV_ACTOR_SIGN_IN_ENV,
} from '@pikku/better-auth'
import type { Logger } from '@pikku/core/services'

export const ACTOR_SECRET_ENV = 'SCENARIO_ACTOR_SECRET'

export const VITE_ACTOR_SECRET_ENV = 'VITE_SCENARIO_ACTOR_SECRET'

const mintEphemeralSecret = (): string => randomBytes(32).toString('base64url')

export const enableDevActorSignIn = (logger: Logger): void => {
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
  process.env[VITE_ACTOR_SECRET_ENV] = secret

  logger.info(
    (configured ?? configuredForFrontend)
      ? `Actor quick login enabled, using the ${configured ? ACTOR_SECRET_ENV : VITE_ACTOR_SECRET_ENV} already in this environment`
      : 'Actor quick login enabled with a secret minted for this run — nothing to configure, and it is gone when the server stops'
  )
}

export const disableDevActorSignIn = (logger: Logger): void => {
  if (process.env[DEV_ACTOR_SIGN_IN_ENV] !== undefined) {
    logger.warn(
      `${DEV_ACTOR_SIGN_IN_ENV} was set in this environment and has been cleared — \`pikku serve\` never enables actor sign-in. Set ${ACTOR_SIGN_IN_OPT_IN_ENV} if this stage is meant to run scenarios.`
    )
  }
  delete process.env[DEV_ACTOR_SIGN_IN_ENV]
}
