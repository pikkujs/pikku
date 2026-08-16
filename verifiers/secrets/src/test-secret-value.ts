/**
 * Verifies that a vault secret cannot reach a sink.
 *
 * The compile-time half is the point: every `@ts-expect-error` below is a sink
 * that must reject a `SecretValue`, and `tsc -b` fails if any of them stops
 * being an error. The runtime half covers the coercion paths types cannot see.
 */
import assert from 'node:assert/strict'
import {
  createSecretValue,
  isSecretValue,
  REDACTED,
  SecretCoercionError,
} from '@pikku/core/secret-value'
import type { QueueService } from '@pikku/core/queue'
import type { SecretValue } from '@pikku/core/secret-value'
import { LocalSecretService } from '@pikku/core/services'
import type { EmailService, Logger, WebhookService } from '@pikku/core/services'

// ── Compile time: the sinks ──────────────────────────────────────────────────

const sinkAssertions = (
  secret: SecretValue<string>,
  logger: Logger,
  email: EmailService,
  queue: QueueService,
  webhooks: WebhookService,
  db: { insert(row: { id: string; token: string }): void }
) => {
  // A secret is not the thing it wraps.
  // @ts-expect-error nominal — not assignable to string
  const _leaked: string = secret

  // Logs
  // @ts-expect-error a secret cannot be the log message
  logger.info(secret)
  // @ts-expect-error nor log metadata
  logger.error('request failed', { token: secret })
  // @ts-expect-error nor nested arbitrarily deep in it
  logger.warn({ ctx: { auth: { token: secret } } })

  // A database column
  // @ts-expect-error a secret cannot be written to a column
  db.insert({ id: '1', token: secret })

  // Email
  email.send({
    to: 'ada@example.com',
    subject: 'hello',
    // @ts-expect-error a secret cannot be the body
    text: secret,
  })
  email.send({
    to: 'ada@example.com',
    template: {
      name: 'welcome',
      // @ts-expect-error nor template data
      data: { token: secret },
    },
  })

  // Queue payloads and outgoing webhooks
  // @ts-expect-error a secret cannot be enqueued
  queue.add('jobs', { token: secret })
  // @ts-expect-error nor sent to a third party
  webhooks.send({ url: 'https://example.com', data: { token: secret } })

  // Revealing is deliberate, and then everything is permitted.
  logger.info('token', { token: secret.reveal() })
  db.insert({ id: '1', token: secret.reveal() })
  queue.add('jobs', { token: secret.reveal() })

  // Ordinary logging must keep working untouched.
  logger.info('a plain message')
  logger.error(new Error('boom'), { attempt: 2 })
  logger.warn({ event: 'retry', at: new Date() })
}
void sinkAssertions

// ── Runtime: coercion ────────────────────────────────────────────────────────

const VALUE = 'sk-live-DEADBEEF'
const secret = createSecretValue(VALUE)

assert.equal(secret.reveal(), VALUE)
assert.equal(isSecretValue(secret), true)
console.log('✓ a secret reveals only when asked')

assert.equal(
  JSON.stringify({ audit: { input: { token: secret } } }),
  '{"audit":{"input":{"token":"[secret]"}}}'
)
assert.equal(JSON.stringify(secret), `"${REDACTED}"`)
console.log('✓ structured serialization redacts instead of leaking or dropping')

assert.throws(() => `Bearer ${secret}`, SecretCoercionError)
assert.throws(() => String(secret), SecretCoercionError)
assert.throws(() => 'Bearer ' + secret, SecretCoercionError)
console.log('✓ string coercion throws rather than writing it out in the clear')

const clone = structuredClone({ token: secret })
assert.equal(JSON.stringify(clone), '{"token":{}}')
console.log('✓ nothing crosses a structuredClone boundary')

// ── Runtime: the vault round trip ────────────────────────────────────────────

const secrets = new LocalSecretService()
await secrets.setSecret('SOURCE', VALUE)
const read = await secrets.getSecret('SOURCE')
assert.equal(isSecretValue(read), true)

await secrets.setSecret('COPY', read)
assert.equal((await secrets.getSecret('COPY')).reveal(), VALUE)
console.log('✓ writing a secret back to the vault stores it, not its redaction')
