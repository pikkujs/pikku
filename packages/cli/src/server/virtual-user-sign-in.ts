import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
} from '@pikku/better-auth/constants'
import {
  VIRTUAL_USER_VERIFY_KEY_VARIABLE,
  type Logger,
} from '@pikku/core/services'
import { VIRTUAL_USER_VARIABLES } from '@pikku/core/virtual-user'

import { loadOrCreateDevKeyPair } from '../utils/virtual-user-signer.js'

/**
 * Turn on virtual user sign-in for this `pikku dev` run.
 *
 * The key pair is made on first start and kept, so statements signed by the CLI
 * in another terminal verify against the same public key after a restart. Only
 * the public half goes into the app's environment.
 */
export const enableDevVirtualUserSignIn = (
  logger: Logger,
  runtimeDir: string
): void => {
  process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
  const { verifyKey } = loadOrCreateDevKeyPair(runtimeDir)
  process.env[VIRTUAL_USER_VERIFY_KEY_VARIABLE] = verifyKey
  logger.info(
    'Virtual user sign-in enabled for this dev server. Its signing key is kept under the runtime dir and never leaves this machine.'
  )
}

/**
 * The address a run inside the dev server drives it at: the bound origin plus
 * the HTTP prefix the dev environment names, if any. Left alone when the project
 * already set one.
 */
export const setDevVirtualUserApiUrl = (
  origin: string,
  configuredApiUrl: string | undefined
): void => {
  const prefix = configuredApiUrl
    ? new URL(configuredApiUrl).pathname.replace(/\/+$/, '')
    : ''
  process.env[VIRTUAL_USER_VARIABLES.apiUrl] ??= `${origin}${prefix}`
}

export const disableDevVirtualUserSignIn = (logger: Logger): void => {
  if (process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] !== undefined) {
    logger.warn(
      `${DEV_VIRTUAL_USER_SIGN_IN_ENV} was set in this environment and has been cleared — \`pikku serve\` never enables virtual user sign-in. Set ${VIRTUAL_USER_SIGN_IN_OPT_IN_ENV} if this stage is meant to run scenarios.`
    )
  }
  delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
}
