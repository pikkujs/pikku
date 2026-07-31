import type { RelativeTimeInput } from '../time-utils.js'

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
