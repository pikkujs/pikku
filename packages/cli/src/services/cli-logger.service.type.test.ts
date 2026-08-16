import { createSecretValue } from '@pikku/core/secret-value'
import type { CLILogger } from './cli-logger.service.js'

// A concrete logger must not be a way around the `Logger` guard: code holding
// `CLILogger` rather than `Logger` gets the same `Safe<>` protection.
const _assertions = (logger: CLILogger) => {
  const secret = createSecretValue('sk-live-DEADBEEF')

  // @ts-expect-error a secret cannot be logged
  logger.info(secret)
  // @ts-expect-error nor nested in the message
  logger.info({ message: 'using', data: { token: secret } })
  // @ts-expect-error nor in the metadata
  logger.warn('using', { token: secret })
  // @ts-expect-error nor through error
  logger.error({ message: 'failed', data: { token: secret } })

  // Ordinary logging still compiles.
  logger.info('fine')
  logger.info({ message: 'fine', data: { count: 1 } })
}
void _assertions
