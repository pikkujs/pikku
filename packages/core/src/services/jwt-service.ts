import type { RelativeTimeInput } from '../time-utils.js'

/**
 * Signs and verifies JSON Web Tokens, provided as the `jwt` singleton service
 * (for example `@pikku/jose`). The cookie and bearer auth middleware use it to
 * turn a token into a session.
 *
 * `decode` must reject a token whose signature does not verify or that has
 * expired; it is the only check between a forged token and a session.
 */
export interface JWTService {
  encode: <T extends any>(
    expiresIn: RelativeTimeInput,
    payload: T
  ) => Promise<string>

  /** `invalidHashError` replaces the implementation's own error when the hash does not verify. */
  decode: <T>(
    hash: string,
    invalidHashError?: Error,
    debug?: boolean
  ) => Promise<T>
}
