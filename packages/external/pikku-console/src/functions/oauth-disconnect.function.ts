import { pikkuSessionlessFunc } from '#pikku'

export const oauthDisconnect = pikkuSessionlessFunc<{
  credentialName: string
}>({
  title: 'OAuth Disconnect',
  description:
    'Given a credentialName, reads secrets metadata from wiringService, validates the credential exists and is OAuth2, then deletes the stored tokens from secrets service using the tokenSecretId.',
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

    await secrets.deleteSecret(credential.oauth2.tokenSecretId)
    logger.info(`Tokens removed for '${credentialName}'`)
  },
})
