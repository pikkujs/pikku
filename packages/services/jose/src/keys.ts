import {
  CompactEncrypt,
  CompactSign,
  base64url,
  calculateJwkThumbprint,
  compactDecrypt,
  compactVerify,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  type JWK,
} from 'jose'
import type {
  GeneratedKeyMaterial,
  JwsProtectedHeader,
  KeyCrypto,
  KeyHalf,
  KeyHandle,
} from '@pikku/core/keys'

type Algorithm = 'ed25519' | 'x25519' | 'rs256'
type Signing = 'ed25519' | 'rs256'

const JOSE_ALG = {
  ed25519: 'EdDSA',
  x25519: 'ECDH-ES',
  rs256: 'RS256',
} as const

const SEAL_ALG = 'ECDH-ES'
const SEAL_ENC = 'A256GCM'

const textEncoder = new TextEncoder()

const stripPem = (pem: string): string =>
  pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')

const toPem = (value: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string => {
  const trimmed = value.trim()
  if (trimmed.startsWith('-----BEGIN')) return trimmed
  const lines = trimmed.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

/** The DER bytes of an SPKI public key given as base64 or PEM. */
const spkiDer = (value: string): Uint8Array =>
  base64url.decode(
    stripPem(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  )

const importPublic = (algorithm: Algorithm, spki: string) =>
  importSPKI(toPem(spki, 'PUBLIC KEY'), JOSE_ALG[algorithm], {
    extractable: true,
  })

/** The public members of a JWK and nothing else (no `d`, `kid`, `alg`, `use` or `key_ops`). */
const publicMembers = (
  algorithm: Algorithm,
  jwk: JWK
): { kty: string } & Record<string, string> =>
  algorithm === 'rs256'
    ? { kty: 'RSA', n: jwk.n!, e: jwk.e! }
    : { kty: 'OKP', crv: jwk.crv!, x: jwk.x! }

/**
 * The {@link KeyCrypto} for `@pikku/core/keys`, backed by jose: Ed25519 and
 * RS256 signatures as compact JWS, X25519 sealing as compact JWE (ECDH-ES with
 * A256GCM), RFC 7638 thumbprints. Runs wherever jose does (Node, Bun,
 * Workers), and holds no state.
 *
 * A sealed value binds its recipient: `apv` is the recipient's SPKI, and
 * `open` refuses a value whose `apv` or `kid` is anything else.
 */
export const createJoseKeyCrypto = (): KeyCrypto => ({
  async generate(algorithm): Promise<GeneratedKeyMaterial> {
    const pair =
      algorithm === 'ed25519'
        ? await generateKeyPair('EdDSA', {
            crv: 'Ed25519',
            extractable: true,
          })
        : algorithm === 'x25519'
          ? await generateKeyPair('ECDH-ES', {
              crv: 'X25519',
              extractable: true,
            })
          : await generateKeyPair('RS256', {
              modulusLength: 2048,
              extractable: true,
            })
    return {
      publicKey: stripPem(await exportSPKI(pair.publicKey)),
      privateKey: stripPem(await exportPKCS8(pair.privateKey)),
    }
  },

  async thumbprint(algorithm, publicKey) {
    const key = await importPublic(algorithm, publicKey)
    return calculateJwkThumbprint(await exportJWK(key), 'sha256')
  },

  async importKey(algorithm, half: KeyHalf, key): Promise<KeyHandle> {
    return half === 'private'
      ? importPKCS8(toPem(key, 'PRIVATE KEY'), JOSE_ALG[algorithm])
      : importPublic(algorithm, key)
  },

  async sign(algorithm, privateKey, header, payload) {
    if (header.alg !== JOSE_ALG[algorithm]) {
      throw new Error(
        `The header names alg ${String(header.alg)}, not ${JOSE_ALG[algorithm]}.`
      )
    }
    return new CompactSign(payload)
      .setProtectedHeader({ ...header, alg: JOSE_ALG[algorithm] })
      .sign(privateKey as Parameters<CompactSign['sign']>[0])
  },

  async verify(
    algorithm: Signing,
    publicKey,
    jws
  ): Promise<JwsProtectedHeader | undefined> {
    try {
      const { protectedHeader } = await compactVerify(
        jws,
        publicKey as Parameters<typeof compactVerify>[1],
        { algorithms: [JOSE_ALG[algorithm]] }
      )
      return protectedHeader as JwsProtectedHeader
    } catch {
      return undefined
    }
  },

  async jwk(algorithm, publicKey) {
    return publicMembers(
      algorithm,
      await exportJWK(publicKey as Parameters<typeof exportJWK>[0])
    )
  },

  async seal(recipientPublicKey, kid, plaintext) {
    const recipient = await importPublic('x25519', recipientPublicKey)
    return new CompactEncrypt(textEncoder.encode(plaintext))
      .setProtectedHeader({ alg: SEAL_ALG, enc: SEAL_ENC, kid })
      .setKeyManagementParameters({ apv: spkiDer(recipientPublicKey) })
      .encrypt(recipient)
  },

  async open(privateKey, recipientPublicKey, kid, sealed) {
    try {
      const { plaintext, protectedHeader } = await compactDecrypt(
        sealed,
        privateKey as Parameters<typeof compactDecrypt>[1],
        {
          keyManagementAlgorithms: [SEAL_ALG],
          contentEncryptionAlgorithms: [SEAL_ENC],
        }
      )
      const epk = protectedHeader.epk as { kty?: string; crv?: string }
      if (
        protectedHeader.kid !== kid ||
        protectedHeader.apv !== base64url.encode(spkiDer(recipientPublicKey)) ||
        epk?.kty !== 'OKP' ||
        epk.crv !== 'X25519'
      ) {
        throw new Error('binding')
      }
      return new TextDecoder().decode(plaintext)
    } catch {
      throw new Error('The sealed value did not open with this key.')
    }
  },
})
