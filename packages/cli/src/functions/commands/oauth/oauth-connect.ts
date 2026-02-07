import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client, type OAuth2Token } from '@pikku/core/oauth2'
import { createServer, type Server } from 'http'
import { randomUUID } from 'crypto'
import open from 'open'
import { validateAndBuildSecretDefinitionsMeta } from '../../wirings/secrets/serialize-secrets-types.js'

interface OAuthCallbackResult {
  code: string
  state: string
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

// TODO: These should be passed in via config
const CALLBACK_PATH = '/oauth/callback'
const DEFAULT_SERVER_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Start a temporary HTTP server to receive the OAuth callback
 */
function startCallbackServer(
  port: number,
  hostname: string,
  expectedState: string,
  timeoutMs: number = DEFAULT_SERVER_TIMEOUT_MS
): Promise<{ server: Server; callbackPromise: Promise<OAuthCallbackResult> }> {
  return new Promise((resolve) => {
    let callbackResolve: (result: OAuthCallbackResult) => void
    let callbackReject: (error: Error) => void
    let timeoutId: ReturnType<typeof setTimeout>

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
            `<html><body><h1>OAuth Error</h1><p>${escapeHtml(error)}</p></body></html>`
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
      // Set up timeout to close server if no callback is received
      timeoutId = setTimeout(() => {
        server.close()
        callbackReject(
          new Error(
            `OAuth callback timeout: no response received within ${Math.round(timeoutMs / 1000)} seconds`
          )
        )
      }, timeoutMs)

      // Wrap callbackPromise to clear timeout when resolved
      const wrappedPromise = callbackPromise.finally(() => {
        clearTimeout(timeoutId)
      })

      resolve({ server, callbackPromise: wrappedPromise })
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

    const secretsMeta = validateAndBuildSecretDefinitionsMeta(
      inspectorState.secrets.definitions,
      inspectorState.schemaLookup
    )

    const credential = secretsMeta[credentialName]
    if (!credential) {
      logger.error(`OAuth2 credential '${credentialName}' not found`)
      logger.error('Available OAuth2 credentials:')
      for (const name of Object.keys(secretsMeta)) {
        const cred = secretsMeta[name]
        if (cred.oauth2) {
          logger.error(`  - ${name}`)
        }
      }
      process.exit(1)
    }

    if (!credential.oauth2) {
      logger.error(`Credential '${credentialName}' is not an OAuth2 credential`)
      process.exit(1)
    }

    const baseUrl = new URL(url || 'http://localhost:9876')
    const callbackHostname = baseUrl.hostname
    const callbackPort = parseInt(baseUrl.port) || 9876
    const callbackUri = `${baseUrl.protocol}//${baseUrl.host}${CALLBACK_PATH}`

    const oauth2Client = new OAuth2Client(
      credential.oauth2,
      credential.secretId,
      secrets
    )

    const oauthState = randomUUID()
    const authUrl = await oauth2Client.getAuthorizationUrl(
      oauthState,
      callbackUri
    )

    logger.info(`Starting OAuth2 authorization for '${credentialName}'`)
    logger.info(`Callback URL: ${callbackUri}`)
    logger.info(`Authorization URL: ${authUrl}`)

    const { server, callbackPromise } = await startCallbackServer(
      callbackPort,
      callbackHostname,
      oauthState
    )
    logger.info(`Callback server listening on ${baseUrl.host}`)

    logger.info('Opening browser...')
    open(authUrl).catch(() => {
      logger.warn(
        'Could not open browser automatically. Please open this URL manually:'
      )
      logger.info(authUrl)
    })

    let tokens: OAuth2Token
    try {
      const callbackResult = await callbackPromise
      tokens = await oauth2Client.exchangeCode(callbackResult.code, callbackUri)
      logger.info('Authorization successful!')
    } finally {
      server.close()
    }

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
