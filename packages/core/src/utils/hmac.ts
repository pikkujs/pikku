import { createHmac, createVerify, timingSafeEqual } from 'node:crypto'
import { UnauthorizedError } from '../errors/errors.js'
import type { CredentialService } from '../services/credential-service.js'

/**
 * HMAC-SHA256 of a payload, hex-encoded. Senders wrap this in their own scheme
 * prefix (`sha256=`, `v0=`, …).
 */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Constant-time signature comparison. Returns false on a length mismatch,
 * where `timingSafeEqual` itself throws.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export type WebhookPayload = string | Uint8Array
export type HmacAlgorithm = 'sha1' | 'sha256' | 'sha512'
export type SecretEncoding = 'utf8' | 'hex' | 'base64'
type SecretSource = string | null | (() => Promise<string | null>)

/** The HMAC of `payload` under `secret`, for handshakes that answer with a digest. */
export function hmacDigest(
  secret: string,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  encoding: 'hex' | 'base64',
  secretEncoding: SecretEncoding = 'utf8'
): string {
  return createHmac(algorithm, Buffer.from(secret, secretEncoding))
    .update(payload)
    .digest(encoding)
}

/** Whether `signature` is the HMAC of `payload` under `secret`, compared in constant time. */
export function verifyHmacSignature(
  secret: string,
  signature: string | undefined,
  algorithm: HmacAlgorithm,
  payload: WebhookPayload,
  encoding: 'hex' | 'base64',
  secretEncoding: SecretEncoding = 'utf8'
): boolean {
  return (
    !!signature &&
    timingSafeStringEqual(
      signature,
      hmacDigest(secret, algorithm, payload, encoding, secretEncoding)
    )
  )
}

/** Whether `signature` (base64) is `payload` signed by the private half of `publicKey` (PEM). */
export function verifyPublicKeySignature(
  publicKey: string,
  signature: string | undefined,
  payload: WebhookPayload,
  options: { algorithm?: string; dsaEncoding?: 'der' | 'ieee-p1363' } = {}
): boolean {
  if (!signature) return false
  try {
    return createVerify(options.algorithm ?? 'sha256')
      .update(payload)
      .verify(
        { key: publicKey, dsaEncoding: options.dsaEncoding },
        signature,
        'base64'
      )
  } catch {
    return false
  }
}

/**
 * @deprecated Declare `credential` and `verify` on `wireTriggerWebhookSource`,
 * which checks every request before `receive` runs, or use the functions above.
 */
export class WebhookSigningSecret {
  constructor(
    private readonly provider: string,
    private readonly secret: SecretSource
  ) {}

  /**
   * The secret a `setup` step or a handshake stored in the credential store,
   * so a new one takes effect without a deploy.
   */
  static fromCredential(
    provider: string,
    credentials: CredentialService | undefined,
    name: string
  ): WebhookSigningSecret {
    return new WebhookSigningSecret(provider, async () =>
      credentials ? credentials.get<string>(name) : null
    )
  }

  get configured(): boolean {
    return typeof this.secret === 'string'
  }

  /** The secret as it is now, to check one delivery against. */
  async load(): Promise<WebhookSigningSecret> {
    if (typeof this.secret !== 'function') {
      return this
    }
    return new WebhookSigningSecret(this.provider, await this.secret())
  }

  /** For handshakes that answer with a digest, such as Zoom's URL validation. */
  hmac(
    algorithm: HmacAlgorithm,
    payload: WebhookPayload,
    encoding: 'hex' | 'base64',
    secretEncoding: SecretEncoding = 'utf8'
  ): string {
    return hmacDigest(
      this.require(),
      algorithm,
      payload,
      encoding,
      secretEncoding
    )
  }

  /** Throws unless `signature` is the HMAC of `payload` under the secret. */
  verifyHmac(
    signature: string | undefined,
    algorithm: HmacAlgorithm,
    payload: WebhookPayload,
    encoding: 'hex' | 'base64',
    secretEncoding: SecretEncoding = 'utf8'
  ): void {
    if (
      !verifyHmacSignature(
        this.require(),
        signature,
        algorithm,
        payload,
        encoding,
        secretEncoding
      )
    ) {
      throw this.rejected()
    }
  }

  /** For providers that send the shared secret itself rather than a signature. */
  verifyToken(token: string | undefined): void {
    if (!token || !timingSafeStringEqual(token, this.require())) {
      throw this.rejected()
    }
  }

  /** For providers that sign with a private key: the secret is their public key, as PEM. */
  verifyPublicKey(
    signature: string | undefined,
    payload: WebhookPayload,
    options: { algorithm?: string; dsaEncoding?: 'der' | 'ieee-p1363' } = {}
  ): void {
    if (
      !verifyPublicKeySignature(this.require(), signature, payload, options)
    ) {
      throw this.rejected()
    }
  }

  private require(): string {
    if (typeof this.secret !== 'string') {
      throw new UnauthorizedError(
        `The ${this.provider} webhook receiver has no signing secret`
      )
    }
    return this.secret
  }

  private rejected() {
    return new UnauthorizedError(`Invalid ${this.provider} webhook signature`)
  }
}
