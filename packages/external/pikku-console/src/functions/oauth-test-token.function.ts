import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'

export const oauthTestToken = pikkuSessionlessFunc<
  { credentialName: string },
  { valid: boolean; error?: string }
>({
  title: 'OAuth Test Token',
  description:
    'Given a credentialName, validates the credential exists and is OAuth2, then attempts to retrieve a valid access token via the OAuth2Client. Returns whether the token is valid or an error message.',
  expose: true,
  func: async ({ wiringService, secrets }, { credentialName }) => {
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
      return { valid: true }
    } catch (err: any) {
      return { valid: false, error: err.message }
    }
  },
})
