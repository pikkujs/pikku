import { pikkuFunc, PikkuHTTPRequest } from '#pikku'
import { wireHTTP } from '@pikku/core/http'
import {
  OAuthProviderError,
  OAuthStateError,
  OAuthMissingCodeError,
  OAuthUnknownStateError,
} from '@pikku/core/oauth2'

/**
 * OAuth2 callback handler.
 * This route receives the authorization code from the OAuth provider.
 * Throws errors instead of returning status codes for proper error handling.
 */
export const oauthCallback = pikkuFunc<
  PikkuHTTPRequest<{ code?: string; state?: string; error?: string }>,
  string
>({
  func: async ({ oauthCallback: service }, { query }) => {
    const { code, state, error } = query || {}

    if (error) {
      if (state) {
        service.handleError(state, error)
      }
      throw new OAuthProviderError(error)
    }

    if (!state) {
      throw new OAuthStateError('Missing state parameter')
    }

    if (!code) {
      throw new OAuthMissingCodeError()
    }

    const handled = service.handleCallback({ code, state })
    if (!handled) {
      throw new OAuthUnknownStateError()
    }

    return 'Authorization successful! You can close this window.'
  },
})

wireHTTP({
  route: '/oauth/callback',
  method: 'get',
  func: oauthCallback,
  auth: false,
})
