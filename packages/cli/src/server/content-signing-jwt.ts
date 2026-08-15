/**
 * `pikku dev` and `pikku serve` construct the local content service themselves,
 * so they must supply the key its signed asset URLs are signed and verified
 * with — a project is not required to wire a JWTService just to serve uploads
 * in development.
 *
 * The key is random and per-process: URLs signed by one dev server mean
 * nothing to the next. That is the right lifetime for a development secret,
 * and it lets the runtime reject any signature it cannot verify instead of
 * waving through requests when no key is configured.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { getRelativeTimeOffsetFromNow } from '@pikku/core/ecosystem/types'
import type { RelativeTimeInput } from '@pikku/core/ecosystem/types'
import type { JWTService } from '@pikku/core/ecosystem/services'

type Envelope = { exp: number; payload: unknown }

export const createEphemeralContentSigningJWT = (): JWTService => {
  const key = randomBytes(32)
  const sign = (body: string) =>
    createHmac('sha256', key).update(body).digest('base64url')

  return {
    encode: async <T>(expiresIn: RelativeTimeInput, payload: T) => {
      const envelope: Envelope = {
        exp: getRelativeTimeOffsetFromNow(expiresIn).getTime(),
        payload,
      }
      const body = Buffer.from(JSON.stringify(envelope), 'utf8').toString(
        'base64url'
      )
      return `${body}.${sign(body)}`
    },
    decode: async <T>(hash: string, invalidHashError?: Error) => {
      const invalid = invalidHashError ?? new Error('Invalid content signature')
      const [body, signature] = hash.split('.')
      if (!body || !signature) {
        throw invalid
      }

      const expected = Buffer.from(sign(body), 'utf8')
      const actual = Buffer.from(signature, 'utf8')
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        throw invalid
      }

      let envelope: Envelope
      try {
        envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      } catch {
        throw invalid
      }

      if (typeof envelope.exp !== 'number' || Date.now() > envelope.exp) {
        throw invalid
      }

      return envelope.payload as T
    },
  }
}
