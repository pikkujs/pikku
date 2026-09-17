export const isSecretNotFound = (e: unknown): boolean =>
  typeof (e as { message?: unknown } | null)?.message === 'string' &&
  (e as { message: string }).message.startsWith('Requested secret not found')

/**
 * `ScopedSecretService` throws this when a key is outside the scope a wiring
 * was granted — which is the normal state for an addon, whose namespace is
 * deliberately not given the host application's `BETTER_AUTH_SECRET`. It means
 * "this secret is not yours to read", not "something went wrong", so callers
 * treat it exactly like a missing secret and carry on without a session.
 */
export const isSecretForbidden = (e: unknown): boolean =>
  typeof (e as { message?: unknown } | null)?.message === 'string' &&
  (e as { message: string }).message.startsWith('Access denied to secret key')
