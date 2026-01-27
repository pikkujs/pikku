import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'
import { createServer, type Server } from 'http'
import { randomUUID } from 'crypto'
import open from 'open'
import { validateAndBuildCredentialsMeta } from '../../wirings/secrets/serialize-secrets-types.js'

interface OAuthCallbackResult {
  code: string
  state: string
}

/**
 * Mask a token for safe display in console output.
 * Shows first 6 and last 3 characters, with asterisks in between.
 */
function maskToken(token: string | undefined): string {
  if (!token) return '(none)'
  if (token.length <= 12) return '***'
  return `${token.slice(0, 6)}***${token.slice(-3)}`
}

const CALLBACK_PATH = '/oauth/callback'

/**
 * Start a temporary HTTP server to receive the OAuth callback
 */
function startCallbackServer(
  port: number,
  hostname: string,
  expectedState: string
): Promise<{ server: Server; callbackPromise: Promise<OAuthCallbackResult> }> {
  return new Promise((resolve) => {
    let callbackResolve: (result: OAuthCallbackResult) => void
    let callbackReject: (error: Error) => void

    const callbackPromise = new Promise<OAuthCallbackResult>((res, rej) => {
      callbackResolve = res
      callbackReject = rej
    })

    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${hostname}:${port}`)

      if (url.pathname === CALLBACK_PATH) {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(
            `<html><body><h1>OAuth Error</h1><p>${error}</p></body></html>`
          )
          callbackReject(new Error(`OAuth error: ${error}`))
          return
        }

        if (!code || !state) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><h1>Missing code or state</h1></body></html>')
          callbackReject(new Error('Missing code or state in callback'))
          return
        }

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><h1>Invalid state</h1></body></html>')
          callbackReject(new Error('Invalid state in callback'))
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          '<html><body><h1>Authorization successful!</h1><p>You can close this window.</p></body></html>'
        )
        callbackResolve({ code, state })
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.listen(port, hostname, () => {
      resolve({ server, callbackPromise })
    })
  })
}

/**
 * pikku oauth:connect <credential-name> [--output console|secret] [--url <url>]
 *
 * Connect to an OAuth2 provider by authorizing and obtaining tokens.
 * This command starts a temporary HTTP server to receive the callback.
 */
export const oauthConnect = pikkuSessionlessFunc<
  { credentialName: string; output?: string; url?: string },
  void
>({
  internal: true,
  func: async (
    { logger, getInspectorState, secrets },
    { credentialName, output, url }
  ) => {
    const inspectorState = await getInspectorState(false, false, false)

    // Build credentials meta from definitions
    const credentialsMeta = validateAndBuildCredentialsMeta(
      inspectorState.credentials.definitions,
      inspectorState.zodLookup
    )

    // Find the OAuth2 credential
    const credential = credentialsMeta[credentialName]
    if (!credential) {
      logger.error(`OAuth2 credential '${credentialName}' not found`)
      logger.info('Available OAuth2 credentials:')
      for (const name of Object.keys(credentialsMeta)) {
        const cred = credentialsMeta[name]
        if (cred.oauth2) {
          logger.info(`  - ${name}`)
        }
      }
      process.exit(1)
    }

    if (!credential.oauth2) {
      logger.error(`Credential '${credentialName}' is not an OAuth2 credential`)
      process.exit(1)
    }

    // Parse URL or use default
    const baseUrl = new URL(url || 'http://localhost:9876')
    const callbackHostname = baseUrl.hostname
    const callbackPort = parseInt(baseUrl.port) || 9876
    const callbackUri = `${baseUrl.protocol}//${baseUrl.host}${CALLBACK_PATH}`

    // Create OAuth2 client
    const oauth2Client = new OAuth2Client(
      credential.oauth2,
      credential.secretId,
      secrets
    )

    // Generate state for CSRF protection using cryptographically secure random
    const oauthState = randomUUID()

    // Get authorization URL
    const authUrl = await oauth2Client.getAuthorizationUrl(
      oauthState,
      callbackUri
    )

    logger.info(`Starting OAuth2 authorization for '${credentialName}'`)
    logger.info(`Callback URL: ${callbackUri}`)
    logger.info(`Authorization URL: ${authUrl}`)

    // Start callback server
    const { server, callbackPromise } = await startCallbackServer(
      callbackPort,
      callbackHostname,
      oauthState
    )
    logger.info(`Callback server listening on ${baseUrl.host}`)

    // Open browser
    logger.info('Opening browser...')
    open(authUrl).catch(() => {
      logger.warn(
        'Could not open browser automatically. Please open this URL manually:'
      )
      logger.info(authUrl)
    })

    let tokens: any
    try {
      // Wait for callback
      const callbackResult = await callbackPromise

      // Exchange code for tokens
      tokens = await oauth2Client.exchangeCode(callbackResult.code, callbackUri)

      logger.info('Authorization successful!')
    } finally {
      server.close()
    }

    // Output based on --output flag
    const outputMode = output || 'console'

    if (outputMode === 'console') {
      logger.info('Tokens received (masked for security):')
      logger.info(`  accessToken:  ${maskToken(tokens.accessToken)}`)
      logger.info(`  refreshToken: ${maskToken(tokens.refreshToken)}`)
      logger.info(
        `  expiresAt:    ${tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : '(none)'}`
      )
      logger.info(`  tokenType:    ${tokens.tokenType}`)
      logger.info(`  scope:        ${tokens.scope || '(none)'}`)
      logger.warn('')
      logger.warn(
        'WARNING: Raw tokens will be printed below. They may be stored in your shell history.'
      )
      logger.warn(
        'Consider using --output secret to store tokens directly in the secret service.'
      )
      logger.warn('')
      console.log(JSON.stringify(tokens, null, 2))
      logger.info(
        `\nTo store these tokens, set the secret '${credential.oauth2.tokenSecretId}' to the JSON above.`
      )
    } else if (outputMode === 'secret') {
      await secrets.setSecretJSON(credential.oauth2.tokenSecretId, tokens)
      logger.info(
        `Tokens stored in secret '${credential.oauth2.tokenSecretId}'`
      )
    }
  },
})
