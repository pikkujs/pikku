import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'
import { randomUUID } from 'crypto'

export const oauthConnect = pikkuSessionlessFunc<
  { credentialName: string; callbackUrl?: string; userId?: string },
  { authUrl: string }
>({
  title: 'OAuth Connect',
  description:
    'Given a credentialName and optional callbackUrl, reads secrets metadata from wiringService, validates the credential exists and is OAuth2, creates an OAuth2Client, generates a random state UUID, builds the authorization URL, stores the pending flow in oauthService, and returns the authUrl. Defaults callbackUrl to http://localhost:7070/oauth/callback.',
  expose: true,
  func: async (
    { logger, metaService, secrets, oauthService },
    { credentialName, callbackUrl, userId }
  ) => {
    const secretsMeta = await metaService.getSecretsMeta()
    const credentialsMeta = await metaService.getCredentialsMeta()

    const credential =
      secretsMeta[credentialName] ?? credentialsMeta[credentialName]
    if (!credential) {
      const available = [
        ...Object.keys(secretsMeta).filter((name) => secretsMeta[name].oauth2),
        ...Object.keys(credentialsMeta).filter(
          (name) => credentialsMeta[name].oauth2
        ),
      ]
      throw new Error(
        `OAuth2 credential '${credentialName}' not found. Available: ${available.join(', ') || 'none'}`
      )
    }

    if (!credential.oauth2) {
      throw new Error(
        `Credential '${credentialName}' is not an OAuth2 credential`
      )
    }

    const resolvedCallbackUrl =
      callbackUrl || 'http://localhost:7070/oauth/callback'

    const appSecretId =
      (credential.oauth2 as any).appCredentialSecretId ?? credential.secretId
    const hasSecret = await secrets.hasSecret(appSecretId)
    if (!hasSecret) {
      throw new Error(
        `OAuth2 app credentials not configured. Set the secret "${appSecretId}" in Config > Secrets with your clientId and clientSecret.`
      )
    }

    const oauth2Client = new OAuth2Client(
      credential.oauth2,
      appSecretId,
      secrets
    )

    const state = randomUUID()
    const authUrl = await oauth2Client.getAuthorizationUrl(
      state,
      resolvedCallbackUrl
    )

    oauthService.addPendingFlow(state, {
      credentialName,
      oauth2: credential.oauth2,
      secretId: appSecretId,
      callbackUrl: resolvedCallbackUrl,
      userId,
      createdAt: Date.now(),
    })

    logger.info(`Starting OAuth2 authorization for '${credentialName}'`)
    logger.info(`Callback URL: ${resolvedCallbackUrl}`)

    return { authUrl }
  },
})
