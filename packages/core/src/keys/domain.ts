import { DomainPolicyError } from '../wirings/keypair/index.js'
import { utf8 } from './base64.js'

/** A domain is a non-empty string without NUL, so `domain || 0x00 || data` is unambiguous. */
export const assertDomain = (domain: unknown): string => {
  if (typeof domain !== 'string' || domain.length === 0) {
    throw new DomainPolicyError('A domain must be a non-empty string.')
  }
  if (domain.includes('\u0000')) {
    throw new DomainPolicyError('A domain must not contain NUL.')
  }
  return domain
}

/**
 * The bytes a `signedFormat: 'domain'` key signs: `utf8(domain) || 0x00 ||
 * data`. The domain is part of the signed bytes, not a header, so it cannot be
 * stripped, and a signature made for one domain never verifies in another.
 * Verifiers outside the key service (an agent) must use this same helper, not
 * a hand copy of the layout.
 */
export const prefixWithDomain = (
  domain: string,
  data: Uint8Array | string
): Uint8Array => {
  const prefix = utf8(assertDomain(domain))
  const body = typeof data === 'string' ? utf8(data) : data
  const out = new Uint8Array(prefix.length + 1 + body.length)
  out.set(prefix, 0)
  out[prefix.length] = 0
  out.set(body, prefix.length + 1)
  return out
}
