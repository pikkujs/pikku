import { MissingSessionError } from '@vramework/core/errors'
import { JWTService } from '@vramework/core/services/jwt-service'
import { Logger } from '@vramework/core/services/logger'
import { CoreUserSession } from '@vramework/core/types/core.types'
import * as jose from 'jose'

/**
 * Service for handling JSON Web Tokens (JWT) using the jose library.
 * @template UserSession - The type of the user session.
 */
export class JoseJWTService<UserSession extends CoreUserSession>
  implements JWTService
{
  private currentSecret: { id: string; key: Uint8Array } | undefined
  private secrets: Record<string, Uint8Array> = {}

  /**
   * @param getSecrets - A function that retrieves an array of secrets.
   * @param logger - An optional logger for logging information.
   */
  constructor(
    private getSecrets: () => Promise<Array<{ id: string; value: string }>>,
    private logger?: Logger
  ) {}

  /**
   * Initializes the service by retrieving and setting the secrets.
   */
  public async init() {
    const secrets = await this.getSecrets()
    this.secrets = secrets.reduceRight(
      (result, secret) => {
        result[secret.id] = new TextEncoder().encode(secret.value)
        this.currentSecret = { id: secret.id, key: result[secret.id] }
        return result
      },
      {} as Record<string, Uint8Array>
    )
    this.logger?.info(
      `Retrieved JWT secrets: ${Object.keys(this.secrets).join(',')}`
    )
  }

  /**
   * Encodes a payload into a JWT.
   * @param expiresIn - The expiration time of the token.
   * @param payload - The payload to encode.
   * @returns A promise that resolves to the encoded JWT.
   */
  public async encode<T>(expiresIn: string, payload: T): Promise<string> {
    if (!this.currentSecret) {
      await this.init()
    }
    return await new jose.SignJWT(payload as any)
      .setProtectedHeader({ alg: 'HS256', kid: this.currentSecret!.id })
      .setIssuedAt()
      // .setIssuer('urn:example:issuer')
      // .setAudience('urn:example:audience')
      .setExpirationTime(expiresIn)
      .sign(this.currentSecret!.key)
  }

  /**
   * Decodes a JWT into its payload.
   * @param token - The JWT to decode.
   * @returns A promise that resolves to the decoded payload.
   */
  public async decode<T>(token: string): Promise<T> {
    const secret = await this.getSecret(token)
    return (await jose.jwtVerify(token, secret, {})) as unknown as T
  }

  /**
   * Verifies the validity of a JWT.
   * @param token - The JWT to verify.
   * @returns A promise that resolves if the token is valid.
   */
  public async verify(token: string): Promise<void> {
    const secret = await this.getSecret(token)
    await jose.jwtVerify(token, secret)
  }

  /**
   * Decodes a user session from a JWT.
   * @param session - The JWT representing the user session.
   * @returns A promise that resolves to the decoded user session.
   * @throws {MissingSessionError} If the session is not provided.
   */
  public async decodeSession(session?: string): Promise<UserSession> {
    if (!session) {
      throw new MissingSessionError()
    }
    const userSession: any = await this.decode<UserSession>(session)
    return userSession.payload
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
      throw new Error('Missing secret keyid on token')
    }
    if (!this.secrets[keyId]) {
      await this.init()
    }
    const key = this.secrets[keyId]
    if (!key) {
      throw new Error(`Missing secret for id: ${keyId}`)
    }
    return this.secrets[keyId]
  }
}
