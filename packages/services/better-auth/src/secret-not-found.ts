export const isSecretNotFound = (e: unknown): boolean =>
  typeof (e as { message?: unknown } | null)?.message === 'string' &&
  (e as { message: string }).message.startsWith('Requested secret not found')

/**
 * Whether `ScopedSecretService` refused the key because this wiring's scope was
 * never granted it — "not yours to read", as opposed to "not there".
 *
 * See `a-session-middleware-stands-down-where-it-cannot-authenticate.md`.
 */
export const isSecretForbidden = (e: unknown): boolean =>
  typeof (e as { message?: unknown } | null)?.message === 'string' &&
  (e as { message: string }).message.startsWith('Access denied to secret key')
