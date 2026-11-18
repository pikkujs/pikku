import {
  createChallenge,
  verifySolution,
  type Challenge,
  type Payload,
} from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { randomInt } from 'altcha-lib'
import {
  CaptchaExpiredError,
  CaptchaInvalidError,
} from '../lib/altcha-errors.js'

/** PBKDF2 keeps the widget's solve to about a second on a phone. `deriveKey` is the only part that needs `node:crypto`. */
const ALGORITHM = 'PBKDF2/SHA-256'
/** With the counter range below, about 15M hashes per solve: two to three seconds on a desktop browser. A solve the visitor started may take that long. */
export const DEFAULT_COST = 5_000
const COUNTER_RANGE = [2_000, 4_000] as const

/** A challenge stays solvable for five minutes, long enough to fill a form. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000

export interface SolvedChallenge {
  /** Unique per challenge: the signature covers its nonce and salt. */
  id: string
  /** Epoch milliseconds after which the challenge could not have been solved. */
  expiry: number
}

/**
 * Issues and checks challenges. It holds the two HMAC secrets, because the
 * function runner withholds `secrets` from functions: only a service built in
 * the factory may read them.
 */
export class AltchaService {
  constructor(
    private readonly hmacSignatureSecret: string,
    private readonly hmacKeySignatureSecret: string,
    /** PBKDF2 iterations per attempt, which sets how long the widget works. Tests lower it. */
    private readonly cost: number = DEFAULT_COST
  ) {}

  async issue(): Promise<Challenge> {
    return await createChallenge({
      algorithm: ALGORITHM,
      cost: this.cost,
      counter: randomInt(COUNTER_RANGE[0], COUNTER_RANGE[1]),
      deriveKey,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      hmacSignatureSecret: this.hmacSignatureSecret,
      hmacKeySignatureSecret: this.hmacKeySignatureSecret,
    })
  }

  /** Throws unless `encoded` is a payload this service signed, solved and still in time. Does not record it as spent. */
  async check(encoded: string): Promise<SolvedChallenge> {
    let payload: Payload
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    } catch {
      throw new CaptchaInvalidError()
    }
    const { challenge, solution } = payload ?? {}
    const expiresAt = challenge?.parameters?.expiresAt
    // An unsigned or unexpiring challenge is one this service never issued.
    if (!solution || typeof expiresAt !== 'number' || !challenge.signature) {
      throw new CaptchaInvalidError()
    }
    const result = await verifySolution({
      challenge,
      solution,
      deriveKey,
      hmacSignatureSecret: this.hmacSignatureSecret,
      hmacKeySignatureSecret: this.hmacKeySignatureSecret,
    })
    if (result.expired) throw new CaptchaExpiredError()
    if (!result.verified) throw new CaptchaInvalidError()
    return { id: challenge.signature, expiry: expiresAt * 1000 }
  }
}
