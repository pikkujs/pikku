import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'
import open from 'open'

/**
 * pikku oauth connect <credential-name> [--output console|secret] [--redirect-uri <uri>]
 *
 * Connect to an OAuth2 provider by authorizing and obtaining tokens.
 * This command opens a browser for authorization and waits for the callback
 * to be received by the /oauth/callback wireHTTP route.
 *
 * Note: Your Pikku server must be running and serving the /oauth/callback route.
 */
export const oauthConnect: any = pikkuSessionlessFunc<
  { credentialName: string; output?: string; redirectUri?: string },
  void
>({
  internal: true,
  func: async (
    { logger, getInspectorState, secrets, oauthCallback },
    { credentialName, output, redirectUri }
  ) => {
    const inspectorState = await getInspectorState(false, false, false)

    // Find the OAuth2 credential
    const credential = inspectorState.credentials.meta[credentialName]
    if (!credential) {
      logger.error(`OAuth2 credential '${credentialName}' not found`)
      logger.info('Available OAuth2 credentials:')
      for (const name of Object.keys(inspectorState.credentials.meta)) {
        const cred = inspectorState.credentials.meta[name]
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

    // Use provided redirectUri or default
    const callbackUri = redirectUri || 'http://localhost:3000/oauth/callback'

    // Create OAuth2 client
    const oauth2Client = new OAuth2Client(
      credential.oauth2,
      credential.secretId,
      secrets
    )

    // Generate state for CSRF protection
    const oauthState = Math.random().toString(36).substring(2, 15)

    // Get authorization URL
    const authUrl = await oauth2Client.getAuthorizationUrl(
      oauthState,
      callbackUri
    )

    logger.info(`Starting OAuth2 authorization for '${credentialName}'`)
    logger.info(`Callback URL: ${callbackUri}`)
    logger.info(
      `Make sure your Pikku server is running and serving the /oauth/callback route`
    )

    // Start waiting for callback (registers the state)
    const callbackPromise = oauthCallback.waitForCallback(oauthState)

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
      // Wait for callback from wireHTTP route
      const callbackResult = await callbackPromise

      // Exchange code for tokens
      tokens = await oauth2Client.exchangeCode(callbackResult.code, callbackUri)

      logger.info('Authorization successful!')
    } catch (err) {
      oauthCallback.cancelCallback(oauthState)
      throw err
    }

    // Output based on --output flag
    const outputMode = output || 'console'

    if (outputMode === 'console') {
      logger.info('Tokens received:')
      console.log(JSON.stringify(tokens, null, 2))
      logger.info(
        `\nTo store these tokens, set the secret '${credential.oauth2.tokenSecretId}' to the JSON above.`
      )
    } else if (outputMode === 'secret') {
      // Check if secrets service supports writing
      if (
        'setSecretJSON' in secrets &&
        typeof (secrets as any).setSecretJSON === 'function'
      ) {
        await (secrets as any).setSecretJSON(
          credential.oauth2.tokenSecretId,
          tokens
        )
        logger.info(
          `Tokens stored in secret '${credential.oauth2.tokenSecretId}'`
        )
      } else {
        logger.error(
          'SecretService does not support writing. Outputting to console instead:'
        )
        console.log(JSON.stringify(tokens, null, 2))
      }
    }
  },
})
