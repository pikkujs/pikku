import { pikkuSessionlessFunc } from '#pikku'
import { validateAndBuildCredentialsMeta } from '../../wirings/secrets/serialize-secrets-types.js'

/**
 * pikku oauth disconnect <credential-name>
 * TODO: Document
 *
 * Remove stored tokens for an OAuth2 credential.
 */
export const oauthDisconnect = pikkuSessionlessFunc<{
  credentialName: string
}>({
  internal: true,
  func: async ({ logger, getInspectorState, secrets }, { credentialName }) => {
    const inspectorState = await getInspectorState(false, false, false)

    const credentialsMeta = validateAndBuildCredentialsMeta(
      inspectorState.credentials.definitions,
      inspectorState.schemaLookup
    )

    const credential = credentialsMeta[credentialName]
    if (!credential) {
      logger.error(`Credential '${credentialName}' not found`)
      process.exit(1)
    }

    if (!credential.oauth2) {
      logger.error(`Credential '${credentialName}' is not an OAuth2 credential`)
      process.exit(1)
    }

    try {
      await secrets.deleteSecret(credential.oauth2.tokenSecretId)
      logger.info(`Tokens removed for '${credentialName}'`)
    } catch (err: any) {
      logger.error(`Failed to remove tokens: ${err.message}`)
      process.exit(1)
    }
  },
})
