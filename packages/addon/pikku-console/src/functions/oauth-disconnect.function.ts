import { pikkuSessionlessFunc } from '#pikku'

export const oauthDisconnect = pikkuSessionlessFunc<{
  credentialName: string
}>({
  description:
    'Given a credentialName, reads secrets metadata from wiringService, validates the credential exists and is OAuth2, then deletes the stored tokens from credential service (or secrets as fallback).',
  expose: true,
  func: async (
    { logger, metaService, secrets, credentialService },
    { credentialName }
  ) => {
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

    if (credentialService) {
      await credentialService.delete(credentialName)
    } else {
      await secrets.deleteSecret(credential.oauth2.tokenSecretId)
    }

    logger.info(`Tokens removed for '${credentialName}'`)
  },
})
