import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSecretValue,
  isSecretValue,
  REDACTED,
  SecretCoercionError,
  type Safe,
  type SecretValue,
} from './secret-value.js'
import type { Logger } from './services/logger.js'
import type { AuditLog } from './services/audit-service.js'

const VALUE = 'sk-live-DEADBEEF'

describe('SecretValue', () => {
  test('reveals the value', () => {
    assert.equal(createSecretValue(VALUE).reveal(), VALUE)
  })

  test('unwraps object secrets whole', () => {
    const creds = createSecretValue({ apiKey: 'k', apiSecret: 's' })
    assert.deepEqual(creds.reveal(), { apiKey: 'k', apiSecret: 's' })
  })

  test('is recognisable at runtime', () => {
    assert.equal(isSecretValue(createSecretValue(VALUE)), true)
    assert.equal(
      isSecretValue(() => VALUE),
      false
    )
    assert.equal(isSecretValue(VALUE), false)
    assert.equal(isSecretValue(undefined), false)
  })
})

describe('structured serialization redacts', () => {
  test('JSON.stringify renders [secret] rather than dropping the key', () => {
    const event = {
      type: 'fn.call',
      input: { user: 'ada', token: createSecretValue(VALUE) },
    }
    assert.equal(
      JSON.stringify(event),
      '{"type":"fn.call","input":{"user":"ada","token":"[secret]"}}'
    )
  })

  test('a bare secret serializes to [secret]', () => {
    assert.equal(JSON.stringify(createSecretValue(VALUE)), `"${REDACTED}"`)
  })

  test('node inspect renders [secret]', () => {
    const inspect = Symbol.for('nodejs.util.inspect.custom')
    const secret = createSecretValue(VALUE) as unknown as Record<
      symbol,
      () => string
    >
    assert.equal(secret[inspect]!(), REDACTED)
  })

  test('structuredClone carries no secret material across the boundary', () => {
    // The value lives in a private field, so a clone is an empty object rather
    // than a copy — it crosses a worker or postMessage boundary carrying nothing.
    const clone = structuredClone({ token: createSecretValue(VALUE) })
    assert.equal(JSON.stringify(clone), '{"token":{}}')
    assert.equal(Object.keys(clone.token).length, 0)
  })
})

describe('string coercion throws', () => {
  const secret = createSecretValue(VALUE)

  test('template literal', () => {
    assert.throws(() => `Bearer ${secret}`, SecretCoercionError)
  })

  test('concatenation', () => {
    assert.throws(() => ('Bearer ' + secret) as string, SecretCoercionError)
  })

  test('String()', () => {
    assert.throws(() => String(secret), SecretCoercionError)
  })

  test('explicit toString()', () => {
    assert.throws(
      () => (secret as unknown as { toString(): string }).toString(),
      SecretCoercionError
    )
  })

  test('the thrown error never contains the secret', () => {
    try {
      String(secret)
      assert.fail('expected a throw')
    } catch (error) {
      assert.equal((error as Error).message.includes(VALUE), false)
    }
  })
})

// ── Type-level assertions ────────────────────────────────────────────────────
// The point of the exercise: these fail `yarn tsc`, not `yarn test`. Held in a
// function that is never called so the runtime never evaluates them.
//
// `tsconfig.json` excludes `**/*.test.ts`, so this file is only reached through
// `tsconfig.type-tests.json`, which lists it under `files` — `exclude` filters
// `include` but not `files`. Both run from this package's `tsc` script. Without
// that second pass the assertions below type-check nothing at all.

const _typeAssertions = (
  secret: SecretValue<string>,
  creds: SecretValue<{ token: string }>,
  anything: any,
  sink: <T>(value: Safe<T>) => void
) => {
  // Nominal: not assignable to what it wraps.
  // @ts-expect-error a secret is not a string
  const _notAString: string = secret
  void _notAString

  // Unwrapping composes with plain types, so call sites need no cast.
  const _unwrapped: string = secret.reveal()
  const _unwrappedField: string = creds.reveal().token
  void _unwrapped
  void _unwrappedField

  // @ts-expect-error a secret cannot reach a guarded sink
  sink(secret)
  // @ts-expect-error nor nested inside an object
  sink({ config: { token: secret } })
  // @ts-expect-error nor inside an array
  sink([secret])
  // @ts-expect-error nor as one branch of a union
  sink(true ? secret : 'plain')

  // Unwrapped values pass — disclosure is deliberate and visible.
  sink(secret.reveal())
  sink({ config: { token: secret.reveal() } })

  // Ordinary values must not trip the guard.
  sink('plain')
  sink(42)
  sink(null)
  sink(undefined)
  sink({ nested: { deep: [1, 2, 3] } })
  sink(() => 'an ordinary function')
  sink(new Date())
  sink(new Error('boom'))
  sink(Buffer.from('bytes'))
  sink(new Map([['k', 'v']]))
  sink([{ a: 1 }, { a: 2 }])

  // `any` cannot be guarded and must stay usable rather than collapsing to never.
  sink(anything)
}
void _typeAssertions

// The assertions above prove `Safe<>` works against a stand-in sink. These prove
// the real interfaces are actually wired to it — the two can drift apart, and a
// sink that forgot the guard is exactly the leak this design exists to stop.

const _sinkAssertions = (
  secret: SecretValue<string>,
  logger: Logger,
  auditLog: AuditLog
) => {
  // @ts-expect-error a secret cannot be logged
  logger.info(secret)
  // @ts-expect-error nor nested in a log message
  logger.info({ token: secret })
  // @ts-expect-error nor in the log metadata
  logger.info('using', { token: secret })

  // @ts-expect-error nor written into an audit input
  auditLog.write({ type: 'used', source: 'explicit', input: { token: secret } })
  const metadata = { token: secret }
  // @ts-expect-error nor into audit metadata
  auditLog.write({ type: 'used', source: 'explicit', metadata })

  // Ordinary logging and auditing must still compile.
  logger.info({ msg: 'fine' })
  logger.info('fine', { count: 1 })
  auditLog.write({ type: 'used', source: 'explicit', input: { userId: 'u1' } })
}
void _sinkAssertions
