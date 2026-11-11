/**
 * The signed statement an external caller presents to sign a virtual user in.
 *
 * An EdDSA (Ed25519) JWT: `sub` is the virtual user id, `aud` the app's
 * audience, `exp` a few minutes out and `jti` a one-time id. The app can only
 * verify one, against a public key; whoever deploys holds the private key.
 */
export const VIRTUAL_USER_STATEMENT_ALGORITHM = 'EdDSA'

/** How long a statement lives when its signer does not say. */
export const VIRTUAL_USER_STATEMENT_TTL_SECONDS = 180

/** The longest a verifier accepts, whatever `exp` claims. */
export const VIRTUAL_USER_STATEMENT_MAX_TTL_SECONDS = 300

/** The variable a stage carries its PUBLIC key in. Not `PIKKU_`/`PIKKUSTUDIO_`: a stage rejects those. */
export const VIRTUAL_USER_VERIFY_KEY_VARIABLE = 'VIRTUAL_USER_VERIFY_KEY'

/** The variable whoever deploys holds the PRIVATE key in. Never set on a stage. */
export const VIRTUAL_USER_SIGNING_KEY_VARIABLE = 'VIRTUAL_USER_SIGNING_KEY'

/** The key a run reaches the in-process sign-in under, on `auth.api`. */
export const VIRTUAL_USER_IN_PROCESS_ENDPOINT = 'signInVirtualUserInternal'

/**
 * Verifies the signed statement a virtual user presents to sign in to a
 * deployed stage.
 */
export interface VirtualUserStatementVerifier {
  /**
   * Resolves to the virtual user the statement names. Throws
   * {@link VirtualUserStatementError} for anything that is not a fresh,
   * unreplayed statement for `audience` signed by the private half of the key.
   */
  verify(
    statement: string,
    audience: string
  ): Promise<{ virtualUserId: string }>
}

/**
 * Thrown when a virtual user's sign-in statement is not valid: badly signed,
 * expired, replayed, or for another audience.
 */
export class VirtualUserStatementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VirtualUserStatementError'
  }
}
