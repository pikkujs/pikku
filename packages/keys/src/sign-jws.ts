import type { KeySigner } from '@pikku/core/keypair'
import { toBase64Url, utf8 } from './base64.js'

/**
 * Builds a compact JWS from a signer handle. The header is written FROM THE
 * HANDLE: `alg` is `signer.jwsAlg` (`EdDSA` or `RS256`, never `ed25519`) and
 * `kid` is `signer.kid`, and they override anything in `header`, so the header
 * can never name a different version than the signature. The signing input is
 * `b64url(header).b64url(payload)`; use it only for names declared
 * `signedFormat: 'jws'`.
 */
export const signJws = async (
  signer: KeySigner,
  header: Record<string, unknown>,
  payload: Record<string, unknown> | string
): Promise<string> => {
  const head = toBase64Url(
    utf8(JSON.stringify({ ...header, alg: signer.jwsAlg, kid: signer.kid }))
  )
  const body = toBase64Url(
    utf8(typeof payload === 'string' ? payload : JSON.stringify(payload))
  )
  const input = `${head}.${body}`
  return `${input}.${await signer.sign(input)}`
}
