import { pikkuSessionlessFunc, pikkuVoidFunc } from '#pikku'

/**
 * pikku oauth disconnect <credential-name>
 *
 * Remove stored tokens for an OAuth2 credential.
 */
export const oauthDisconnect: any = pikkuSessionlessFunc<{
  credentialName: string
}>({
  internal: true,
  func: async ({ logger, getInspectorState, secrets }, { credentialName }) => {
    const inspectorState = await getInspectorState(false, false, false)

    // Find the OAuth2 credential
    const credential = inspectorState.credentials.meta[credentialName]
    if (!credential) {
      logger.error(`Credential '${credentialName}' not found`)
      process.exit(1)
    }

    if (!credential.oauth2) {
      logger.error(`Credential '${credentialName}' is not an OAuth2 credential`)
      process.exit(1)
    }

    // Check if secrets service supports deletion
    if (
      'deleteSecret' in secrets &&
      typeof (secrets as any).deleteSecret === 'function'
    ) {
      try {
        await (secrets as any).deleteSecret(credential.oauth2.tokenSecretId)
        logger.info(`Tokens removed for '${credentialName}'`)
      } catch (err: any) {
        logger.error(`Failed to remove tokens: ${err.message}`)
        process.exit(1)
      }
    } else {
      logger.warn(
        `SecretService does not support deletion. To remove tokens manually:`
      )
      logger.info(`  Delete the secret: ${credential.oauth2.tokenSecretId}`)
    }
  },
})
