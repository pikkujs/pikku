import { decodeProtectedHeader, errors, importSPKI, jwtVerify } from 'jose'
import {
  VIRTUAL_USER_STATEMENT_ALGORITHM,
  VIRTUAL_USER_STATEMENT_MAX_TTL_SECONDS,
  VirtualUserStatementError,
  okpThumbprint,
  parseVirtualUserVerifyKeys,
  type VirtualUserStatementVerifier,
  type VirtualUserVerifyKeys,
} from '@pikku/core/services'

const CLOCK_TOLERANCE_SECONDS = 5

/** SPKI DER (base64, one line) as the PEM `importSPKI` reads. */
const toPem = (spki: string): string => {
  const lines = spki.match(/.{1,64}/g) ?? []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

/** One public key: its id and its imported form, both computed on first use. */
class HeldKey {
  private kidPromise?: Promise<string>
  private keyPromise?: ReturnType<typeof importSPKI>

  constructor(
    private readonly spki: string,
    private readonly explicitKid?: string
  ) {}

  get kid(): Promise<string> {
    return (this.kidPromise ??= this.explicitKid
      ? Promise.resolve(this.explicitKid)
      : okpThumbprint(this.spki))
  }

  get key(): ReturnType<typeof importSPKI> {
    return (this.keyPromise ??= importSPKI(
      toPem(this.spki),
      VIRTUAL_USER_STATEMENT_ALGORITHM
    ))
  }
}

/**
 * Verifies a virtual user statement against PUBLIC keys. It cannot sign one.
 *
 * Takes one key (a PEM or base64 SPKI, as before) or a list of
 * `{ kid, publicKey }`, as `VIRTUAL_USER_VERIFY_KEY` holds them. A statement
 * naming a `kid` is checked against that key only, and an unknown `kid` is
 * rejected. A statement with no `kid` (signed before keys had one) is tried
 * against each key in order. A key listed without a `kid` is named by its
 * RFC 7638 thumbprint.
 *
 * A statement is accepted once: the ids it has accepted are kept in memory
 * until their statement would have expired anyway, so the store never holds
 * more than the last few minutes of traffic. It is per process.
 */
export class JoseVirtualUserStatementVerifier implements VirtualUserStatementVerifier {
  private readonly keys: HeldKey[]
  private readonly accepted = new Map<string, number>()

  constructor(
    publicKeys: VirtualUserVerifyKeys,
    private readonly now: () => number = Date.now
  ) {
    // Throws on anything malformed, so a bad value stops the app starting.
    this.keys = parseVirtualUserVerifyKeys(publicKeys).map(
      ({ kid, publicKey }) => new HeldKey(publicKey, kid)
    )
  }

  async verify(
    statement: string,
    audience: string
  ): Promise<{ virtualUserId: string }> {
    const invalid = (error: unknown) =>
      new VirtualUserStatementError(
        `Invalid virtual user statement: ${(error as Error).message}`
      )

    let header
    try {
      header = decodeProtectedHeader(statement)
    } catch (error) {
      throw invalid(error)
    }

    // A kid derived from a key may equal one given for another: the names are
    // ambiguous, so fail closed. Thumbprints are memoised, so this hashes once.
    const kids = await Promise.all(this.keys.map((held) => held.kid))
    if (new Set(kids).size !== kids.length) {
      throw invalid(new Error('duplicate key id in the verify keys'))
    }

    let candidates = this.keys
    if (header.kid !== undefined) {
      candidates = []
      for (const held of this.keys) {
        if ((await held.kid) === header.kid) candidates.push(held)
      }
      if (candidates.length === 0) {
        throw invalid(new Error(`unknown key id ${JSON.stringify(header.kid)}`))
      }
    }

    let payload
    for (const [index, held] of candidates.entries()) {
      try {
        ;({ payload } = await jwtVerify(statement, await held.key, {
          algorithms: [VIRTUAL_USER_STATEMENT_ALGORITHM],
          audience,
          requiredClaims: ['sub', 'exp', 'iat', 'jti'],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          currentDate: new Date(this.now()),
        }))
        break
      } catch (error) {
        // Only a bad signature moves on to the next key. The signature is
        // checked before the claims, so every other failure is final.
        const last = index === candidates.length - 1
        if (last || !(error instanceof errors.JWSSignatureVerificationFailed)) {
          throw invalid(error)
        }
      }
    }

    const { sub, jti, iat, exp } = payload as {
      sub: string
      jti: string
      iat: number
      exp: number
    }
    if (exp - iat > VIRTUAL_USER_STATEMENT_MAX_TTL_SECONDS) {
      throw new VirtualUserStatementError(
        `Invalid virtual user statement: it lives longer than ${VIRTUAL_USER_STATEMENT_MAX_TTL_SECONDS} seconds`
      )
    }

    const nowSeconds = this.now() / 1000
    for (const [id, until] of this.accepted) {
      if (until < nowSeconds) this.accepted.delete(id)
    }
    if (this.accepted.has(jti)) {
      throw new VirtualUserStatementError(
        'Invalid virtual user statement: it was already used'
      )
    }
    this.accepted.set(jti, exp + CLOCK_TOLERANCE_SECONDS)

    return { virtualUserId: sub }
  }
}
