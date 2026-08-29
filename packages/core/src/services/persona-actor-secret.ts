import {
  MIN_KEY_MATERIAL_LENGTH,
  signWithKeyMaterial,
  verifyWithKeyMaterial,
} from '../crypto-utils.js'

/** The name the root secret is held under, used only in error messages. */
export const ACTOR_SECRET_NAME = 'SCENARIO_ACTOR_SECRET'

/**
 * Namespaces the derivation so the same root secret used for anything else
 * produces different values. See knowledge/crypto.md.
 */
export const ACTOR_SECRET_INFO = 'pikku:actor-sign-in'

/** The root must be strong: every persona's credential is derived from it. */
export const ACTOR_ROOT_SECRET_MIN_LENGTH = MIN_KEY_MATERIAL_LENGTH

/**
 * What the derivation is bound to. Lowercased because the sign-in endpoint
 * looks the user up by lowercased address, and a credential that verified
 * against a different string than the row it opens is a credential for nothing.
 */
export const actorSecretSubject = (email: string): string =>
  email.trim().toLowerCase()

/**
 * One persona's actor credential: `HMAC-SHA256(root, email)`, base64url.
 *
 * The root secret is not itself a valid credential and never travels: what a
 * scenario run, a CI job or a virtual user is handed is the derived value for
 * the one address it is entitled to. Presenting it for any other address fails,
 * so a leaked credential is worth exactly one synthetic account rather than the
 * whole actor population.
 *
 * Deterministic, so nothing is stored and nothing is provisioned — the target
 * re-derives the expected value from the address being signed in as. Rotating
 * the root invalidates every derived credential at once, which is the property
 * a per-persona secret table would have to implement by hand.
 */
export const deriveActorSecret = async (
  rootSecret: string,
  email: string
): Promise<string> =>
  signWithKeyMaterial(
    ACTOR_SECRET_NAME,
    rootSecret,
    ACTOR_SECRET_INFO,
    actorSecretSubject(email)
  )

/**
 * Whether `presented` is the credential for `email` under `rootSecret`.
 *
 * False — never throws — for a malformed, truncated or mismatched value, and
 * the comparison is WebCrypto's own HMAC verify, so it does not exit early on
 * the first differing byte.
 */
export const verifyActorSecret = async (
  rootSecret: string,
  email: string,
  presented: string
): Promise<boolean> =>
  verifyWithKeyMaterial(
    ACTOR_SECRET_NAME,
    rootSecret,
    ACTOR_SECRET_INFO,
    actorSecretSubject(email),
    presented
  )
