import { pikkuFunc } from '#pikku'

/**
 * OAuth2 callback handler.
 * This route receives the authorization code from the OAuth provider.
 */
export const oauthCallback = pikkuFunc<
  { code?: string; state?: string; error?: string },
  string
>({
  func: async (
    { oauthCallback: service },
    { code, state, error },
    { http }
  ) => {
    http?.response?.header('Content-Type', 'text/html')
    if (error) {
      // throw 400 error
      return `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`
    }

    if (!code) {
      return '<html><body><h1>Authorization Failed</h1><p>No authorization code received</p></body></html>'
    }

    if (state) {
      service.handleCallback({ code, state })
    } else {
      service.handleError(state || '', 'Missing state parameter')
    }

    return '<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>'
  },
})
