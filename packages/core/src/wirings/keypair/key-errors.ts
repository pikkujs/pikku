import { addError, PikkuError } from '../../errors/error-handler.js'

/**
 * A key operation could not complete safely: no active version, the status view
 * is stale and the store is unreachable, or the private half cannot be used
 * (for example custody `external`). Answers 503.
 * @group Error
 */
export class KeyUnavailableError extends PikkuError {}
addError(KeyUnavailableError, {
  status: 503,
  message: 'The key is unavailable.',
})

/**
 * The key version has been retired or revoked, or is past its `verifyUntil`.
 * Take a new handle and rebuild whatever named the old `kid`. Answers 500.
 * @group Error
 */
export class KeyRetiredError extends PikkuError {}
addError(KeyRetiredError, {
  status: 500,
  message: 'The key version is retired.',
})

/**
 * A ledger row says the private half exists but custody cannot produce it. It
 * is an incident, never a reason to mint a new key over the ledger. Also thrown
 * at start-up when no safe custody can be resolved. Answers 500.
 * @group Error
 */
export class KeyCustodyLostError extends PikkuError {}
addError(KeyCustodyLostError, {
  status: 500,
  message: 'The key custody is not usable.',
})

/**
 * A value was sealed to a key version that is no longer the one accepting
 * writes. Carries the current active key so the caller can re-seal. Answers 409.
 * @group Error
 */
export class KeyRotatedError extends PikkuError {
  constructor(
    public readonly kid: string,
    public readonly publicKey: string
  ) {
    super('The key was rotated. Seal to the current key and retry.')
  }
}
addError(KeyRotatedError, {
  status: 409,
  message: 'The key was rotated.',
})

/**
 * A sign or verify call disagrees with the name's `signedFormat`: a `domain`
 * name was called without a domain, a `jws` name was given one, or the domain
 * is empty or contains NUL. Answers 500: it is a bug in the caller.
 * @group Error
 */
export class DomainPolicyError extends PikkuError {}
addError(DomainPolicyError, {
  status: 500,
  message: 'The call disagrees with the key declaration.',
})
