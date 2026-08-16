import { createSecretValue } from '@pikku/core/classification'
import type { AzInvocationLogger } from './pikku-az-functions-logger.js'

// A concrete logger must not be a way around the `Logger` guard.
const _assertions = (logger: AzInvocationLogger) => {
  const secret = createSecretValue('sk-live-DEADBEEF')

  // @ts-expect-error a secret cannot be logged
  logger.info(secret)
  // @ts-expect-error nor nested in the message
  logger.info({ token: secret })
  // @ts-expect-error nor in the metadata
  logger.warn('using', { token: secret })

  logger.info('fine')
  logger.info({ count: 1 })
}
void _assertions
