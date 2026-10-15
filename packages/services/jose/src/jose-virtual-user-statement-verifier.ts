import { importSPKI, jwtVerify } from 'jose'
import {
  VIRTUAL_USER_STATEMENT_ALGORITHM,
  VIRTUAL_USER_STATEMENT_MAX_TTL_SECONDS,
  VirtualUserStatementError,
  type VirtualUserStatementVerifier,
} from '@pikku/core/services'

const CLOCK_TOLERANCE_SECONDS = 5

/** SPKI as a PEM, or as the single-line base64 DER a stage variable carries. */
const toPem = (publicKey: string): string => {
  const trimmed = publicKey.trim().replace(/\\n/g, '\n')
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed
  const lines = trimmed.replace(/\s+/g, '').match(/.{1,64}/g) ?? []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

/**
 * Verifies a virtual user statement against a PUBLIC key. It cannot sign one.
 *
 * A statement is accepted once: the ids it has accepted are kept in memory
 * until their statement would have expired anyway, so the store never holds
 * more than the last few minutes of traffic. It is per process.
 */
export class JoseVirtualUserStatementVerifier implements VirtualUserStatementVerifier {
  private key: ReturnType<typeof importSPKI> | undefined
  private readonly accepted = new Map<string, number>()

  constructor(
    private readonly publicKey: string,
    private readonly now: () => number = Date.now
  ) {}

  async verify(
    statement: string,
    audience: string
  ): Promise<{ virtualUserId: string }> {
    this.key ??= importSPKI(
      toPem(this.publicKey),
      VIRTUAL_USER_STATEMENT_ALGORITHM
    )
    let payload
    try {
      ;({ payload } = await jwtVerify(statement, await this.key, {
        algorithms: [VIRTUAL_USER_STATEMENT_ALGORITHM],
        audience,
        requiredClaims: ['sub', 'exp', 'iat', 'jti'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: new Date(this.now()),
      }))
    } catch (error) {
      throw new VirtualUserStatementError(
        `Invalid virtual user statement: ${(error as Error).message}`
      )
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
