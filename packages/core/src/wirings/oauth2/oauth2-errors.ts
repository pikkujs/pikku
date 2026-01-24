import { PikkuError, addError } from '../../errors/error-handler.js'

/**
 * OAuth provider returned an error during authorization
 */
export class OAuthProviderError extends PikkuError {}
addError(OAuthProviderError, {
  status: 400,
  message: 'OAuth provider returned an error during authorization.',
})

/**
 * Invalid or missing state parameter (CSRF protection)
 */
export class OAuthStateError extends PikkuError {}
addError(OAuthStateError, {
  status: 400,
  message: 'Invalid or missing OAuth state parameter.',
})

/**
 * Missing authorization code in callback
 */
export class OAuthMissingCodeError extends PikkuError {}
addError(OAuthMissingCodeError, {
  status: 400,
  message: 'Missing authorization code in OAuth callback.',
})

/**
 * Unknown OAuth callback state (no pending authorization)
 */
export class OAuthUnknownStateError extends PikkuError {}
addError(OAuthUnknownStateError, {
  status: 400,
  message: 'Unknown OAuth callback state. No pending authorization found.',
})
