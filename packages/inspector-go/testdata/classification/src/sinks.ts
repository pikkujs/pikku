import { pikkuFunc, pikkuSessionlessFunc } from './core.js'
import type { Logger, Pii, SecretValue, Services } from './core.js'

declare const token: SecretValue<string>
declare const user: { userId: string; email: Pii<string> }

interface AppLogger extends Logger {
  audit(...args: unknown[]): void
}
type LoggerAlias = AppLogger
declare const appLogger: LoggerAlias
declare const unionLogger: AppLogger | undefined

export const secretInline = pikkuFunc(async ({ logger }: Services) => {
  logger.info(token.reveal())
})
export const secretThroughLocal = pikkuFunc(async ({ logger }: Services) => {
  const revealed = token.reveal()
  logger.error('failed', revealed)
})
export const secretInObject = pikkuFunc(async ({ queue }: Services) => {
  queue.add('job', { nested: { token: token.reveal() } })
})
export const secretInEmail = pikkuFunc(async ({ email }: Services) => {
  email.send(token.reveal())
})
export const secretInAudit = pikkuFunc(
  async ({ audit, auditLog }: Services) => {
    audit.audit(token.reveal())
    audit.write(token.reveal())
    auditLog.write(token.reveal())
  }
)
export const secretInWebhook = pikkuFunc(async ({ webhook }: Services) => {
  webhook.send('https://example.com', `t=${token.reveal()}`)
})
export const piiInLogger = pikkuFunc(async ({ logger }: Services) => {
  logger.info(user.email)
})
export const piiInConsole = pikkuSessionlessFunc(async () => {
  const { email } = user
  console.log('user', email)
})
export const piiInWebhook = pikkuFunc(async ({ webhook }: Services) => {
  webhook.send('https://example.com', { email: user.email })
})
export const piiThroughDerivedLogger = pikkuFunc(async () => {
  appLogger.audit(user.email)
  unionLogger?.info(user.email)
})
// Each of these is fine: the sink keeps PII on the operator's own systems, the
// value is not classified, or the method does not write anywhere.
export const piiAllowed = pikkuFunc(
  async ({ email, audit, queue, webhook, logger }: Services) => {
    email.send(user.email)
    audit.audit(user.email)
    queue.add('job', user.email)
    webhook.verify(user.email)
    logger.info(user.userId)
    logger.info('email', { email: 'literal' })
  }
)
export const unnamedPropertyValue = pikkuFunc(async ({ logger }: Services) => {
  const email = 'not classified'
  logger.info({ email })
})
