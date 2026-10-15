import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
  VIRTUAL_USER_STATEMENT_TTL_SECONDS,
  VIRTUAL_USER_SIGNING_KEY_VARIABLE,
  type VariablesService,
} from '@pikku/core/services'
import type { VirtualUserStatementMint } from '@pikku/core/virtual-user'

export interface VirtualUserKeyPair {
  /** PKCS8 DER, base64 on one line. Stays with whoever signs. */
  signingKey: string
  /** SPKI DER, base64 on one line. What the app is given. */
  verifyKey: string
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64url')

// A PEM pasted into an env var arrives with literal \n; base64 DER arrives bare.
const readPrivateKey = (raw: string) => {
  const text = raw.trim().replace(/\\n/g, '\n')
  return text.includes('BEGIN')
    ? createPrivateKey(text)
    : createPrivateKey({
        key: Buffer.from(text, 'base64'),
        format: 'der',
        type: 'pkcs8',
      })
}

export const generateVirtualUserKeyPair = (): VirtualUserKeyPair => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    signingKey: privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64'),
    verifyKey: publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64'),
  }
}

export const verifyKeyFor = (signingKey: string): string =>
  createPublicKey(readPrivateKey(signingKey))
    .export({ format: 'der', type: 'spki' })
    .toString('base64')

export interface SignStatementOptions {
  signingKey: string
  virtualUserId: string
  audience: string
  ttlSeconds?: number
  now?: () => number
}

/** One single-use statement: who to sign in as, for which app, for a few minutes. */
export const signVirtualUserStatement = ({
  signingKey,
  virtualUserId,
  audience,
  ttlSeconds = VIRTUAL_USER_STATEMENT_TTL_SECONDS,
  now = Date.now,
}: SignStatementOptions): string => {
  const iat = Math.floor(now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      sub: virtualUserId,
      aud: audience,
      iat,
      exp: iat + ttlSeconds,
      jti: randomUUID(),
    })
  )
  const signature = sign(
    null,
    Buffer.from(`${head}.${claims}`),
    readPrivateKey(signingKey)
  )
  return `${head}.${claims}.${b64url(signature)}`
}

/** Where `pikku dev` keeps the private key it generated for this project. */
export const devSigningKeyPath = (runtimeDir: string) =>
  join(runtimeDir, 'virtual-user', 'signing.key')

export const readDevSigningKey = (runtimeDir: string): string | undefined => {
  const path = devSigningKeyPath(runtimeDir)
  return existsSync(path) ? readFileSync(path, 'utf-8').trim() : undefined
}

/**
 * The key pair for this project's dev server, generated on first use.
 *
 * The private half is written beside a `.gitignore` that ignores everything in
 * its folder, because the runtime dir is not always ignored by the project.
 */
export const loadOrCreateDevKeyPair = (
  runtimeDir: string
): VirtualUserKeyPair => {
  const existing = readDevSigningKey(runtimeDir)
  if (existing) {
    return { signingKey: existing, verifyKey: verifyKeyFor(existing) }
  }
  const pair = generateVirtualUserKeyPair()
  const path = devSigningKeyPath(runtimeDir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(join(dirname(path), '.gitignore'), '*\n')
  writeFileSync(path, `${pair.signingKey}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
  return pair
}

export interface StatementMintOptions {
  /** The app's API URL; the statement is addressed to its origin. */
  apiUrl: string
  runtimeDir: string
  /** What cannot proceed without a key, for the error. */
  what: string
}

/**
 * The signer for an external caller. The key comes from the environment of
 * whoever deploys (`VIRTUAL_USER_SIGNING_KEY`) or, failing that, from the file
 * `pikku dev` wrote.
 */
export const resolveStatementMint = async (
  variables: VariablesService,
  { apiUrl, runtimeDir, what }: StatementMintOptions
): Promise<VirtualUserStatementMint> => {
  const fromEnvironment = await variables.get(VIRTUAL_USER_SIGNING_KEY_VARIABLE)
  const signingKey = fromEnvironment
    ? String(fromEnvironment)
    : readDevSigningKey(runtimeDir)
  if (!signingKey) {
    throw new Error(
      `No signing key, so ${what} cannot sign in. ` +
        `Run \`pikku dev\` once in this project to create one for the dev server, or export ` +
        `${VIRTUAL_USER_SIGNING_KEY_VARIABLE} against a deployed stage (its deployer holds it; never put it in pikku.config.json).`
    )
  }
  const audience = new URL(apiUrl).origin
  return (virtualUser) =>
    signVirtualUserStatement({
      signingKey,
      virtualUserId: virtualUser.id,
      audience,
    })
}

export const runtimeDirOf = (config: {
  rootDir: string
  runtimeDir?: string
}): string => config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
