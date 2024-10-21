import { CoreUserSession } from '../types/core.types'

/**
 * Interface for handling JSON Web Tokens (JWT).
 * @template UserSession - The type of the user session.
 */
export interface JWTService<UserSession = CoreUserSession> {
  /**
   * Encodes a payload into a JWT.
   * @param expiresIn - The expiration time of the token.
   * @param payload - The payload to encode.
   * @returns A promise that resolves to the encoded JWT.
   */
  encode: <T extends any>(expiresIn: string, payload: T) => Promise<string>

  /**
   * Decodes a JWT into its payload.
   * @param hash - The JWT to decode.
   * @param invalidHashError - An optional error to throw if the hash is invalid.
   * @param debug - An optional flag for debugging.
   * @returns A promise that resolves to the decoded payload.
   */
  decode: <T>(
    hash: string,
    invalidHashError?: Error,
    debug?: boolean
  ) => Promise<T>

  /**
   * Decodes a user session from a JWT.
   * @param jwtToken - The JWT representing the user session.
   * @param debug - An optional flag for debugging.
   * @returns A promise that resolves to the decoded user session.
   */
  decodeSession: (jwtToken: string, debug?: any) => Promise<UserSession>
}
