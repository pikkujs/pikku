/**
 * Whether a thrown error is a `SecretService` reporting an absent key.
 *
 * Matched on the message prefix rather than the whole message: every
 * implementation names the key it could not find, which is the difference
 * between a diagnosable boot failure and a sentence that says nothing. There is
 * no error class to test against — `SecretService` is an interface any host may
 * implement, so the message is the whole contract (see the shared conformance
 * suite in `@pikku/core/testing`).
 */
export const isSecretNotFound = (e: unknown): boolean =>
  typeof (e as { message?: unknown } | null)?.message === 'string' &&
  (e as { message: string }).message.startsWith('Requested secret not found')
