import { pikkuSessionlessFunc } from '#pikku'
import { validateAndBuildSecretDefinitionsMeta } from '@pikku/core/secret'

/**
 * pikku oauth status <credential-name>
 *
 * Check if tokens exist for an OAuth2 credential.
 */
export const oauthStatus = pikkuSessionlessFunc<
  { credentialName: string },
  void
>({
  internal: true,
  func: async ({ logger, getInspectorState, secrets }, { credentialName }) => {
    const inspectorState = await getInspectorState(false, false, false)

    const secretsMeta = validateAndBuildSecretDefinitionsMeta(
      inspectorState.secrets.definitions,
      inspectorState.schemaLookup
    )

    const credential = secretsMeta[credentialName]
    if (!credential) {
      logger.error(`Credential '${credentialName}' not found`)
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

    try {
      const token = await secrets.getSecretJSON<{
        accessToken: string
        refreshToken?: string
        expiresAt?: number
      }>(credential.oauth2.tokenSecretId)

      logger.info(`Token found for '${credentialName}'`)
      logger.info(`  Token Secret ID: ${credential.oauth2.tokenSecretId}`)
      logger.info(`  Has Refresh Token: ${token.refreshToken ? 'yes' : 'no'}`)

      if (token.expiresAt) {
        const expiresAt = new Date(token.expiresAt)
        const isExpired = expiresAt < new Date()
        logger.info(
          `  Expires: ${expiresAt.toISOString()} ${isExpired ? '(EXPIRED)' : ''}`
        )
      } else {
        logger.info(`  Expires: unknown`)
      }
    } catch {
      logger.info(`No token stored for '${credentialName}'`)
      logger.info(`  Token Secret ID: ${credential.oauth2.tokenSecretId}`)
      logger.info(`  Run 'pikku oauth:connect ${credentialName}' to authorize`)
    }
  },
})
