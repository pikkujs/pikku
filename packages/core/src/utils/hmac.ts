import { createHmac, createVerify, timingSafeEqual } from 'node:crypto'
import { UnauthorizedError } from '../errors/errors.js'

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

type WebhookPayload = string | Uint8Array
type HmacAlgorithm = 'sha1' | 'sha256' | 'sha512'
type SecretEncoding = 'utf8' | 'hex' | 'base64'

/**
 * A provider's webhook signing secret, held by a singleton service so a
 * webhook `receive` step can check signatures without reading it. Built with
 * null when the app never provisioned the secret: every check then refuses, so
 * an unconfigured receiver accepts nothing.
 */
export class WebhookSigningSecret {
  constructor(
    private readonly provider: string,
    private readonly secret: string | null
  ) {}

  get configured(): boolean {
    return this.secret !== null
  }

  /** For handshakes that answer with a digest, such as Zoom's URL validation. */
  hmac(
    algorithm: HmacAlgorithm,
    payload: WebhookPayload,
    encoding: 'hex' | 'base64',
    secretEncoding: SecretEncoding = 'utf8'
  ): string {
    return createHmac(algorithm, Buffer.from(this.require(), secretEncoding))
      .update(payload)
      .digest(encoding)
  }

  /** Throws unless `signature` is the HMAC of `payload` under the secret. */
  verifyHmac(
    signature: string | undefined,
    algorithm: HmacAlgorithm,
    payload: WebhookPayload,
    encoding: 'hex' | 'base64',
    secretEncoding: SecretEncoding = 'utf8'
  ): void {
    const expected = this.hmac(algorithm, payload, encoding, secretEncoding)
    if (!signature || !timingSafeStringEqual(signature, expected)) {
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
    const key = this.require()
    let valid = false
    try {
      valid =
        !!signature &&
        createVerify(options.algorithm ?? 'sha256')
          .update(payload)
          .verify({ key, dsaEncoding: options.dsaEncoding }, signature, 'base64')
    } catch {
      valid = false
    }
    if (!valid) {
      throw this.rejected()
    }
  }

  private require(): string {
    if (this.secret === null) {
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
