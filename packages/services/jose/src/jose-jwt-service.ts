/**
 * The `JoseJWTService` class provides functionality for handling JSON Web Tokens (JWTs) using the `jose` library.
 * It implements the `JWTService` interface from the `@pikku/core` module, allowing for secure encoding, decoding, and verification of JWTs.
 *
 * @module JoseJWTService
 */
import type { RelativeTimeInput } from '@pikku/core'
import { getRelativeTimeOffsetFromNow } from '@pikku/core'
import type { JWTService, Logger } from '@pikku/core/services'
import * as jose from 'jose'

/**
 * Service for handling JSON Web Tokens (JWT) using the jose library.
 */
export class JoseJWTService implements JWTService {
  private currentSecret: { id: string; key: Uint8Array } | undefined
  private secrets: Record<string, Uint8Array> = {}

  /**
   * @param getKeys - A function that retrieves an array of signing keys.
   * @param logger - An optional logger for logging information.
   */
  constructor(
    private getKeys: () => Promise<Array<{ id: string; value: string }>>,
    private logger?: Logger
  ) {}

  /**
   * Initializes the service by retrieving and setting the secrets.
   */
  public async init() {
    const keys = await this.getKeys()
    this.secrets = keys.reduceRight(
      (result, key) => {
        const secretKey = new TextEncoder().encode(key.value)
        this.currentSecret = { id: key.id, key: secretKey }
        result[key.id] = secretKey
        return result
      },
      {} as Record<string, Uint8Array>
    )
    this.logger?.info(`Retrieved ${Object.keys(this.secrets).length} JWT keys`)
  }

  /**
   * Encodes a payload into a JWT.
   * @param expiresIn - The expiration time of the token.
   * @param payload - The payload to encode.
   * @returns A promise that resolves to the encoded JWT.
   */
  public async encode<T>(
    expiresIn: RelativeTimeInput,
    payload: T,
    keyId?: string
  ): Promise<string> {
    if (!this.currentSecret) {
      await this.init()
    }

    let key: Uint8Array
    let kid: string
    if (keyId && this.secrets[keyId]) {
      key = this.secrets[keyId]
      kid = keyId
    } else if (keyId) {
      throw new Error(`JWT key not found: ${keyId}`)
    } else {
      key = this.currentSecret!.key
      kid = this.currentSecret!.id
    }

    return await new jose.SignJWT(payload as any)
      .setProtectedHeader({ alg: 'HS256', kid })
      .setIssuedAt()
      .setExpirationTime(getRelativeTimeOffsetFromNow(expiresIn))
      .sign(key)
  }

  /**
   * Decodes a JWT into its payload.
   * @param token - The JWT to decode.
   * @returns A promise that resolves to the decoded payload.
   */
  public async decode<T>(token: string): Promise<T> {
    const secret = await this.getSecret(token)
    return (await jose.jwtVerify(token, secret, { algorithms: ['HS256'] }))
      .payload as unknown as T
  }

  /**
   * Verifies the validity of a JWT.
   * @param token - The JWT to verify.
   * @returns A promise that resolves if the token is valid.
   */
  public async verify(token: string): Promise<void> {
    const secret = await this.getSecret(token)
    await jose.jwtVerify(token, secret, { algorithms: ['HS256'] })
  }

  /**
   * Retrieves the secret key for a given JWT.
   * @param token - The JWT for which to retrieve the secret key.
   * @returns A promise that resolves to the secret key.
   * @throws {Error} If the token does not contain a key ID or if the secret key is missing.
   */
  private async getSecret(token: string): Promise<Uint8Array> {
    const protectedHeader = jose.decodeProtectedHeader(token)
    const keyId = protectedHeader.kid
    if (!keyId) {
      if (!this.currentSecret) {
        await this.init()
      }
      if (!this.currentSecret) {
        throw new Error('No secrets configured')
      }
      return this.currentSecret.key
    }
    if (!this.secrets[keyId]) {
      await this.init()
    }
    const key = this.secrets[keyId]
    if (!key) {
      throw new Error(`Missing secret for id: ${keyId}`)
    }
    return key
  }
}
