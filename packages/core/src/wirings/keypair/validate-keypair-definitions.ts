import { parseDurationString } from '../../time-utils.js'
import {
  KEY_ALGORITHMS,
  KEY_ALGORITHM_PURPOSE,
  KEY_CUSTODIES,
  KEY_PAIR_FIELDS,
  KEY_PUBLICS,
  KEY_PURPOSES,
  KEY_SCOPES,
} from './keypair.types.js'
import type {
  KeyPairDefinitionMeta,
  KeyPairDefinitions,
  KeyPairDefinitionsMeta,
} from './keypair.types.js'

const HOUR = 60 * 60 * 1000
export const MIN_VERIFY_GRACE_MS = HOUR
export const MAX_VERIFIER_CACHE_TTL_MS = 10 * 60 * 1000
export const CLOCK_SKEW_MS = 5 * 1000

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const NOT_YET: Record<string, string> = {
  rotationMode:
    "'rotationMode' is not supported yet: pinned mode arrives in stage 3b of the key pair rollout",
  signedFormat:
    "'signedFormat' is not supported: it is an unapproved proposal (O1); 'domain' is an optional per-call argument instead",
}

const fail = (def: KeyPairDefinitionMeta, message: string): never => {
  throw new Error(
    `Key pair '${def.name}': ${message}\n  Declared in: ${def.sourceFile ?? 'unknown'}`
  )
}

const oneOf = (
  def: KeyPairDefinitionMeta,
  field: string,
  value: unknown,
  allowed: readonly string[]
) => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(
      def,
      `'${field}' must be one of ${allowed.map((a) => `'${a}'`).join(', ')}, got '${String(value)}'. Use an inline string literal.`
    )
  }
}

const duration = (
  def: KeyPairDefinitionMeta,
  field: string,
  value: string,
  allowNever: boolean
): number => {
  if (allowNever && value === 'never') return Infinity
  try {
    return parseDurationString(value)
  } catch {
    return fail(
      def,
      `'${field}' is '${value}', which is not a duration. Use a duration like '1h', '90day' or '1w'${allowNever ? ", or 'never'" : ''}.`
    )
  }
}

const humanize = (ms: number): string =>
  ms % HOUR === 0 ? `${ms / HOUR}h` : `${Math.round(ms / 1000)}s`

const validateOne = (def: KeyPairDefinitionMeta): void => {
  for (const [field, message] of Object.entries(NOT_YET)) {
    if ((def as Record<string, unknown>)[field] !== undefined) {
      fail(def, message)
    }
  }
  if (typeof def.name !== 'string' || !KEBAB.test(def.name)) {
    fail(def, `the name must be kebab-case (like 'vault-audit').`)
  }
  if (!def.displayName) fail(def, `'displayName' is required.`)

  if (!KEY_ALGORITHMS.includes(def.algorithm as never)) {
    fail(
      def,
      `algorithm '${def.algorithm}' is not allowed. Allowed: ${KEY_ALGORITHMS.join(', ')}. ` +
        `HMAC secrets stay defineSecret; ECDSA, RSA-PSS and RSA below 2048 bits are not supported.`
    )
  }
  oneOf(def, 'purpose', def.purpose, KEY_PURPOSES)
  const expected = KEY_ALGORITHM_PURPOSE[def.algorithm as 'ed25519']
  if (def.purpose !== expected) {
    fail(
      def,
      `${def.algorithm} is a ${expected} algorithm but purpose is '${def.purpose}'.`
    )
  }
  oneOf(def, 'scope', def.scope, KEY_SCOPES)
  if (def.custody !== undefined)
    oneOf(def, 'custody', def.custody, KEY_CUSTODIES)
  if (def.public !== undefined) oneOf(def, 'public', def.public, KEY_PUBLICS)
  if (def.custody === 'file' && def.scope === 'keyed') {
    fail(
      def,
      `custody 'file' cannot be used with scope 'keyed': a file keyring is single-tenant.`
    )
  }

  const grace = duration(def, 'verifyGrace', def.verifyGrace, false)
  if (grace < MIN_VERIFY_GRACE_MS) {
    fail(def, `'verifyGrace' is ${def.verifyGrace}; it must be at least 1h.`)
  }

  if (def.signedLifetime !== undefined) {
    if (def.purpose === 'sealing') {
      fail(def, `'signedLifetime' is for signing keys; this is a sealing key.`)
    }
    const lifetime = duration(def, 'signedLifetime', def.signedLifetime, false)
    const needed = lifetime + MAX_VERIFIER_CACHE_TTL_MS + CLOCK_SKEW_MS
    if (grace < needed) {
      fail(
        def,
        `'verifyGrace' (${def.verifyGrace}) must be at least signedLifetime (${def.signedLifetime}) + 10min verifier cache + 5s clock skew = ${humanize(needed)}.`
      )
    }
  }

  const rotation = duration(def, 'rotationPeriod', def.rotationPeriod, true)
  if (rotation < 2 * grace) {
    fail(
      def,
      `'rotationPeriod' (${def.rotationPeriod}) must be at least 2 x verifyGrace (${def.verifyGrace}), or 'never'.`
    )
  }
}

/**
 * Validates declared key pairs and keys them by name, sorted, with a fixed
 * field order, so the same declarations always produce the same bytes.
 *
 * @throws Error naming the key pair and its source file on the first invalid
 * declaration, or when a name is declared twice.
 * @internal Called by the CLI when generating meta.
 */
export function validateAndBuildKeyPairDefinitionsMeta(
  definitions: KeyPairDefinitions
): KeyPairDefinitionsMeta {
  const seen = new Map<string, KeyPairDefinitionMeta>()
  for (const def of definitions) {
    validateOne(def)
    const first = seen.get(def.name)
    if (first) {
      fail(
        def,
        `declared twice.\n  First declaration: ${first.sourceFile ?? 'unknown'}\n  Second declaration: ${def.sourceFile ?? 'unknown'}\nA key pair name is declared once.`
      )
    }
    seen.set(def.name, def)
  }

  const meta: KeyPairDefinitionsMeta = {}
  for (const name of [...seen.keys()].sort()) {
    const def = seen.get(name) as Record<string, unknown>
    const entry: Record<string, unknown> = {}
    for (const field of KEY_PAIR_FIELDS) {
      if (def[field] !== undefined) entry[field] = def[field]
    }
    meta[name] = entry as KeyPairDefinitionsMeta[string]
  }
  return meta
}
