import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'

export const oauthRefreshToken = pikkuSessionlessFunc<
  { credentialName: string },
  { success: boolean; error?: string }
>({
  title: 'OAuth Refresh Token',
  description:
    'Given a credentialName, validates the credential exists and is OAuth2, then uses the OAuth2Client to force a token refresh using the stored refresh token. Returns success or an error message.',
  expose: true,
  func: async ({ logger, wiringService, secrets }, { credentialName }) => {
    const secretsMeta = await wiringService.readSecretsMeta()

    const credential = secretsMeta[credentialName]
    if (!credential) {
      throw new Error(`Credential '${credentialName}' not found`)
    }

    if (!credential.oauth2) {
      throw new Error(
        `Credential '${credentialName}' is not an OAuth2 credential`
      )
    }

    const oauth2Client = new OAuth2Client(
      credential.oauth2,
      credential.secretId,
      secrets
    )

    try {
      await oauth2Client.getAccessToken()
      logger.info(`Token refreshed for '${credentialName}'`)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})
