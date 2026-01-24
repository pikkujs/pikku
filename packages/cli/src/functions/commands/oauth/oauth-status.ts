import { pikkuSessionlessFunc } from '#pikku'

/**
 * pikku oauth status <credential-name>
 *
 * Check if tokens exist for an OAuth2 credential.
 */
export const oauthStatus: any = pikkuSessionlessFunc<
  { credentialName: string },
  void
>({
  internal: true,
  func: async ({ logger, getInspectorState, secrets }, { credentialName }) => {
    const inspectorState = await getInspectorState(false, false, false)

    // Find the OAuth2 credential
    const credential = inspectorState.credentials.meta[credentialName]
    if (!credential) {
      logger.error(`Credential '${credentialName}' not found`)
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
