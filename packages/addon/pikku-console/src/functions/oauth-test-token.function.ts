import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'

export const oauthTestToken = pikkuSessionlessFunc<
  { credentialName: string },
  { valid: boolean; error?: string }
>({
  description:
    'Given a credentialName, validates the credential exists and is OAuth2, then attempts to retrieve a valid access token via the OAuth2Client. Returns whether the token is valid or an error message.',
  expose: true,
  func: async ({ metaService, secrets }, { credentialName }) => {
    const secretsMeta = await metaService.getSecretsMeta()
    const credentialsMeta = await metaService.getCredentialsMeta()

    const credential =
      secretsMeta[credentialName] ?? credentialsMeta[credentialName]
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
