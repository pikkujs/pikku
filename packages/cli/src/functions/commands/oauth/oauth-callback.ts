import { pikkuFunc, wireHTTP } from '#pikku'

/**
 * OAuth2 callback handler.
 * This route receives the authorization code from the OAuth provider.
 */
export const oauthCallback = pikkuFunc<
  { code?: string; state?: string; error?: string },
  string
>({
  func: async (_services, { code, state, error }, { http }) => {
    http?.response?.header('Content-Type', 'text/html')
    if (error) {
      // throw 400 error
      return `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`
    }

    if (!code) {
      return '<html><body><h1>Authorization Failed</h1><p>No authorization code received</p></body></html>'
    }

    // Store the code and state for the CLI to retrieve
    // The CLI will poll or use events to get this
    ;(globalThis as any).__oauthCallback = { code, state }

    return '<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>'
  },
})

wireHTTP({
  route: '/oauth/callback',
  method: 'get',
  func: oauthCallback,
})
